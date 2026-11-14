import { body, bridgeApi, requestBridgeQuote } from "@/lib/bridge/server";
export async function POST(request: Request) {
  return bridgeApi(request, "quote", 12, async () =>
    requestBridgeQuote(await body(request)),
  );
}
