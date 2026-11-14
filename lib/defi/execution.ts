"use client";
import type { Proposal } from "./preview";
import { amountMeta, policyCheck } from "./preview";
import { agentExecute, fetchState, type ExecResult } from "./client";
import { actionDigest } from "./tokens";
import { signRequest, type Guest } from "../near/client";
import {
  walletSend,
  walletSignRequest,
  type WalletSession,
} from "../near/wallet";
import { defaultPolicy, type GuardSpent } from "../near/guard";
import { view } from "../near/views";
import { buildCopilotTransactions, type Registration } from "./copilot";
import { BURROW, REF, TOKENS } from "./tokens";
export async function postJson(path: string, data: unknown) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 404 && path.startsWith("/api/perps"))
    throw new Error("Perps unavailable");
  if (!r.ok && !(j.rejectedTx || j.txHash))
    throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
export function walletPolicy(id: string) {
  const key = `leash:wallet-policy:${id}`;
  const stored = localStorage.getItem(key);
  if (stored) return JSON.parse(stored) as ReturnType<typeof defaultPolicy>;
  const policy = defaultPolicy();
  localStorage.setItem(key, JSON.stringify(policy));
  return policy;
}
const spendKey = (id: string) => `leash:wallet-spent:${id}`;
export function walletSpent(id: string): GuardSpent {
  try {
    return JSON.parse(localStorage.getItem(spendKey(id)) || "{}");
  } catch {
    return {};
  }
}
function debit(id: string, asset: string, amount: string) {
  const spent = walletSpent(id),
    day = Math.floor(Date.now() / 86400000);
  const used =
    spent[asset]?.day_index === day ? BigInt(spent[asset].amount) : 0n;
  spent[asset] = { day_index: day, amount: (used + BigInt(amount)).toString() };
  localStorage.setItem(spendKey(id), JSON.stringify(spent));
}
export async function executeProposal(
  p: Proposal,
  guest: Guest | null,
  wallet: WalletSession | null,
  onStep: (status: string, hash?: string) => void,
): Promise<ExecResult & { orderId?: string }> {
  if (p.quoteOnly) throw new Error("This proposal is read only");
  const id = wallet?.accountId || guest?.accountId;
  if (!id) throw new Error("Start free on testnet or connect your wallet");
  if (p.guardAction) {
    if (wallet) {
      const meta = amountMeta(p.guardAction);
      const blocked = policyCheck(
        walletPolicy(id),
        walletSpent(id),
        meta.asset,
        meta.amount,
      );
      if (blocked) throw new Error(`Off-chain limit (wallet mode): ${blocked}`);
      const a = p.guardAction;
      const registrations: Registration = {};
      if (a.kind === "RefSwap" || a.kind === "BurrowSupply") {
        const [wrap, burrow, ref, output, wrappedBalance] = await Promise.all([
          view(TOKENS.wNEAR.id, "storage_balance_of", { account_id: id }),
          view(BURROW, "storage_balance_of", { account_id: id }),
          view(REF, "storage_balance_of", { account_id: id }),
          a.kind === "RefSwap"
            ? view(a.token_out, "storage_balance_of", { account_id: id })
            : null,
          view<string>(TOKENS.wNEAR.id, "ft_balance_of", { account_id: id }),
        ]);
        Object.assign(registrations, {
          wrap: !!wrap,
          burrow: !!burrow,
          ref: !!ref,
          output: !!output,
          wrappedBalance,
        });
      }
      const txs = buildCopilotTransactions(id, a, registrations);
      let result: ExecResult = {
        ok: false,
        txHash: "",
        error: "No transactions",
      };
      for (const [index, tx] of txs.entries()) {
        onStep(
          `Wallet signature ${index + 1}/${txs.length} · ${tx.calls.map((c) => c.method).join(", ")}`,
        );
        result = await walletSend(wallet, tx.receiverId, tx.calls);
        if (!result.txHash)
          throw new Error(
            "Wallet did not return a transaction receipt. Inspect wallet history before trying again.",
          );
        if (result.txHash)
          onStep(`Included · ${tx.calls[0].method}`, result.txHash);
        if (!result.ok) return result;
      }
      debit(id, meta.asset, meta.amount);
      return result;
    }
    if (!guest) throw new Error("Guest session unavailable");
    const state = await fetchState(id);
    if (!state.exists || !state.guardInstalled || !state.agentKey)
      throw new Error("Install an active guard before executing");
    return agentExecute(guest, p.guardAction);
  }
  const a = p.action;
  async function auth(payload: object) {
    return wallet
      ? walletSignRequest(wallet, ["leash_perp", actionDigest(payload)])
      : signRequest(guest!, ["leash_perp", actionDigest(payload)]);
  }
  if (
    a.kind === "perp_open" ||
    a.kind === "perp_close" ||
    a.kind === "close_all"
  ) {
    const payload =
      a.kind === "perp_open"
        ? {
            symbol: a.symbol,
            side: a.side,
            notionalUsd: a.notionalUsd,
            leverage: a.leverage,
          }
        : a.kind === "perp_close"
          ? { symbol: a.symbol }
          : {};
    if (wallet && a.kind === "perp_open") {
      const p = walletPolicy(id);
      const blocked =
        a.leverage > p.max_leverage_x100 / 100
          ? "LEVERAGE"
          : a.notionalUsd > p.max_perp_notional_usd
            ? "NOTIONAL"
            : policyCheck(
                p,
                walletSpent(id),
                "perp_usd",
                String(Math.ceil(a.notionalUsd)),
              );
      if (blocked) throw new Error(`Off-chain limit (wallet mode): ${blocked}`);
    }
    if (a.kind === "perp_open" && !p.blocked) {
      onStep(
        "Preparing Orderly testnet account and faucet (may take several minutes)",
      );
      const bootstrap = await postJson("/api/perps/bootstrap", {
        auth: await auth({}),
      });
      onStep(
        `Orderly owner: ${bootstrap.signerMode === "chain-signatures" ? "Chain Signatures" : "server-derived fallback"} · ${bootstrap.address}`,
      );
      if (Number(bootstrap.usdcBalance) <= 0)
        throw new Error(
          "Orderly faucet requested. Test USDC may take ~20 minutes; wait for the balance before confirming again.",
        );
    }
    if (a.kind === "perp_open" && Date.now() - p.quotedAt >= 60000)
      throw new Error(
        "Orderly preparation outlasted this quote. Request a fresh preview.",
      );
    const result = await postJson(
      `/api/perps/${a.kind === "perp_open" ? "order" : a.kind === "perp_close" ? "close" : "close-all"}`,
      { ...payload, auth: await auth(payload) },
    );
    if (wallet && a.kind === "perp_open" && result.ok)
      debit(id, "perp_usd", String(Math.ceil(a.notionalUsd)));
    return {
      ok: result.ok === true,
      txHash: result.rejectedTx || result.authTx || "",
      error: result.error || null,
      orderId: result.orderId
        ? String(result.orderId)
        : result.orderIds?.join(", "),
    };
  }
  throw new Error("No executable action in this preview");
}
