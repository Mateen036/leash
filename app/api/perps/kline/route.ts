import { NextResponse } from "next/server";
import { fail, limit } from "@/lib/near/api";
import { cachedKlines, parseKlineType, parsePerpSymbol } from "@/lib/defi/kline";

export async function GET(request: Request) {
  try {
    limit(request, "perps-kline", 90);
    const url = new URL(request.url);
    const symbol = parsePerpSymbol(url.searchParams.get("symbol"));
    const type = parseKlineType(url.searchParams.get("type") || "15m");
    const payload = await cachedKlines(symbol, type);
    return NextResponse.json(payload, {
      headers: { "cache-control": "public, max-age=8, s-maxage=8" },
    });
  } catch (e) {
    return fail(e);
  }
}
