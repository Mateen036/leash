import { bridgeApi, oneClick } from "@/lib/bridge/server";
import { trackingSchema } from "@/lib/bridge/validation";
export async function GET(request: Request) {
  return bridgeApi(request, "status", 120, async () => {
    const input = trackingSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return oneClick(`/v0/status?${new URLSearchParams(input)}`);
  });
}
