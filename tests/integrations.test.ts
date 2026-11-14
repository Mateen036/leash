import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntent, parseFinancialIntent } from "../lib/agent/intent";
import {
  poolReturn,
  minimumOut,
  units,
  formatted,
  swapInput,
  swapMessage,
  swapQuote,
} from "../lib/near/swap";
import {
  buildBridgeQuote,
  bridgeDestinations,
  BRIDGE_LABEL,
} from "../lib/near/intents";
import { near } from "../lib/near/config";
test("financial parsing distinguishes direction and destination chains", () => {
  assert.deepEqual(parseFinancialIntent("swap 5 USDC to NEAR"), {
    action: "swap",
    source: "USDC",
    target: "NEAR",
    amount: "5",
    error: undefined,
  });
  assert.equal(parseFinancialIntent("swap 2 NEAR to USDC")?.source, "NEAR");
  assert.equal(parseFinancialIntent("convert $5 to NEAR")?.amount, "5");
  assert.equal(parseIntent("bridge 20 USDC to Base").finance?.target, "base");
  assert.equal(
    parseFinancialIntent("send 10 USDC to arbitrum")?.action,
    "bridge",
  );
  assert.equal(
    parseFinancialIntent("swap 5 USDC to BTC")?.error,
    "I can't swap to BTC yet",
  );
  assert.match(
    parseFinancialIntent("bridge 20 USDC to imaginary")?.error || "",
    /can't bridge to/,
  );
  assert.match(
    parseFinancialIntent("swap 2 ETH to NEAR")?.error || "",
    /can't swap ETH/,
  );
  assert.equal(parseFinancialIntent("explain slippage"), undefined);
});
test("pool math uses integer fee and minimum rounding without precision loss", () => {
  const r = poolReturn(1000000n, 3000000n, 1000000000000000000000000n, 30);
  assert.equal(r, 249437077808356267200400n);
  assert.equal(
    minimumOut("100000000000000000000001", 100),
    "99000000000000000000000",
  );
  assert.equal(
    units("1.000000000000000000000001", 24),
    "1000000000000000000000001",
  );
  assert.equal(
    formatted("1000000000000000000000001", 24),
    "1.000000000000000000000001",
  );
  assert.throws(() => units("1.0000001", 6));
  assert.throws(() => units("-1", 24));
  assert.throws(() => units("0", 6));
  assert.throws(() => minimumOut("1", 10001));
  assert.throws(() => poolReturn(1n, 0n, 1n, 30));
  assert.equal(
    swapInput.safeParse({ direction: "EVIL", amount: "1" }).success,
    false,
  );
});
test("instant swap message fixes output delivery to wNEAR and exact minimum", () => {
  const msg = JSON.parse(
    swapMessage({
      poolId: 2973,
      tokenIn: near.token,
      tokenOut: "wrap.testnet",
      amountIn: "100000",
      minAmountOut: "1",
    }),
  );
  assert.equal(msg.skip_unwrap_near, true);
  assert.equal(msg.actions.length, 1);
  assert.equal(msg.actions[0].min_amount_out, "1");
  assert.equal(msg.swap_out_recipient, undefined);
});
test("bridge request is always dry exact input and uses live-catalog assets", () => {
  const origin = {
    assetId: "nep141:wrap.near",
    blockchain: "near",
    symbol: "wNEAR",
    decimals: 24,
  };
  const dest = {
    assetId: "nep141:base-test",
    blockchain: "base",
    symbol: "USDC",
    decimals: 6,
  };
  const q = buildBridgeQuote(origin, dest, "123", 0);
  assert.equal(q.dry, true);
  assert.equal(q.swapType, "EXACT_INPUT");
  assert.equal(q.amount, "123");
  assert.equal(q.originAsset, origin.assetId);
  assert.equal(q.destinationAsset, dest.assetId);
  assert.equal(q.deadline, new Date(600000).toISOString());
  assert.equal((q as any).depositAddress, undefined);
  assert.match(BRIDGE_LABEL, /nothing moves on testnet/);
  assert.deepEqual(
    bridgeDestinations([origin, dest, { ...dest, blockchain: "unknown" }]),
    [dest],
  );
});
test("swap quote takes output from actual RPC get_return, never from sample math", async () => {
  const original = global.fetch;
  let returned = false;
  global.fetch = (async (_url, init) => {
    const call = JSON.parse(String(init?.body));
    const method = call.params.method_name;
    let value: unknown;
    if (method === "get_pool")
      value = {
        pool_kind: "SIMPLE_POOL",
        token_account_ids: [near.token, "wrap.testnet"],
        amounts: ["10000000", "3000000000000000000000000"],
        total_fee: 30,
      };
    else {
      assert.equal(method, "get_return");
      returned = true;
      value = "123456789012345678901234";
    }
    return Response.json({
      result: {
        result: Array.from(new TextEncoder().encode(JSON.stringify(value))),
      },
    });
  }) as typeof fetch;
  try {
    const q = await swapQuote({
      direction: "USDC_TO_NEAR",
      amount: "1",
      slippageBps: 100,
    });
    assert.equal(q.amountOut, "123456789012345678901234");
    assert.equal(q.minAmountOut, "122222221122222222112221");
    assert.equal(returned, true);
  } finally {
    global.fetch = original;
  }
});
