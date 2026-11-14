import { NextResponse } from "next/server";
import { fail, limit } from "@/lib/near/api";
import { verifyPerpAuth } from "@/lib/defi/perps-auth";
import { closePositions } from "@/lib/defi/perps-close";

export async function POST(request: Request) {
  try {
    limit(request, "perps-close", 10);
    const { auth } = await request.json().catch(() => ({}));
    const id = await verifyPerpAuth(auth, {});
    return NextResponse.json(await closePositions(id));
  } catch (e) { return fail(e); }
}
