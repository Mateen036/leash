import { near } from "@/lib/near/config";
import { networkRoute } from "@/lib/near/network-server";
import { NextResponse } from "next/server";
import { swapQuote, view } from "@/lib/defi/server";
import { fail, limit } from "@/lib/near/api";
import { NearError } from "@/lib/near/server";
import { getSwapTokens as LIST } from "@/lib/defi/tokens";

const allowedTokens = () => LIST().map((t) => t.id);
async function handleGET(request: Request) {
  try {
    limit(request, "defi-quote", 60);
    const q = new URL(request.url).searchParams;
    const kind = q.get("kind");
    if (kind === "swap") {
      const tokenIn = q.get("tokenIn") || "",
        tokenOut = q.get("tokenOut") || "",
        amountIn = q.get("amountIn") || "";
      if (
        !allowedTokens().includes(tokenIn) ||
        !allowedTokens().includes(tokenOut) ||
        tokenIn === tokenOut ||
        !/^\d{1,40}$/.test(amountIn)
      )
        throw new NearError("Bad swap quote request");
      return NextResponse.json(await swapQuote(tokenIn, tokenOut, amountIn));
    }
    if (kind === "stake")
      return NextResponse.json({
        price: await view<string>(near.linear, "ft_price", {}),
        quotedAt: Date.now(),
      });
    throw new NearError("kind must be swap or stake");
  } catch (e) {
    return fail(e);
  }
}

export const GET = networkRoute(handleGET);
