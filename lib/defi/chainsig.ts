import { networkEnv } from "@/lib/near/env";
import { failoverProvider, withRpcRetry } from "@/lib/near/rpc";
import { Account, JsonRpcProvider, actions, base64Decode } from "near-api-js";
import { keccak256, recoverAddress, type Hex } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { near } from "@/lib/near/config";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const rpc = () => networkEnv("NEAR_RPC_URL") || near.rpcUrl;
function env(name: string) {
  const v = networkEnv(name);
  if (!v) throw new Error(`Server is missing ${name}`);
  return v;
}
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const orderlyPath = (nearAccountId: string) =>
  `orderly/${nearAccountId}`;

function b58ToHex(s: string, bytes: number) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(i);
  }
  return n.toString(16).padStart(bytes * 2, "0");
}
const addrCache = new Map<string, string>();
/** EVM address controlled by NEAR MPC for (CHAINSIG account, path). Read from the MPC contract's own view. */
export async function derivedEvmAddress(
  nearAccountId: string,
): Promise<string> {
  const path = orderlyPath(nearAccountId);
  const key = `${near.network}:${env("CHAINSIG_ACCOUNT_ID")}:${path}`;
  if (addrCache.has(key)) return addrCache.get(key)!;
  const r = await fetch(rpc(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: near.mpcContract,
        method_name: "derived_public_key",
        args_base64: btoa(
          JSON.stringify({
            path,
            predecessor: env("CHAINSIG_ACCOUNT_ID"),
            domain_id: 0,
          }),
        ),
      },
    }),
  });
  const d = await r.json();
  if (!Array.isArray(d.result?.result))
    throw new Error("MPC derived_public_key failed");
  const pk: string = JSON.parse(
    new TextDecoder().decode(new Uint8Array(d.result.result)),
  );
  const raw = b58ToHex(pk.split(":")[1], 64);
  const addr = "0x" + keccak256(("0x" + raw) as Hex).slice(-40);
  addrCache.set(key, addr);
  return addr;
}

/** Signs a 32-byte digest with NEAR Chain Signatures (MPC). Returns a 65-byte 0x r||s||v signature and the NEAR tx hash. */
export async function mpcSignDigest(
  nearAccountId: string,
  digest: Hex,
  timeoutMs = 45_000,
): Promise<{ signature: Hex; txHash: string }> {
  const acc = new Account(
    env("CHAINSIG_ACCOUNT_ID"),
    failoverProvider(),
    env("CHAINSIG_PRIVATE_KEY") as `ed25519:${string}`,
  );
  const send = withRpcRetry(() =>
    acc.signAndSendTransaction({
      receiverId: near.mpcContract,
      waitUntil: "FINAL",
      throwOnFailure: false,
      actions: [
        actions.functionCall(
          "sign",
          {
            request: {
              payload_v2: { Ecdsa: digest.slice(2) },
              path: orderlyPath(nearAccountId),
              domain_id: 0,
            },
          },
          300_000_000_000_000n,
          1n,
        ),
      ],
    } as any),
  );
  const r: any = await Promise.race([
    send,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error("MPC sign timeout")), timeoutMs),
    ),
  ]);
  const sv = r?.status?.SuccessValue;
  if (typeof sv !== "string" || !sv)
    throw new Error(
      "MPC sign failed: " + JSON.stringify(r?.status).slice(0, 200),
    );
  const res = JSON.parse(new TextDecoder().decode(base64Decode(sv)));
  const R: string = res.big_r.affine_point,
    s: string = res.s.scalar,
    v: number = res.recovery_id;
  const signature = ("0x" + R.slice(2) + s + (27 + v).toString(16)) as Hex;
  const recovered = await recoverAddress({ hash: digest, signature });
  if (
    recovered.toLowerCase() !==
    (await derivedEvmAddress(nearAccountId)).toLowerCase()
  )
    throw new Error("MPC signature did not recover to the derived address");
  return { signature, txHash: r.transaction.hash };
}

/** Fallback: server-derived secp256k1 key (HMAC of a server secret). Clearly labelled in the UI. */
function fallbackKey(nearAccountId: string) {
  return hmac(
    sha256,
    new TextEncoder().encode(env("ORDERLY_DERIVE_SECRET")),
    new TextEncoder().encode(
      (near.network === "testnet" ? "evm:" : "mainnet:evm:") + nearAccountId,
    ),
  );
}
export function fallbackAddress(nearAccountId: string) {
  const pub = secp256k1
    .getPublicKey(fallbackKey(nearAccountId), false)
    .slice(1);
  return "0x" + keccak256(("0x" + hex(pub)) as Hex).slice(-40);
}
export function fallbackSign(nearAccountId: string, digest: Hex): Hex {
  const sig = secp256k1.sign(digest.slice(2), fallbackKey(nearAccountId), {
    lowS: true,
  });
  return ("0x" +
    sig.r.toString(16).padStart(64, "0") +
    sig.s.toString(16).padStart(64, "0") +
    (27 + sig.recovery).toString(16)) as Hex;
}

export type SignerMode = "chain-signatures" | "server-derived";
/** Chain Signatures unless LEASH_PERPS_SIGNER=fallback; an account keeps the mode it registered with. */
export async function signerFor(nearAccountId: string, mode: SignerMode) {
  if (mode === "chain-signatures") {
    const address = await derivedEvmAddress(nearAccountId);
    return {
      mode,
      address,
      sign: async (d: Hex) => (await mpcSignDigest(nearAccountId, d)).signature,
    };
  }
  if (near.network === "mainnet")
    throw new Error(
      "Mainnet perps require Chain Signatures; server-derived fallback is testnet only",
    );
  return {
    mode,
    address: fallbackAddress(nearAccountId),
    sign: async (d: Hex) => fallbackSign(nearAccountId, d),
  };
}
