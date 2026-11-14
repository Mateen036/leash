import { NextResponse } from "next/server";
import { accountState } from "@/lib/defi/server";
import { fail, limit } from "@/lib/near/api";
import { NearError } from "@/lib/near/server";

export async function GET(request: Request) {
  try {
    limit(request, "defi-state", 60);
    const id = new URL(request.url).searchParams.get("account") || "";
    if (!/^[a-z0-9._-]{2,64}$/.test(id)) throw new NearError("Pass ?account=<near account id>");
    return NextResponse.json(await accountState(id), { headers: { "cache-control": "no-store" } });
  } catch (e) { return fail(e); }
}
