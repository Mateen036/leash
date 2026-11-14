import {
  Account,
  JsonRpcProvider,
  KeyPair,
  PublicKey,
  actions,
  decodeSignedDelegate,
  base64Decode,
  nearToYocto,
} from "near-api-js";
import { verifyMessage } from "near-api-js/nep413";
import { near, isGuestAccount } from "./config";
import { failoverProvider, rpcCall, withRpcRetry } from "./rpc";
import { rejectReason, type RelayAction } from "./relay-policy";

export class NearError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function env(name: string) {
  const value = process.env[name];
  if (!value)
    throw new NearError(`Server is missing ${name}. See .env.example.`, 503);
  return value;
}
const provider = () => failoverProvider();
export const relayerAccount = () => relayer();
const relayer = () =>
  new Account(
    env("RELAYER_ACCOUNT_ID"),
    provider(),
    env("RELAYER_PRIVATE_KEY") as `ed25519:${string}`,
  );

export function hashOf(result: { transaction: { hash: string } }) {
  return result.transaction.hash;
}

function failure(result: any): string | null {
  const s = result?.status;
  if (s && typeof s === "object" && "Failure" in s)
    return JSON.stringify(s.Failure).slice(0, 400);
  for (const o of result?.receipts_outcome || []) {
    const st = o.outcome?.status;
    if (st && typeof st === "object" && "Failure" in st)
      return JSON.stringify(st.Failure).slice(0, 400);
  }
  return null;
}

/** Returns the decoded JSON return value of the transaction's last receipt, if any. */
function returnValue(result: any): unknown {
  const s = result?.status;
  if (
    s &&
    typeof s === "object" &&
    typeof s.SuccessValue === "string" &&
    s.SuccessValue
  ) {
    try {
      return JSON.parse(new TextDecoder().decode(base64Decode(s.SuccessValue)));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Creates a named guest sub-account owned by the browser's own key. Relayer funds 0.8 testnet NEAR. */
export async function createGuest(publicKey: string) {
  const pk = PublicKey.fromString(publicKey);
  if (pk.keyType !== 0) throw new NearError("Use an ed25519 key");
  const prefix = `g-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join("")}`;
  const result = await withRpcRetry(() => relayer().createSubAccount({
    accountOrPrefix: prefix,
    publicKey: pk.toString(),
    nearToTransfer: nearToYocto(
      (process.env.GUEST_FUND_NEAR || "1.2") as `${number}`,
    ),
  }));
  const reason = failure(result);
  if (reason) throw new NearError(`Account creation failed: ${reason}`, 502);
  return { accountId: `${prefix}.${near.root}`, txHash: hashOf(result) };
}

/** NEP-366 relayer: sponsors gas only for allow-listed calls to our two contracts. */
export async function relay(signedDelegateBase64: string) {
  let signed;
  try {
    signed = decodeSignedDelegate(base64Decode(signedDelegateBase64));
  } catch {
    throw new NearError("Malformed signed delegate");
  }
  const d = signed.delegateAction;
  const actions: RelayAction[] = d.actions.map((a: any) =>
    a.functionCall
      ? {
          methodName: a.functionCall.methodName,
          args: new Uint8Array(a.functionCall.args),
          gas: BigInt(a.functionCall.gas),
          deposit: BigInt(a.functionCall.deposit),
        }
      : null,
  );
  const reason = rejectReason({
    senderId: d.senderId,
    receiverId: d.receiverId,
    actions,
  });
  if (reason) throw new NearError(reason, 403);
  try {
    const result = await withRpcRetry(() => relayer().relayMetaTransaction(signed));
    const fail = failure(result);
    return {
      txHash: hashOf(result),
      ok: !fail,
      error: fail,
      value: returnValue(result),
    };
  } catch (error) {
    return thrown(error);
  }
}

function cleanPanic(text: string) {
  const m = text.match(/panicked: ([^"\\]+)/);
  return (m ? m[1] : text).slice(0, 300);
}

/** near-api-js throws on contract panics; keep the tx hash so the UI can still link it. */
function thrown(error: any) {
  const message = cleanPanic(String(error?.message || error));
  return {
    txHash: String(error?.txHash || ""),
    ok: false,
    error: message,
    value: undefined,
  };
}

/** Verifies that `accountId` signed `message` with one of its current access keys. */
export async function verifyAccountSignature(
  accountId: string,
  message: string,
  publicKey: string,
  signatureB64: string,
  maxAgeMs = 5 * 60_000,
) {
  const ts = Number(message.split("|").pop());
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > maxAgeMs)
    throw new NearError("Signed request expired", 401);
  const pk = PublicKey.fromString(publicKey);
  if (!pk.verify(new TextEncoder().encode(message), base64Decode(signatureB64)))
    throw new NearError("Bad signature", 401);
  if (!(await accessKeyExists(accountId, pk.toString())))
    throw new NearError("That key does not belong to this account", 401);
}

/** view_access_key with fallback RPCs: transport/rate-limit errors are retried, only a definitive "no such key" returns false. */
async function accessKeyExists(accountId: string, publicKey: string) {
  try {
    const d = await rpcCall("query", {
      request_type: "view_access_key",
      finality: "optimistic",
      account_id: accountId,
      public_key: publicKey,
    });
    if (d.result?.permission) return true;
    if (/UNKNOWN_ACCESS_KEY|UNKNOWN_ACCOUNT|does not exist/i.test(JSON.stringify(d.error || d.result?.error || "")))
      return false;
  } catch {
    /* every RPC failed */
  }
  throw new NearError("NEAR RPC is busy, please retry", 503);
}

/** Recipient string wallets sign into NEP-413 messages for this app. */
export const NEP413_RECIPIENT = "leash";
export type WalletAuth = {
  kind: "nep413";
  accountId: string;
  message: string;
  publicKey: string;
  signature: string;
  nonce: string;
};
const seenNonces = new Map<string, number>();

/** Decodes a wallet signature: NEP-413 says base64, a few wallets return base58. */
function signatureBytes(sig: string): Uint8Array {
  try {
    const b = base64Decode(sig);
    if (b.length === 64) return b;
  } catch {
    /* try base58 */
  }
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of sig.replace(/^ed25519:/, "")) {
    const i = alphabet.indexOf(c);
    if (i < 0) throw new NearError("Bad signature encoding", 401);
    n = n * 58n + BigInt(i);
  }
  const out = new Uint8Array(64);
  for (let i = 63; i >= 0; i--) {
    out[i] = Number(n & 255n);
    n >>= 8n;
  }
  return out;
}

/** Verifies a NEP-413 message signed by a connected wallet (any testnet account, full-access key). */
export async function verifyWalletSignature(
  auth: WalletAuth,
  maxAgeMs = 5 * 60_000,
) {
  const ts = Number(auth.message.split("|").pop());
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > maxAgeMs)
    throw new NearError("Signed request expired", 401);
  const nonce = base64Decode(auth.nonce);
  if (nonce.length !== 32) throw new NearError("Bad nonce", 401);
  const now = Date.now();
  for (const [k, t] of seenNonces) if (now - t > maxAgeMs) seenNonces.delete(k);
  if (seenNonces.has(auth.nonce))
    throw new NearError("Signed request already used", 401);
  try {
    await verifyMessage({
      signerAccountId: auth.accountId,
      signerPublicKey: auth.publicKey,
      payload: { message: auth.message, recipient: NEP413_RECIPIENT, nonce },
      signature: signatureBytes(auth.signature),
      provider: provider(),
    });
  } catch (error) {
    if (error instanceof NearError) throw error;
    throw new NearError(
      `Wallet signature rejected: ${String((error as Error)?.message || error).slice(0, 160)}`,
      401,
    );
  }
  seenNonces.set(auth.nonce, now);
}

export { isGuestAccount, KeyPair };
