import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateLiquidation } from "../lib/defi/perps-policy";
import {
  PerpsRequestError,
  marketName,
  perpsRequest,
  previewRisk,
  rejectionReason,
  usd,
} from "../components/perps/model";

test("perp preview matches server liquidation estimates in both directions at every UI leverage", () => {
  for (const side of ["BUY", "SELL"] as const) {
    for (let leverage = 1; leverage <= 20; leverage++) {
      const risk = previewRisk(side, 1900, 30, leverage)!;
      const server = estimateLiquidation(side, 1900, leverage);
      assert.ok(Math.abs(risk.liquidation - server.price) < 1e-8);
      assert.ok(Math.abs(risk.distancePct - server.distancePct) < 1e-8);
      assert.equal(risk.margin, 30 / leverage);
      assert.equal(risk.quantity, 30 / 1900);
      assert.equal(risk.fee, 0.03);
      assert.equal(
        side === "BUY" ? risk.liquidation < 1900 : risk.liquidation > 1900,
        true,
      );
    }
  }
});

test("invalid preview inputs never render non-finite money or liquidation values", () => {
  for (const args of [
    [0, 30, 2],
    [1900, 0, 2],
    [1900, -1, 2],
    [1900, NaN, 2],
    [1900, 30, 0],
    [Infinity, 30, 2],
  ]) {
    assert.equal(previewRisk("BUY", args[0], args[1], args[2]), null);
  }
  assert.equal(usd(NaN), "—");
  assert.equal(usd(undefined), "—");
  assert.equal(marketName("PERP_ETH_USDC"), "ETH");
});

test("on-chain rejection codes become actionable explanations without claiming a fill", () => {
  assert.match(rejectionReason("LEVERAGE"), /leverage above your limit/);
  assert.match(rejectionReason("Smart contract panicked: PAUSED"), /paused/);
  assert.match(rejectionReason("NOTIONAL"), /position above your limit/);
  assert.equal(
    rejectionReason("Orderly: insufficient collateral"),
    "Not enough balance",
  );
});

test("HTTP 409 preserves the failed NEAR receipt and never automatically retries an action", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { leverage: 10 });
    return Response.json(
      { ok: false, error: "LEVERAGE", rejectedTx: "failed-near-hash" },
      { status: 409 },
    );
  };
  try {
    await assert.rejects(
      perpsRequest("/api/perps/order", { leverage: 10 }),
      (error) => {
        assert.ok(error instanceof PerpsRequestError);
        assert.equal(error.result.rejectedTx, "failed-near-hash");
        assert.equal(error.message, "LEVERAGE");
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("successful orders preserve venue IDs and auth receipts; unreadable responses fail visibly", async () => {
  const original = globalThis.fetch;
  try {
    const receipt = {
      ok: true,
      authTx: "near-authorization",
      authId: 1,
      orderId: 42,
    };
    globalThis.fetch = async () => Response.json(receipt);
    assert.deepEqual(await perpsRequest("/api/perps/order", {}), receipt);
    globalThis.fetch = async () =>
      Response.json(
        {
          ok: false,
          error: "Orderly: insufficient collateral",
          authTx: "near-authorization",
          authId: 1,
        },
        { status: 500 },
      );
    await assert.rejects(perpsRequest("/api/perps/order", {}), (error) => {
      assert.ok(error instanceof PerpsRequestError);
      assert.equal(error.result.authTx, "near-authorization");
      assert.equal(error.result.authId, 1);
      assert.equal(error.result.orderId, undefined);
      return true;
    });
    globalThis.fetch = async () =>
      new Response("temporarily unavailable", { status: 502 });
    await assert.rejects(perpsRequest("/api/perps/order", {}), /502/);
  } finally {
    globalThis.fetch = original;
  }
});
