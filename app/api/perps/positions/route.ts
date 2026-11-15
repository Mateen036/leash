import { networkRoute } from "@/lib/near/network-server";
import { NextResponse } from "next/server";
import { fail, limit } from "@/lib/near/api";
import { NearError } from "@/lib/near/server";
import { findSession, holdings, positions } from "@/lib/defi/orderly";

async function handleGET(request: Request) {
  try {
    limit(request, "perps-positions", 60);
    const id = new URL(request.url).searchParams.get("account") || "";
    if (!/^[a-z0-9._-]{2,64}$/.test(id)) throw new NearError("Pass ?account=");
    const s = await findSession(id);
    if (!s)
      return NextResponse.json({
        registered: false,
        positions: [],
        orders: [],
      });
    // Do not turn a failed venue read into a zero balance and "no open positions".
    const [h, p] = await Promise.all([holdings(s), positions(s)]);
    const rows = ((p?.rows as any[]) || [])
      .filter((r) => Number(r.position_qty) !== 0)
      .map((r) => ({
        symbol: r.symbol,
        qty: Number(r.position_qty),
        avgOpen: Number(r.average_open_price),
        markPrice: Number(r.mark_price),
        unrealizedPnl: Number(r.unsettled_pnl ?? r.unrealized_pnl ?? 0),
        estLiqPrice: Number(r.est_liq_price ?? 0),
        leverage: Number(r.leverage ?? 0),
      }));
    return NextResponse.json(
      {
        registered: true,
        address: s.address,
        signerMode: s.mode,
        orderlyAccountId: s.accountId,
        usdcBalance: h.find((x: any) => x.token === "USDC")?.holding ?? 0,
        totalCollateral: p?.total_collateral_value ?? null,
        freeCollateral: p?.free_collateral ?? null,
        positions: rows,
        orders: [],
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}

export const GET = networkRoute(handleGET);
