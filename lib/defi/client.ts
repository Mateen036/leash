"use client";
import { Account, JsonRpcProvider } from "near-api-js";
import { near } from "@/lib/near/config";
import { signRequest, type Guest } from "@/lib/near/client";
import deployment from "@/lib/near/deployment.testnet.json";
import {
  defaultPolicy, installGuardActions, pauseTransaction, unpauseTransaction, revokeAgentTransaction, setPolicyTransaction,
  type GuardAction, type GuardPolicy, type GuardTransaction,
} from "@/lib/near/guard";
import { actionDigest } from "./tokens";

export type DefiState = Awaited<ReturnType<typeof import("./server").accountState>>;
export type ExecResult = { ok: boolean; txHash: string; error: string | null; value?: unknown };

async function json<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !("txHash" in j)) throw new Error(j.error || `Request failed (${r.status})`);
  return j as T;
}
export const fetchState = (accountId: string) => fetch(`/api/defi/state?account=${encodeURIComponent(accountId)}`, { cache: "no-store" }).then((r) => json<DefiState>(r));
export const swapQuote = (tokenIn: string, tokenOut: string, amountIn: string) =>
  fetch(`/api/defi/quote?kind=swap&tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountIn}`).then((r) => json<{ amountOut: string; pool: any; quotedAt: number }>(r));

function owner(guest: Guest) {
  return new Account(guest.accountId, new JsonRpcProvider({ url: near.rpcUrl }), guest.privateKey as `ed25519:${string}`);
}
function failure(r: any): string | null {
  for (const s of [r?.status, ...(r?.receipts_outcome || []).map((o: any) => o.outcome?.status)])
    if (s && typeof s === "object" && "Failure" in s) { const t = JSON.stringify(s.Failure); return (t.match(/panicked: ([^"\\]+)/)?.[1] || t).slice(0, 240); }
  return null;
}
/** Owner (browser key) signs a transaction to its own account — pause, revoke, set policy, install. */
export async function ownerSend(guest: Guest, tx: GuardTransaction): Promise<ExecResult> {
  const r: any = await owner(guest).signAndSendTransaction({ ...tx, waitUntil: "FINAL", throwOnFailure: false } as any);
  const error = failure(r);
  return { ok: !error, txHash: r.transaction.hash, error };
}
/** Installs the immutable Leash guard (global contract by code hash) and adds the agent's limited key. */
export function installGuard(guest: Guest, policy: GuardPolicy = defaultPolicy()) {
  return ownerSend(guest, { receiverId: guest.accountId, actions: installGuardActions(deployment.leash.agentGuardPublicKey, policy, guest.accountId) });
}
export const pauseAgent = (g: Guest) => ownerSend(g, pauseTransaction(g.accountId));
export const resumeAgent = (g: Guest) => ownerSend(g, unpauseTransaction(g.accountId));
export const revokeAgent = (g: Guest) => ownerSend(g, revokeAgentTransaction(g.accountId));
export const updatePolicy = (g: Guest, p: GuardPolicy) => ownerSend(g, setPolicyTransaction(g.accountId, p));

/** Asks the agent (server) to run one guarded action; the browser key signs the exact action. */
export async function agentExecute(guest: Guest, action: GuardAction): Promise<ExecResult> {
  const auth = signRequest(guest, ["leash_exec", actionDigest(action)]);
  return fetch("/api/defi/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, auth }) }).then((r) => json<ExecResult>(r));
}
export const txLink = (hash: string) => `${near.explorer}/txns/${hash}`;
