import { NextResponse } from "next/server";
import { body, fail, limit } from "@/lib/near/api";
import { claimFaucet, faucetStock } from "@/lib/defi/faucet";

export async function GET() {
  try { return NextResponse.json({ tokens: await faucetStock() }); } catch (e) { return fail(e); }
}
export async function POST(request: Request) {
  try {
    limit(request, "faucet", 4, 60 * 60_000);
    const { accountId, tokens } = await body<{ accountId?: string; tokens?: string[] }>(request);
    if (typeof accountId !== "string") return NextResponse.json({ error: "Send accountId" }, { status: 400 });
    return NextResponse.json(await claimFaucet(accountId.trim().toLowerCase(), Array.isArray(tokens) ? tokens.slice(0, 10).map(String) : undefined));
  } catch (e) { return fail(e); }
}
