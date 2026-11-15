import { near } from "@/lib/near/config";
import { networkRoute } from "@/lib/near/network-server";
import { NextResponse } from "next/server";
import { fail, limit } from "@/lib/near/api";
import { markets } from "@/lib/defi/orderly";
import { PERP_LIMITS } from "@/lib/defi/perps-policy";

async function handleGET(request: Request) {
  try {
    limit(request, "perps-markets", 60);
    const rows = await markets();
    const order = ["PERP_BTC_USDC", "PERP_ETH_USDC", "PERP_SOL_USDC"];
    rows.sort(
      (a, b) =>
        (order.indexOf(a.symbol) + 1 || 99) -
          (order.indexOf(b.symbol) + 1 || 99) || b.volume24h - a.volume24h,
    );
    return NextResponse.json({
      markets: rows.map((m) => ({
        ...m,
        maxLeverage: PERP_LIMITS.maxLeverage,
      })),
      venue: `Orderly Network ${near.network} (chain ${near.chainId})`,
      fetchedAt: Date.now(),
    });
  } catch (e) {
    return fail(e);
  }
}

export const GET = networkRoute(handleGET);
