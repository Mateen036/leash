import { z } from "zod";
import { bridgeQuote } from "@/lib/near/intents";
import { body, fail, limit } from "@/lib/near/api";
import { NearError } from "@/lib/near/server";
const schema = z.object({
  source: z.enum(["USDC", "NEAR"]),
  destinationAsset: z.string().min(8).max(200),
  amount: z.string().regex(/^\d{1,7}(\.\d{1,24})?$/),
});
export async function POST(request: Request) {
  try {
    limit(request, "bridge-quote", 12);
    const parsed = schema.safeParse(await body(request));
    if (!parsed.success) throw new NearError("Invalid bridge preview input");
    return Response.json(
      await bridgeQuote(
        parsed.data.source,
        parsed.data.destinationAsset,
        parsed.data.amount,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
