import { body, bridgeApi, prepareDeposit } from "@/lib/bridge/server";
export async function POST(request: Request) {
  return bridgeApi(request, "deposit-plan", 12, async () =>
    prepareDeposit(await body(request)),
  );
}
