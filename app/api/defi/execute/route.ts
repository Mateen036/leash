import { networkRoute } from "@/lib/near/network-server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { agentExecute, swapQuote, verifyGuestRequest } from "@/lib/defi/server";
import { fail, limit } from "@/lib/near/api";
import { NearError, isGuestAccount } from "@/lib/near/server";
import { getPolicy } from "@/lib/near/guard";
import {
  getSwapPools,
  getSwapTokens,
  TOKENS,
  actionDigest,
  poolFor,
} from "@/lib/defi/tokens";
const SWAP_IDS = getSwapTokens().map((t) => t.id) as [string, ...string[]];
import type { GuardAction } from "@/lib/near/guard";

const amount = z.string().regex(/^\d{1,40}$/);
const action = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("RefSwap"),
    pool_id: z
      .number()
      .int()
      .refine((p) => getSwapPools().includes(p), "Unknown pool"),
    token_in: z.enum(SWAP_IDS),
    token_out: z.enum(SWAP_IDS),
    amount_in: amount,
    min_amount_out: amount,
  }),
  z.object({
    kind: z.literal("BurrowSupply"),
    token: z.literal(TOKENS.wNEAR.id),
    amount,
    as_collateral: z.boolean(),
  }),
  z.object({
    kind: z.literal("BurrowWithdraw"),
    token: z.literal(TOKENS.wNEAR.id),
    amount,
  }),
  z.object({ kind: z.literal("LinearStake"), amount }),
  z.object({ kind: z.literal("LinearUnstake"), amount }),
]);
const schema = z.object({
  action,
  auth: z.object({
    accountId: z.string().max(64),
    message: z.string().max(2000),
    publicKey: z.string().max(100),
    signature: z.string().max(150),
  }),
});

async function handlePOST(request: Request) {
  try {
    limit(request, "defi-exec", 12);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success)
      throw new NearError(
        "Invalid action: " +
          parsed.error.issues
            .map((i) => i.path.join(".") + " " + i.message)
            .join("; ")
            .slice(0, 300),
      );
    const { action: a, auth } = parsed.data;
    if (!isGuestAccount(auth.accountId))
      throw new NearError(
        "Autonomous execution is for Leash guest accounts. Wallet users sign each action in their wallet.",
        403,
      );
    await verifyGuestRequest(auth, [
      "leash_exec",
      actionDigest(a as GuardAction),
    ]);
    if (a.kind === "RefSwap") {
      if (a.token_in === a.token_out)
        throw new NearError("Pick two different tokens");
      if (poolFor(a.token_in, a.token_out) !== a.pool_id)
        throw new NearError("Wrong pool for this pair; re-quote");
      const policy = await getPolicy(auth.accountId).catch(() => null);
      const q = await swapQuote(a.token_in, a.token_out, a.amount_in);
      const bps = BigInt(policy?.max_slippage_bps ?? 100);
      const floor = (BigInt(q.amountOut) * (10_000n - bps)) / 10_000n;
      if (BigInt(a.min_amount_out) < floor)
        throw new NearError(
          `Minimum received is below your ${Number(bps) / 100}% slippage limit against the live pool; re-quote`,
          409,
        );
    }
    const r = await agentExecute(auth.accountId, a as GuardAction);
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    return fail(e);
  }
}

export const POST = networkRoute(handlePOST);
