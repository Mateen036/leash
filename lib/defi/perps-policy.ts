import { near, isGuestAccount } from "@/lib/near/config";
import { agentAuthorizePerp } from "./server";
import { symbolInfo } from "./orderly";

export const PERP_LIMITS = { maxLeverage: 5, maxNotionalUsd: 500 };
export type PerpIntent = {
  symbol: string;
  side: "BUY" | "SELL";
  notionalUsd: number;
  leverage: number;
};

/** Quantity from notional, rounded down to the market's base tick; enforces Orderly's minimums. */
export async function sizeOrder(intent: PerpIntent, markPrice: number) {
  const info = await symbolInfo(intent.symbol);
  const raw = intent.notionalUsd / markPrice;
  const decimals = Math.max(0, Math.round(-Math.log10(info.baseTick)));
  const qty = Math.floor(raw / info.baseTick) * info.baseTick;
  const quantity = Number(qty.toFixed(decimals));
  if (quantity < info.baseMin || quantity * markPrice < info.minNotional)
    throw new Error(
      `Minimum order is about $${info.minNotional} on ${intent.symbol}`,
    );
  return { quantity, notional: quantity * markPrice, info };
}
/** Isolated-style estimate for preview only (Orderly uses cross margin; real liq depends on the whole account). */
export function estimateLiquidation(
  side: "BUY" | "SELL",
  entry: number,
  leverage: number,
  mmr = 0.025,
) {
  const move = 1 / leverage - mmr;
  const price = side === "BUY" ? entry * (1 - move) : entry * (1 + move);
  return { price, distancePct: (Math.abs(price - entry) / entry) * 100 };
}
/** Off-chain mirror of the guard limits. For guests the on-chain guard is authoritative. */
export function offChainCheck(i: PerpIntent) {
  if (i.leverage > PERP_LIMITS.maxLeverage) return "LEVERAGE";
  if (i.notionalUsd > PERP_LIMITS.maxNotionalUsd) return "NOTIONAL";
  return null;
}
export type GuardAuth =
  | { kind: "on-chain"; authId: number; txHash: string }
  | { kind: "off-chain" }
  | { kind: "rejected"; code: string; txHash: string };
/** Guests: the guard contract must authorize the order on-chain first (rejections are real failed txs). */
export async function requireGuardAuthorization(
  nearAccountId: string,
  i: PerpIntent,
): Promise<GuardAuth> {
  if (!isGuestAccount(nearAccountId)) {
    const code = offChainCheck(i);
    return code
      ? { kind: "rejected", code, txHash: "" }
      : { kind: "off-chain" };
  }
  const r = await agentAuthorizePerp(nearAccountId, {
    venue: near.orderlyVenue,
    symbol: i.symbol,
    side: i.side,
    notional_usd: Math.ceil(i.notionalUsd),
    leverage_x100: Math.round(i.leverage * 100),
  });
  if (!r.ok)
    return {
      kind: "rejected",
      code: (r.error || "REJECTED").split(/[:\s]/)[0],
      txHash: r.txHash,
    };
  return { kind: "on-chain", authId: Number(r.value), txHash: r.txHash };
}
