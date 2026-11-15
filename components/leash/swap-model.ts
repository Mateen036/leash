import { near } from "@/lib/near/config";
import {
  getSwapTokens,
  TOKENS,
  fromBase,
  poolFor,
  type SwapToken,
} from "@/lib/defi/tokens";
import {
  amountMeta,
  limitText,
  minimumOut,
  policyCheck,
  type Proposal,
} from "@/lib/defi/preview";
import type { GuardPolicy, GuardSpent } from "@/lib/near/guard";

export type SwapPair = { source: string; target: string };
/** Every supported pool is single-hop, with NEAR on exactly one side. */
export function selectSwapToken(
  pair: SwapPair,
  side: "from" | "to",
  symbol: string,
): SwapPair {
  const selected = getSwapTokens().find((t) => t.symbol === symbol);
  if (!selected) throw new Error("Choose a listed token");
  const key = side === "from" ? "source" : "target";
  const other = side === "from" ? "target" : "source";
  const next = { ...pair, [key]: symbol };
  if (symbol !== "NEAR") next[other] = "NEAR";
  else if (next[other] === "NEAR")
    next[other] = pair[key] === "NEAR" ? near.tokenSymbol : pair[key];
  return next;
}
export function swapBalance(
  token: SwapToken,
  near: string,
  tokens: Record<string, string>,
) {
  return token.symbol === "NEAR"
    ? BigInt(near) + BigInt(tokens.wNEAR || "0")
    : BigInt(tokens[token.symbol] || "0");
}
export function swapMax(
  token: SwapToken,
  near: string,
  tokens: Record<string, string>,
) {
  const reserve = 150_000_000_000_000_000_000_000n;
  const spendable = BigInt(near) > reserve ? BigInt(near) - reserve : 0n;
  return fromBase(
    swapBalance(token, spendable.toString(), tokens),
    token.decimals,
    token.decimals,
  );
}
/** Add only absent selected caps; keep all owner decisions, including zero caps. */
export function withTokenCaps(
  policy: GuardPolicy,
  tokens: SwapToken[],
): GuardPolicy {
  return {
    ...policy,
    caps: {
      ...policy.caps,
      ...Object.fromEntries(
        tokens
          .filter((t) => !policy.caps[t.id])
          .map((t) => [t.id, { ...t.cap }]),
      ),
    },
  };
}
export type SwapQuote = {
  amountOut: string;
  poolId?: number;
  quotedAt: number;
  pool: { token_account_ids: string[]; amounts: string[]; total_fee: number };
};
export function swapProposal(
  input: SwapToken,
  output: SwapToken,
  amount: string,
  amountIn: string,
  q: SwapQuote,
  policy: GuardPolicy,
  spent: GuardSpent,
): Proposal {
  const slippage = Math.min(50, policy.max_slippage_bps);
  const minimum = minimumOut(q.amountOut, slippage);
  if (BigInt(minimum) <= 0n)
    throw new Error("Try a larger amount for this token");
  const poolId = poolFor(input.id, output.id);
  if (q.poolId !== undefined && q.poolId !== poolId)
    throw new Error("Route changed. Request a new quote.");
  const ri = Number(q.pool.amounts[q.pool.token_account_ids.indexOf(input.id)]);
  const ro = Number(
    q.pool.amounts[q.pool.token_account_ids.indexOf(output.id)],
  );
  const impact = Math.max(
    0,
    (1 - Number(q.amountOut) / ((Number(amountIn) * ro) / ri)) * 100,
  );
  const guardAction = {
    kind: "RefSwap" as const,
    pool_id: q.poolId ?? poolId,
    token_in: input.id,
    token_out: output.id,
    amount_in: amountIn,
    min_amount_out: minimum,
  };
  const meta = amountMeta(guardAction);
  const blocked = !policy.allowed_protocols.includes(near.ref)
    ? "This protocol is turned off in your limits"
    : policyCheck(policy, spent, meta.asset, amountIn);
  const outputLabel = output.id === TOKENS.wNEAR.id ? "wNEAR" : output.symbol;
  return {
    action: {
      kind: "swap",
      amount,
      source: input.symbol,
      target: output.symbol,
    },
    guardAction,
    headline: `Swap ${amount} ${input.symbol} → ${output.symbol}`,
    deltas: [
      `−${amount} ${input.symbol}`,
      `+≥${fromBase(minimum, output.decimals, output.decimals)} ${outputLabel}`,
    ],
    protocol: "Ref / Rhea DEX",
    contract: near.ref,
    because: "A live pool quote sets the minimum you receive.",
    network: near.network,
    quotedAt: q.quotedAt,
    sources: [{ name: `Ref pool #${poolId}`, at: q.quotedAt }],
    limit: limitText(policy, spent, meta.asset),
    blocked,
    facts: [
      {
        label: "Minimum received",
        value: `${fromBase(minimum, output.decimals, output.decimals)} ${outputLabel}`,
      },
      {
        label: "Price impact (includes pool fee)",
        value: `${impact.toFixed(2)}%`,
        warning: impact > 1,
      },
      { label: "Pool fee", value: `${q.pool.total_fee / 100}%` },
      { label: "Slippage limit", value: `${slippage / 100}%` },
      {
        label: "Gas & storage",
        value: "Paid in NEAR. NEAR output stays wrapped as wNEAR.",
      },
    ],
  };
}
