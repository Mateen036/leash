"use client";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import {
  loadMainnetManifest,
  MAINNET_STORAGE_PREFIX,
} from "./wallet-isolation";
import type { DepositPlan } from "./server";
import { isMainnetAccount, assertDeadline, assertCap } from "./validation";
let connector: Promise<NearConnector> | undefined;
/** Independent instance AND independent selection storage. Never switch the testnet connector. */
export function mainnetConnector() {
  if (!connector)
    connector = import("@hot-labs/near-connect")
      .then(
        async ({ NearConnector }) =>
          new NearConnector({
            manifest: await loadMainnetManifest(),
            autoConnect: false,
            network: "mainnet",
            features: { signAndSendTransaction: true },
            providers: { mainnet: ["https://rpc.mainnet.near.org"] },
            storage: {
              async get(k) {
                return localStorage.getItem(`${MAINNET_STORAGE_PREFIX}${k}`);
              },
              async set(k, v) {
                localStorage.setItem(`${MAINNET_STORAGE_PREFIX}${k}`, v);
              },
              async remove(k) {
                localStorage.removeItem(`${MAINNET_STORAGE_PREFIX}${k}`);
              },
            },
            footerBranding: {
              heading: "REAL MONEY · NEAR mainnet",
              link: "https://near.org",
              linkText: "NEAR",
            },
          }),
      )
      .catch((error) => {
        connector = undefined;
        throw error;
      });
  return connector;
}
export type MainnetSession = { accountId: string; wallet: NearWalletBase };
export async function connectMainnet(): Promise<MainnetSession> {
  const c = await mainnetConnector(),
    wallet = await c.connect();
  const accounts = await wallet.getAccounts({ network: "mainnet" }),
    accountId = accounts[0]?.accountId;
  if (!accountId || !isMainnetAccount(accountId))
    throw new Error(
      "Select a NEAR mainnet account; testnet cannot sign mainnet deposits",
    );
  return { accountId, wallet };
}
export async function disconnectMainnet() {
  await (await mainnetConnector()).disconnect();
}
/** Only used when signing never started, or the wallet explicitly rejected the request. */
export class DepositNotSentError extends Error {}
export async function signDeposit(session: MainnetSession, plan: DepositPlan) {
  if (
    !isMainnetAccount(session.accountId) ||
    plan.sourceAccount !== session.accountId
  )
    throw new DepositNotSentError(
      "Mainnet account changed; prepare a bridge quote again",
    );
  const accounts = await session.wallet
    .getAccounts({ network: "mainnet" })
    .catch(() => {
      throw new DepositNotSentError(
        "Could not check the wallet account; no signing request was sent",
      );
    });
  if (accounts[0]?.accountId !== session.accountId)
    throw new DepositNotSentError(
      "Wallet account changed; reconnect and prepare again",
    );
  try {
    assertDeadline(plan.deadline);
    assertCap(plan.totalUsd, "Total including fees");
  } catch (e) {
    throw new DepositNotSentError(
      e instanceof Error ? e.message : "Quote expired",
    );
  }
  const outcome = await session.wallet
    .signAndSendTransaction({
      network: "mainnet",
      signerId: session.accountId,
      receiverId: plan.receiverId,
      actions: plan.actions,
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      if (
        (error as { code?: number })?.code === 4001 ||
        /user (?:rejected|denied)|rejected by (?:the )?user/i.test(message)
      )
        throw new DepositNotSentError(
          "Wallet rejected the signing request; no deposit was sent",
        );
      // Timeouts, closed windows, missing hashes and other ambiguous errors stay locked for inspection.
      throw error;
    });
  const result = outcome as unknown as {
    status?: Record<string, unknown>;
    transaction?: { hash?: string };
    transaction_outcome?: { id?: string };
    receipts_outcome?: { outcome: { status?: Record<string, unknown> } }[];
  };
  const failed =
    (result.status && "Failure" in result.status) ||
    result.receipts_outcome?.some(
      (r) => r.outcome.status && "Failure" in r.outcome.status,
    );
  const txHash = result.transaction?.hash || result.transaction_outcome?.id;
  // Keep a hash even on failure so the user can inspect the actual receipt.
  if (!txHash)
    throw new Error(
      "Wallet returned no transaction hash. Check wallet history before retrying; do not send a duplicate deposit.",
    );
  return { txHash, failed: !!failed };
}
