import { body, bridgeApi, oneClick } from "@/lib/bridge/server";
import { submitSchema } from "@/lib/bridge/validation";
export async function POST(request: Request) {
  return bridgeApi(request, "submit", 15, async () =>
    oneClick("/v0/deposit/submit", submitSchema.parse(await body(request))),
  );
}
