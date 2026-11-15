import { requireTestnet } from "@/lib/near/network";
import { actions } from "near-api-js";
import { NearError, relayerAccount } from "../near/server";
import { getSwapTokens, TOKENS, fromBase } from "./tokens";
import { view } from "./server";
import { rpcCall } from "../near/rpc";

/** Testnet faucet: tops an account up to a small amount of each Leash test token. Never sends NEAR. */
export const FAUCET_TOKENS = getSwapTokens().filter((t) => t.faucet);
const STORAGE = 1_250_000_000_000_000_000_000n; // 0.00125 NEAR (NEP-145 min for these tokens)
const GAS = 30_000_000_000_000n;
/** Keep this much NEAR on the relayer for guest sign-ups. */
const RELAYER_FLOOR = 8n * 10n ** 24n;
const recent = new Map<string, number>();
export const FAUCET_COOLDOWN_MS = 10 * 60_000;

export type FaucetResult = {
  accountId: string;
  sent: { symbol: string; amount: string; txHash: string }[];
  skipped: { symbol: string; reason: string }[];
};

async function exists(accountId: string) {
  const d = await rpcCall("query", {
    request_type: "view_account",
    finality: "optimistic",
    account_id: accountId,
  });
  return !d.error && !d.result?.error ? (d.result as { amount: string }) : null;
}

export async function claimFaucet(
  accountId: string,
  only?: string[],
): Promise<FaucetResult> {
  requireTestnet("Faucet");
  if (
    !/^[a-z0-9_.-]{2,64}$/.test(accountId) ||
    !(accountId.endsWith(".testnet") || /^[0-9a-f]{64}$/.test(accountId))
  )
    throw new NearError("Use a NEAR testnet account", 400);
  const last = recent.get(accountId) || 0;
  if (Date.now() - last < FAUCET_COOLDOWN_MS)
    throw new NearError(
      "FAUCET_COOLDOWN: Already claimed — try again in a few minutes",
      429,
    );
  if (!(await exists(accountId)))
    throw new NearError("That testnet account doesn't exist yet", 404);
  const relayer = relayerAccount();
  const rel = await exists(relayer.accountId);
  if (!rel || BigInt(rel.amount) < RELAYER_FLOOR)
    throw new NearError(
      "FAUCET_EMPTY: The faucet is empty right now — try again later",
      503,
    );
  recent.set(accountId, Date.now());
  const out: FaucetResult = { accountId, sent: [], skipped: [] };
  for (const t of FAUCET_TOKENS) {
    if (only && !only.includes(t.symbol)) continue;
    const amount = BigInt(t.faucet!);
    try {
      const have = BigInt(
        await view<string>(t.id, "ft_balance_of", {
          account_id: accountId,
        }).catch(() => "0"),
      );
      if (have >= amount) {
        out.skipped.push({
          symbol: t.symbol,
          reason: "You already have enough",
        });
        continue;
      }
      const give = amount - have;
      const reg = await view<{ total: string } | null>(
        t.id,
        "storage_balance_of",
        { account_id: accountId },
      ).catch(() => null);
      const acts = [];
      if (t.id === TOKENS.tUSDC.id) {
        // Our own mock token: mint to the relayer, register the user for free, then transfer.
        acts.push(
          actions.functionCall("faucet", { amount: give.toString() }, GAS, 0n),
        );
        if (!reg)
          acts.push(
            actions.functionCall(
              "register",
              { account_id: accountId },
              GAS,
              0n,
            ),
          );
      } else {
        const stock = BigInt(
          await view<string>(t.id, "ft_balance_of", {
            account_id: relayer.accountId,
          }).catch(() => "0"),
        );
        if (stock < give) {
          out.skipped.push({
            symbol: t.symbol,
            reason: "Out of stock — swap NEAR for it instead",
          });
          continue;
        }
        if (!reg)
          acts.push(
            actions.functionCall(
              "storage_deposit",
              { account_id: accountId, registration_only: true },
              GAS,
              STORAGE,
            ),
          );
      }
      acts.push(
        actions.functionCall(
          "ft_transfer",
          {
            receiver_id: accountId,
            amount: give.toString(),
            memo: "Leash testnet faucet",
          },
          GAS,
          1n,
        ),
      );
      const r: any = await relayer.signAndSendTransaction({
        receiverId: t.id,
        actions: acts,
      } as any);
      const failed =
        JSON.stringify(r?.status || {}).includes("Failure") ||
        (r?.receipts_outcome || []).some(
          (o: any) => o.outcome?.status?.Failure,
        );
      if (failed)
        out.skipped.push({
          symbol: t.symbol,
          reason: "Transfer failed — try again",
        });
      else
        out.sent.push({
          symbol: t.symbol,
          amount: fromBase(give, t.decimals, 4),
          txHash: r.transaction.hash,
        });
    } catch {
      out.skipped.push({ symbol: t.symbol, reason: "Temporarily unavailable" });
    }
  }
  if (!out.sent.length) recent.delete(accountId);
  return out;
}

/** What the faucet can still give (for the UI). */
export async function faucetStock() {
  requireTestnet("Faucet");
  const relayer = relayerAccount().accountId;
  return Promise.all(
    FAUCET_TOKENS.map(async (t) => {
      if (t.id === TOKENS.tUSDC.id)
        return {
          symbol: t.symbol,
          amount: fromBase(t.faucet!, t.decimals, 4),
          available: true,
        };
      const stock = BigInt(
        await view<string>(t.id, "ft_balance_of", {
          account_id: relayer,
        }).catch(() => "0"),
      );
      return {
        symbol: t.symbol,
        amount: fromBase(t.faucet!, t.decimals, 4),
        available: stock >= BigInt(t.faucet!),
      };
    }),
  );
}
