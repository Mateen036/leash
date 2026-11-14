import { intentsTokens, bridgeDestinations } from "@/lib/near/intents";
import { fail, limit } from "@/lib/near/api";
export async function GET(request: Request) {
  try {
    limit(request, "integration-tokens", 30);
    const tokens = await intentsTokens();
    return Response.json(
      {
        destinations: bridgeDestinations(tokens),
        near: tokens.filter(
          (t) =>
            t.blockchain === "near" && ["USDC", "wNEAR"].includes(t.symbol),
        ),
        asOf: Date.now(),
      },
      { headers: { "cache-control": "public, max-age=30" } },
    );
  } catch (e) {
    return fail(e);
  }
}
