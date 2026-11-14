import { NextResponse } from "next/server";
import { fail, limit } from "@/lib/near/api";
import { markets } from "@/lib/defi/orderly";
import { PERP_LIMITS } from "@/lib/defi/perps-policy";

export async function GET(request: Request) {
  try {
    limit(request, "perps-markets", 60);
    const rows = await markets();
    const order = ["PERP_BTC_USDC", "PERP_ETH_USDC", "PERP_SOL_USDC"];
    rows.sort((a, b) => (order.indexOf(a.symbol) + 1 || 99) - (order.indexOf(b.symbol) + 1 || 99) || b.volume24h - a.volume24h);
    return NextResponse.json({ markets: rows.map((m) => ({ ...m, maxLeverage: PERP_LIMITS.maxLeverage })), venue: "Orderly Network testnet (broker demo, Arbitrum Sepolia)", fetchedAt: Date.now() });
  } catch (e) { return fail(e); }
}
