import { NextResponse } from "next/server";
import { fail, limit } from "@/lib/near/api";
import { NearError } from "@/lib/near/server";
import { verifyPerpAuth } from "@/lib/defi/perps-auth";
import { closePositions } from "@/lib/defi/perps-close";

export async function POST(request: Request) {
  try {
    limit(request, "perps-close", 10);
    const { symbol, auth } = await request.json().catch(() => ({}));
    if (typeof symbol !== "string" || !/^PERP_[A-Z0-9]+_USDC$/.test(symbol)) throw new NearError("Invalid symbol");
    const id = await verifyPerpAuth(auth, { symbol });
    return NextResponse.json(await closePositions(id, symbol));
  } catch (e) { return fail(e); }
}
