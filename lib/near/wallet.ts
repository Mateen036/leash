"use client";
import { networkFetch } from "@/lib/near/network";

import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { base64Encode } from "near-api-js";
import { networkKey } from "./network";
import { isMainnetAccount } from "../bridge/validation";
import { near } from "./config";
import type { Call, RelayResult } from "./client";

/** NEP-413 recipient; must match NEP413_RECIPIENT on the server. */
export const NEP413_RECIPIENT = "leash";
export const TESTNET_FAUCET = "https://docs.near.org/getting-started/faucet";
/** Below this many yoctoNEAR a wallet probably cannot pay gas for the setup transactions. */
export const LOW_NEAR = 300_000_000_000_000_000_000_000n; // 0.3 NEAR (gas is prepaid at the max, then refunded)

function validAccount(id: string) {
  return near.network === "mainnet"
    ? isMainnetAccount(id)
    : id.endsWith(".testnet") || /^[0-9a-f]{64}$/.test(id);
}
let connector: NearConnector | null = null;
/** One NEAR Connect instance for the selected network, created lazily after network hydration. */
export async function getConnector(): Promise<NearConnector> {
  if (connector) return connector;
  const { NearConnector } = await import("@hot-labs/near-connect");
  connector = new NearConnector({
    network: near.network,
    features: {
      ...(near.network === "testnet" ? { testnet: true } : {}),
      signMessage: true,
      signAndSendTransaction: true,
    },
    providers: { [near.network]: [near.rpcUrl] },
    storage: {
      async get(k) {
        return localStorage.getItem(networkKey(`leash:wallet:${k}`));
      },
      async set(k, v) {
        localStorage.setItem(networkKey(`leash:wallet:${k}`), v);
      },
      async remove(k) {
        localStorage.removeItem(networkKey(`leash:wallet:${k}`));
      },
    },
    footerBranding: {
      heading: `Leash · NEAR ${near.network}`,
      link: "https://github.com/Mateen036/leash",
      linkText: "Source",
    },
  });
  return connector;
}

export type WalletSession = {
  accountId: string;
  network: "testnet" | "mainnet";
  wallet: NearWalletBase;
  walletName: string;
};

export async function restoreWallet(): Promise<WalletSession | null> {
  try {
    const c = await getConnector();
    const { wallet, accounts } = await c.getConnectedWallet();
    if (!accounts[0] || !validAccount(accounts[0].accountId)) return null;
    return {
      accountId: accounts[0].accountId,
      network: near.network,
      wallet,
      walletName: wallet.manifest.name,
    };
  } catch {
    return null;
  }
}

export async function connectWallet(): Promise<WalletSession> {
  const c = await getConnector();
  const wallet = await c.connect();
  const accounts = await wallet.getAccounts({ network: near.network });
  if (!accounts[0]) throw new Error("The wallet did not return an account");
  if (!validAccount(accounts[0].accountId))
    throw new Error(`Select an account on NEAR ${near.network}.`);
  return {
    accountId: accounts[0].accountId,
    network: near.network,
    wallet,
    walletName: wallet.manifest.name,
  };
}

export async function disconnectWallet() {
  const c = await getConnector();
  await c.disconnect().catch(() => {});
}

function failureOf(outcome: any): string | null {
  const s = outcome?.status;
  if (s && typeof s === "object" && "Failure" in s)
    return JSON.stringify(s.Failure).slice(0, 300);
  for (const o of outcome?.receipts_outcome || []) {
    const st = o.outcome?.status;
    if (st && typeof st === "object" && "Failure" in st)
      return JSON.stringify(st.Failure).slice(0, 300);
  }
  return null;
}
const cleanPanic = (t: string) =>
  (t.match(/panicked: ([^"\\]+)/)?.[1] ?? t).slice(0, 300);

/** The wallet signs and pays gas for the same calls a guest would send through the relayer. */
export async function walletSend(
  session: WalletSession,
  receiverId: string,
  calls: Call[],
): Promise<RelayResult> {
  if (session.network !== near.network || !validAccount(session.accountId))
    throw new Error("Wallet network changed. Reconnect your wallet.");
  const outcome: any = await session.wallet.signAndSendTransaction({
    network: near.network,
    signerId: session.accountId,
    receiverId,
    actions: calls.map((c) => ({
      type: "FunctionCall" as const,
      params: {
        methodName: c.method,
        args: c.args as Record<string, unknown>,
        gas: String(c.gas ?? 50_000_000_000_000n),
        deposit: String(c.deposit ?? 0n),
      },
    })),
  });
  const fail = failureOf(outcome);
  return {
    txHash:
      outcome?.transaction?.hash || outcome?.transaction_outcome?.id || "",
    ok: !fail,
    error: fail ? cleanPanic(fail) : null,
  };
}

/** Asks the wallet to sign `parts|timestamp` as a NEP-413 message, so the server knows this account approved the order. */
export async function walletSignRequest(
  session: WalletSession,
  parts: string[],
) {
  if (session.network !== near.network)
    throw new Error("Reconnect your wallet on this network.");
  const message = [near.network, ...parts, String(Date.now())].join("|");
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const signed = await session.wallet.signMessage({
    message,
    recipient: NEP413_RECIPIENT,
    nonce,
    network: near.network,
    signerId: session.accountId,
  });
  return {
    kind: "nep413" as const,
    accountId: signed.accountId || session.accountId,
    message,
    publicKey: signed.publicKey,
    signature: signed.signature,
    nonce: base64Encode(nonce),
  };
}

/** Native NEAR balance (yoctoNEAR) of any account, via RPC. */
export async function nearBalance(accountId: string): Promise<bigint> {
  const r = await networkFetch(near.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "bal",
      method: "query",
      params: {
        request_type: "view_account",
        finality: "optimistic",
        account_id: accountId,
      },
    }),
  });
  const j = await r.json();
  if (j.error || j.result?.error) return 0n;
  return BigInt(j.result.amount);
}
