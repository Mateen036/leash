import { networkRoute } from "@/lib/near/network-server";
import { NextResponse } from "next/server";
import { relay } from "@/lib/near/server";
import { body, fail, limit } from "@/lib/near/api";

async function handlePOST(request: Request) {
  try {
    limit(request, "relay", 30);
    const { signedDelegate } = await body<{ signedDelegate?: string }>(request);
    if (typeof signedDelegate !== "string")
      return NextResponse.json(
        { error: "Missing signedDelegate" },
        { status: 400 },
      );
    return NextResponse.json(await relay(signedDelegate));
  } catch (error) {
    return fail(error);
  }
}

export const POST = networkRoute(handlePOST);
