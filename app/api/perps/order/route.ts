import { networkRoute } from "@/lib/near/network-server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, limit } from "@/lib/near/api";
import { NearError } from "@/lib/near/server";
import { verifyPerpAuth } from "@/lib/defi/perps-auth";
import {
  ensureAccount,
  findSession,
  markets,
  placeMarket,
  setLeverage,
} from "@/lib/defi/orderly";
import {
  estimateLiquidation,
  requireGuardAuthorization,
  sizeOrder,
} from "@/lib/defi/perps-policy";

const schema = z.object({
  symbol: z.string().regex(/^PERP_[A-Z0-9]+_USDC$/),
  side: z.enum(["BUY", "SELL"]),
  notionalUsd: z.number().positive().max(100_000),
  leverage: z.number().min(1).max(50),
  auth: z.any(),
});
async function handlePOST(request: Request) {
  let authorization: { authTx: string; authId: number } | undefined;
  try {
    limit(request, "perps-order", 10);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new NearError("Invalid order");
    const { auth, ...intent } = parsed.data;
    const id = await verifyPerpAuth(auth, intent);
    const mark = (await markets()).find((m) => m.symbol === intent.symbol);
    if (!mark) throw new NearError("Unknown market");
    const sized = await sizeOrder(intent, mark.markPrice);
    // The guard authorizes (or rejects on-chain) BEFORE anything touches Orderly.
    const guard = await requireGuardAuthorization(id, {
      ...intent,
      notionalUsd: sized.notional,
    });
    if (guard.kind === "rejected")
      return NextResponse.json(
        { ok: false, error: guard.code, rejectedTx: guard.txHash || null },
        { status: 409 },
      );
    if (guard.kind === "on-chain")
      authorization = { authTx: guard.txHash, authId: guard.authId };
    const s = (await findSession(id)) ?? (await ensureAccount(id));
    await setLeverage(
      s,
      intent.symbol,
      Math.max(1, Math.round(intent.leverage)),
    ).catch(() => null);
    const authId = guard.kind === "on-chain" ? guard.authId : Date.now();
    const order = await placeMarket(s, {
      symbol: intent.symbol,
      side: intent.side,
      quantity: sized.quantity,
      clientOrderId: `leash${authId}${Date.now() % 100000}`,
    });
    return NextResponse.json({
      ok: true,
      authTx: guard.kind === "on-chain" ? guard.txHash : null,
      authId: guard.kind === "on-chain" ? guard.authId : null,
      limit:
        guard.kind === "on-chain"
          ? "on-chain guard"
          : "off-chain limit (wallet mode)",
      orderId: order.order_id,
      quantity: sized.quantity,
      notional: sized.notional,
      markPrice: mark.markPrice,
      estLiq: estimateLiquidation(intent.side, mark.markPrice, intent.leverage),
      signerMode: s.mode,
      address: s.address,
    });
  } catch (e) {
    const response = fail(e);
    // A venue failure must not hide a successful on-chain authorization receipt.
    if (authorization)
      return NextResponse.json(
        { ...(await response.json()), ok: false, ...authorization },
        { status: response.status },
      );
    return response;
  }
}

export const POST = networkRoute(handlePOST);
