import type { Action } from "../agent/actions";
import type { GuardAction, GuardPolicy, GuardSpent } from "../near/guard";
import { SWAP_TOKENS, TOKENS, fromBase } from "./tokens";
export type Proposal = {
  action: Action;
  guardAction?: GuardAction;
  raw?: unknown;
  headline: string;
  deltas: string[];
  protocol: string;
  contract: string;
  because: string;
  quotedAt: number;
  expiresAt?: number;
  sources: { name: string; at: number }[];
  limit: string;
  blocked?: string;
  tryAnyway?: boolean;
  quoteOnly?: boolean;
  facts: { label: string; value: string; warning?: boolean }[];
};
export function minimumOut(output: string, bps: number) {
  if (!Number.isInteger(bps) || bps < 0 || bps >= 10000)
    throw new Error("Invalid slippage limit");
  return ((BigInt(output) * BigInt(10000 - bps)) / 10000n).toString();
}
export function stakeOutput(amount: string, price: string) {
  if (BigInt(price) <= 0n) throw new Error("LiNEAR rate unavailable");
  return ((BigInt(amount) * 10n ** 24n) / BigInt(price)).toString();
}
export function amountMeta(a: GuardAction) {
  if (a.kind === "LinearStake") return { asset: "near", amount: a.amount };
  if (a.kind === "LinearUnstake")
    return { asset: TOKENS.LiNEAR.id, amount: a.amount };
  if (a.kind === "RefSwap")
    return {
      asset: a.token_in === TOKENS.wNEAR.id ? "near" : a.token_in,
      amount: a.amount_in,
    };
  return {
    asset:
      a.kind === "BurrowSupply" && a.token === TOKENS.wNEAR.id
        ? "near"
        : a.token,
    amount: a.amount,
  };
}
export function assetInfo(asset: string) {
  if (asset === "perp_usd") return { symbol: "USD notional", decimals: 0 };
  return (
    Object.values(TOKENS).find((t) => t.id === asset) ||
    SWAP_TOKENS.find((t) => t.id === asset) || {
      symbol: asset,
      decimals: asset.includes("usd") ? 6 : 24,
    }
  );
}
export function policyCheck(
  policy: GuardPolicy,
  spent: GuardSpent,
  asset: string,
  amount: string,
  now = Date.now(),
) {
  if (policy.paused) return "PAUSED";
  if (policy.expires_at_ms <= now) return "EXPIRED";
  const cap = policy.caps[asset];
  if (!cap || BigInt(amount) > BigInt(cap.per_action)) return "CAP_PER_ACTION";
  const used =
    spent[asset]?.day_index === Math.floor(now / 86400000)
      ? BigInt(spent[asset].amount)
      : 0n;
  if (BigInt(amount) + used > BigInt(cap.daily)) return "CAP_DAILY";
  return undefined;
}
export function limitText(
  policy: GuardPolicy,
  spent: GuardSpent,
  asset: string,
) {
  const cap = policy.caps[asset],
    info = assetInfo(asset);
  if (!cap) return "Asset is outside this policy";
  const used =
    spent[asset]?.day_index === Math.floor(Date.now() / 86400000)
      ? BigInt(spent[asset].amount)
      : 0n;
  const remaining = BigInt(cap.daily) > used ? BigInt(cap.daily) - used : 0n;
  return `${fromBase(cap.per_action, info.decimals)} ${info.symbol} per action · ${fromBase(remaining, info.decimals)} ${info.symbol} remaining today`;
}
export const refusalText = (code: string) =>
  ({
    CAP_PER_ACTION:
      "Over your per-action limit — the guard contract refused it on-chain",
    CAP_DAILY: "Over your daily limit — the guard contract refused it on-chain",
    PAUSED: "Agent paused — resume it before requesting another action",
    EXPIRED:
      "Your agent permission has expired — update the policy with your owner key",
    NOT_AGENT: "The agent no longer has authority on this account",
    AGENT_REVOKED: "The agent key has been deleted from this account",
    LOW_BALANCE:
      "Not enough available NEAR after the guard's gas and storage reserve",
    LEVERAGE: "Leverage exceeds your policy maximum",
    NOTIONAL: "Position size exceeds your policy maximum",
    PROTOCOL_FAILED:
      "The protocol call failed. Inspect the receipt; funds may have been refunded",
    INPUT_REFUNDED:
      "The protocol refunded the input; the action did not complete",
    OUTPUT_NOT_DELIVERED: "The minimum swap output was not delivered",
    BUSY: "Another action is still settling — wait for its receipt",
  })[code.split(":")[0]] || code;
/** Burrow get_account balances are underlying units; shares are only used if balance is absent. */
export function suppliedBalance(account: any, token = TOKENS.wNEAR.id): string {
  const entries = [
    ...(account?.supplied || []),
    ...(account?.collateral || []),
  ];
  return entries
    .filter((a: any) => a.token_id === token)
    .reduce((sum: bigint, a: any) => sum + BigInt(a.balance || "0"), 0n)
    .toString();
}
