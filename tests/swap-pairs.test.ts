import assert from "node:assert/strict";
import test from "node:test";
import { SWAP_TOKENS, TOKENS, poolFor, toBase } from "../lib/defi/tokens";
import { defaultPolicy } from "../lib/near/guard";
import {
  selectSwapToken,
  swapBalance,
  swapMax,
  swapProposal,
  withTokenCaps,
} from "../components/leash/swap-model";
import { tokenDisplay, tokensInText } from "../components/leash/token-display";
import { buildCopilotTransactions } from "../lib/defi/copilot";
import { bridgeDestinations } from "../lib/near/intents";
import { destinationTokens, validAddress } from "../lib/bridge/validation";

test("every picker selection and flip produces an executable single-hop pair", () => {
  for (const nonNear of SWAP_TOKENS.slice(1)) {
    for (const pair of [
      { source: "NEAR", target: nonNear.symbol },
      { source: nonNear.symbol, target: "NEAR" },
    ]) {
      for (const selected of SWAP_TOKENS) {
        for (const side of ["from", "to"] as const) {
          const next = selectSwapToken(pair, side, selected.symbol);
          assert.equal(
            next[side === "from" ? "source" : "target"],
            selected.symbol,
          );
          assert.notEqual(next.source, next.target);
          assert.ok(next.source === "NEAR" || next.target === "NEAR");
          const input = SWAP_TOKENS.find((t) => t.symbol === next.source)!;
          const output = SWAP_TOKENS.find((t) => t.symbol === next.target)!;
          assert.equal(
            poolFor(input.id, output.id),
            poolFor(output.id, input.id),
          );
        }
      }
    }
  }
  assert.throws(() =>
    selectSwapToken({ source: "NEAR", target: "USDT" }, "from", "missing"),
  );
});

test("MAX preserves all token decimals and retains native NEAR gas reserve", () => {
  const near = SWAP_TOKENS[0],
    usdt = SWAP_TOKENS.find((t) => t.symbol === "USDT")!;
  const tokens = {
    wNEAR: toBase("0.03", 24),
    USDT: "123456789012345678901234",
  };
  assert.equal(
    swapBalance(near, toBase("0.2", 24), tokens),
    BigInt(toBase("0.23", 24)),
  );
  assert.equal(swapMax(near, toBase("0.2", 24), tokens), "0.08");
  assert.equal(swapMax(near, toBase("0.01", 24), tokens), "0.03");
  assert.equal(toBase(swapMax(usdt, "0", tokens), 24), tokens.USDT);
});

test("enabling missing tokens preserves existing custom and zero caps and every other policy field", () => {
  const policy = defaultPolicy();
  const usdt = SWAP_TOKENS.find((t) => t.symbol === "USDT")!;
  delete policy.caps[usdt.id];
  policy.caps[TOKENS.wNEAR.id] = { per_action: "0", daily: "0" };
  policy.paused = true;
  const updated = withTokenCaps(policy, SWAP_TOKENS);
  assert.deepEqual(updated.caps[usdt.id], usdt.cap);
  assert.deepEqual(updated.caps[TOKENS.wNEAR.id], policy.caps[TOKENS.wNEAR.id]);
  assert.equal(updated.paused, true);
  assert.equal(updated.expires_at_ms, policy.expires_at_ms);
  assert.equal(policy.caps[usdt.id], undefined);
});

test("USDT proposal uses the quoted pool and exact 24-decimal minimum in both directions", () => {
  const near = SWAP_TOKENS[0],
    usdt = SWAP_TOKENS.find((t) => t.symbol === "USDT")!;
  const quote = {
    amountOut: "123456789012345678901234",
    poolId: usdt.pool!,
    quotedAt: Date.now(),
    pool: {
      token_account_ids: [near.id, usdt.id],
      amounts: [toBase("100", 24), toBase("200", 24)],
      total_fee: 30,
    },
  };
  const p = swapProposal(
    near,
    usdt,
    "0.05",
    toBase("0.05", 24),
    quote,
    defaultPolicy(),
    {},
  );
  assert.equal(p.guardAction?.kind, "RefSwap");
  if (p.guardAction?.kind !== "RefSwap") throw new Error("Missing swap");
  assert.equal(p.guardAction.pool_id, usdt.pool);
  assert.equal(
    p.guardAction.min_amount_out,
    ((BigInt(quote.amountOut) * 9950n) / 10000n).toString(),
  );
  assert.match(p.facts[0].value, /0\.122839505067283950506727 USDT/);
  const reverse = swapProposal(
    usdt,
    near,
    "0.01",
    toBase("0.01", 24),
    quote,
    defaultPolicy(),
    {},
  );
  assert.equal(reverse.blocked, undefined);
  assert.match(reverse.facts[0].value, /wNEAR$/);
  assert.throws(
    () =>
      swapProposal(
        near,
        usdt,
        "0.05",
        toBase("0.05", 24),
        { ...quote, poolId: 2973 },
        defaultPolicy(),
        {},
      ),
    /Route changed/,
  );
});

test("token artwork resolves contracts and perps while text symbols do not overlap", () => {
  assert.equal(tokenDisplay("PERP_ETH_USDC").logo, "/tokens/eth.png");
  assert.equal(tokenDisplay("wNEAR").logo, "/tokens/near.png");
  assert.equal(
    tokenDisplay("linear-protocol.testnet").logo,
    "/tokens/linear.svg",
  );
  assert.equal(tokenDisplay("UNKNOWN").logo, undefined);
  assert.deepEqual(
    tokensInText("Receive 0.1 LiNEAR").map((t) => t.symbol),
    ["LiNEAR"],
  );
  assert.deepEqual(
    tokensInText("Swap 1 tUSDC to NEAR").map((t) => t.symbol),
    ["NEAR", "tUSDC"],
  );
});

test("every swap token reaches co-pilot output registration and the correct pool unchanged", () => {
  for (const t of SWAP_TOKENS.slice(1)) {
    const action = {
      kind: "RefSwap" as const,
      pool_id: t.pool!,
      token_in: TOKENS.wNEAR.id,
      token_out: t.id,
      amount_in: toBase("0.05", 24),
      min_amount_out: "123",
    };
    const txs = buildCopilotTransactions("wallet.testnet", action);
    const registration = txs.find((tx) => tx.receiverId === t.id)!;
    assert.equal(registration.calls[0].method, "storage_deposit");
    assert.deepEqual(registration.calls[0].args, {
      account_id: "wallet.testnet",
      registration_only: true,
    });
    const transfer = txs.at(-1)!.calls[0];
    const msg = JSON.parse((transfer.args as { msg: string }).msg);
    assert.deepEqual(msg.actions[0], {
      pool_id: t.pool,
      token_in: TOKENS.wNEAR.id,
      token_out: t.id,
      amount_in: action.amount_in,
      min_amount_out: "123",
    });
  }
});

test("bridge preview and wallet catalogs share expanded assets and supported address formats", () => {
  const tokens = [
    "USDC",
    "USDT",
    "ETH",
    "BTC",
    "SOL",
    "BNB",
    "POL",
    "AVAX",
    "WBTC",
    "DAI",
  ].flatMap((symbol) =>
    ["base", "arb", "eth", "sol", "btc", "bsc", "pol", "avax", "op"].map(
      (blockchain) => ({
        symbol,
        blockchain,
        assetId: `${blockchain}-${symbol}`,
        decimals: 18,
      }),
    ),
  );
  assert.equal(bridgeDestinations(tokens).length, tokens.length);
  assert.deepEqual(destinationTokens(tokens), bridgeDestinations(tokens));
  assert.equal(
    bridgeDestinations([{ ...tokens[0], symbol: "UNSUPPORTED" }]).length,
    0,
  );
  assert.equal(
    bridgeDestinations([{ ...tokens[0], blockchain: "unknown" }]).length,
    0,
  );
  for (const chain of ["base", "arb", "eth", "bsc", "pol", "avax", "op"]) {
    assert.equal(
      validAddress(chain, "0x52908400098527886E0F7030069857D2E4169EE7"),
      true,
    );
    assert.equal(
      validAddress(chain, "0x0000000000000000000000000000000000000000"),
      false,
    );
    assert.equal(validAddress(chain, "bad-address"), false);
  }
});
