import { NextResponse } from "next/server";
import { swapQuote, view } from "@/lib/defi/server";
import { fail, limit } from "@/lib/near/api";
import { NearError } from "@/lib/near/server";
import { LINEAR, SWAP_TOKENS as LIST } from "@/lib/defi/tokens";

const SWAP_TOKENS: string[] = LIST.map((t) => t.id);
export async function GET(request: Request) {
  try {
    limit(request, "defi-quote", 60);
    const q = new URL(request.url).searchParams;
    const kind = q.get("kind");
    if (kind === "swap") {
      const tokenIn = q.get("tokenIn") || "", tokenOut = q.get("tokenOut") || "", amountIn = q.get("amountIn") || "";
      if (!SWAP_TOKENS.includes(tokenIn) || !SWAP_TOKENS.includes(tokenOut) || tokenIn === tokenOut || !/^\d{1,40}$/.test(amountIn)) throw new NearError("Bad swap quote request");
      return NextResponse.json(await swapQuote(tokenIn, tokenOut, amountIn));
    }
    if (kind === "stake") return NextResponse.json({ price: await view<string>(LINEAR, "ft_price", {}), quotedAt: Date.now() });
    throw new NearError("kind must be swap or stake");
  } catch (e) { return fail(e); }
}
