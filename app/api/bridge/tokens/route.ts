import { intentsTokens, NEAR_USDC } from "@/lib/near/intents";
import { destinationTokens } from "@/lib/bridge/validation";
import { bridgeApi } from "@/lib/bridge/server";
export async function GET(request: Request) {
  return bridgeApi(request, "tokens", 30, async () => {
    const tokens = await intentsTokens();
    return {
      tokens: tokens.filter(
        (t) =>
          t.assetId === NEAR_USDC ||
          t.assetId === "nep141:wrap.near" ||
          destinationTokens([t]).length,
      ),
      fetchedAt: new Date().toISOString(),
    };
  });
}
