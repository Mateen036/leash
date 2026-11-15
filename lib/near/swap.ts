import { z } from "zod";
import { near } from "./config";
import { view } from "./views";
export const swapInput = z.object({
  direction: z.enum(["USDC_TO_NEAR", "NEAR_TO_USDC"]),
  amount: z.string().regex(/^\d{1,7}(\.\d{1,24})?$/),
  slippageBps: z.number().int().min(10).max(1000).default(100),
});
export type SwapInput = z.input<typeof swapInput>;
export type Pool = {
  pool_kind: string;
  token_account_ids: string[];
  amounts: string[];
  total_fee: number;
  shares_total_supply: string;
};
export type SwapQuote = {
  kind: "swap";
  direction: "USDC_TO_NEAR" | "NEAR_TO_USDC";
  amount: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  output: string;
  minimum: string;
  inputSymbol: string;
  outputSymbol: string;
  tokenIn: string;
  tokenOut: string;
  poolId: number;
  venue: string;
  slippageBps: number;
  feeBps: number;
  priceImpactPercent: string;
  quotedAt: number;
  expiresAt: number;
};
export function units(amount: string, decimals: number): string {
  if (!/^\d{1,12}(\.\d+)?$/.test(amount))
    throw new Error("Invalid positive amount");
  const [a, b = ""] = amount.split(".");
  if (b.length > decimals) throw new Error(`Use at most ${decimals} decimals`);
  const n =
    BigInt(a) * 10n ** BigInt(decimals) + BigInt(b.padEnd(decimals, "0"));
  if (n <= 0n) throw new Error("Amount must be positive");
  return String(n);
}
export function formatted(n: string | bigint, decimals: number) {
  const v = BigInt(n),
    scale = 10n ** BigInt(decimals);
  const f = (v % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${v / scale}${f ? "." + f : ""}`;
}
/** Ref simple pool integer math, used to verify RPC get_return (not a substitute for live quotes). */
export function poolReturn(
  amount: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: number,
) {
  if (
    amount <= 0n ||
    reserveIn <= 0n ||
    reserveOut <= 0n ||
    feeBps < 0 ||
    feeBps >= 10000
  )
    throw new Error("Invalid pool inputs");
  const net = amount * BigInt(10000 - feeBps);
  return (net * reserveOut) / (reserveIn * 10000n + net);
}
export function minimumOut(amount: string, slippageBps: number) {
  if (!Number.isInteger(slippageBps) || slippageBps < 10 || slippageBps > 1000)
    throw new Error("Slippage must be 0.1–10%");
  return String((BigInt(amount) * BigInt(10000 - slippageBps)) / 10000n);
}
export function swapMessage(
  q: Pick<
    SwapQuote,
    "poolId" | "tokenIn" | "tokenOut" | "amountIn" | "minAmountOut"
  >,
) {
  return JSON.stringify({
    force: 0,
    skip_unwrap_near: true,
    actions: [
      {
        pool_id: q.poolId,
        token_in: q.tokenIn,
        token_out: q.tokenOut,
        amount_in: q.amountIn,
        min_amount_out: q.minAmountOut,
      },
    ],
  });
}
export async function swapQuote(input: SwapInput): Promise<SwapQuote> {
  const i = swapInput.parse(input);
  const poolId = near.pool;
  if (!Number.isInteger(poolId))
    throw new Error("Ref pool has not been configured");
  const tokenIn = i.direction === "USDC_TO_NEAR" ? near.token : near.wrap,
    tokenOut = i.direction === "USDC_TO_NEAR" ? near.wrap : near.token;
  const inDecimals = i.direction === "USDC_TO_NEAR" ? 6 : 24,
    outDecimals = i.direction === "USDC_TO_NEAR" ? 24 : 6;
  const amountIn = units(i.amount, inDecimals);
  // Read pool for identity/liquidity checks. get_return is always the quote authority.
  const pool = await view<Pool>(near.ref, "get_pool", { pool_id: poolId });
  if (
    pool.pool_kind !== "SIMPLE_POOL" ||
    pool.token_account_ids.length !== 2 ||
    !pool.token_account_ids.includes(near.token) ||
    !pool.token_account_ids.includes(near.wrap)
  )
    throw new Error("Unexpected Ref pool");
  const amountOut = await view<string>(near.ref, "get_return", {
    pool_id: poolId,
    token_in: tokenIn,
    amount_in: amountIn,
    token_out: tokenOut,
  });
  const minAmountOut = minimumOut(amountOut, i.slippageBps);
  if (BigInt(minAmountOut) <= 0n)
    throw new Error("Amount too small for this pool");
  const ri = BigInt(pool.amounts[pool.token_account_ids.indexOf(tokenIn)]),
    ro = BigInt(pool.amounts[pool.token_account_ids.indexOf(tokenOut)]);
  const spot = (Number(amountIn) * Number(ro)) / Number(ri);
  const now = Date.now();
  return {
    kind: "swap",
    ...i,
    amountIn,
    amountOut,
    minAmountOut,
    output: formatted(amountOut, outDecimals),
    minimum: formatted(minAmountOut, outDecimals),
    inputSymbol: inDecimals === 6 ? near.tokenSymbol : "NEAR (wrapped)",
    outputSymbol: outDecimals === 6 ? near.tokenSymbol : "wNEAR",
    tokenIn,
    tokenOut,
    poolId: poolId!,
    venue: near.ref,
    feeBps: pool.total_fee,
    priceImpactPercent: Math.max(
      0,
      (1 - Number(amountOut) / spot) * 100,
    ).toFixed(2),
    quotedAt: now,
    expiresAt: now + 60000,
  };
}
