import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBudget } from "../lib/agent/intent";
import { parseAction, rulesPlan } from "../lib/agent/planner";
import { ActionSchema } from "../lib/agent/actions";
import { defaultPolicy } from "../lib/near/guard";
import { policyCheck } from "../lib/defi/preview";
import { toBase } from "../lib/defi/tokens";
test("USD budget parsing preserves units", () => {
  assert.equal(parseBudget("under $20")?.units, 20000000n);
  assert.equal(parseBudget("budget 2.5")?.units, 2500000n);
  assert.equal(parseBudget("1k USDC")?.units, 1000000000n);
  assert.equal(parseBudget("budget 0"), undefined);
});
const prompts = [
  [
    "long ETH 3x with 20 USDC",
    {
      kind: "perp_open",
      symbol: "PERP_ETH_USDC",
      side: "BUY",
      notionalUsd: 20,
      leverage: 3,
    },
  ],
  ["stake 1 NEAR", { kind: "stake", amount: "1" }],
  [
    "supply 5 USDT",
    {
      kind: "explain",
      topic:
        "Only NEAR/wNEAR supply and withdrawal are executable. Other lending markets are read only; choose supply 0.2 NEAR.",
    },
  ],
  ["swap 0.1 USDC to NEAR", { kind: "swap", amount: "0.1", source: "USDC", target: "NEAR" }],
  ["swap 0.2 near to usdt", { kind: "swap", amount: "0.2", source: "NEAR", target: "USDT" }],
  ["swap 3 tusdc to near", { kind: "swap", amount: "3", source: "tUSDC", target: "NEAR" }],
  [
    "bridge 20 USDC to Base",
    { kind: "bridge_quote", amount: "20", source: "USDC", destination: "base" },
  ],
  ["close all", { kind: "close_all" }],
  [
    "lever up 20x",
    {
      kind: "perp_open",
      symbol: "PERP_ETH_USDC",
      side: "BUY",
      notionalUsd: 30,
      leverage: 20,
    },
  ],
  ["unstake 0.1 NEAR", { kind: "unstake", amount: "0.1" }],
  ["withdraw 0.2 wNEAR", { kind: "withdraw", amount: "0.2" }],
  ["show my portfolio", { kind: "portfolio" }],
] as const;
for (const [prompt, expected] of prompts)
  test(`planner: ${prompt}`, () => {
    assert.deepEqual(parseAction(prompt), expected);
    assert.ok(ActionSchema.safeParse(parseAction(prompt)).success);
  });
test("over-limit requests preserve original size for visible guard refusals", () => {
  assert.deepEqual(parseAction("Prove the leash works"), {
    kind: "stake",
    amount: "0.9",
  });
  const p = defaultPolicy();
  assert.equal(policyCheck(p, {}, "near", toBase("1", 24)), "CAP_PER_ACTION");
  const a = parseAction("lever up 20x");
  assert.equal(
    a.kind === "perp_open" && a.leverage > p.max_leverage_x100 / 100,
    true,
  );
  assert.equal(rulesPlan("stake 1 NEAR").actions[0].kind, "stake");
});
test("strict action schema rejects extra destinations and unsafe amounts", () => {
  assert.equal(
    ActionSchema.safeParse({ kind: "stake", amount: "-1" }).success,
    false,
  );
  assert.equal(
    ActionSchema.safeParse({ kind: "stake", amount: "0" }).success,
    false,
  );
  assert.equal(
    ActionSchema.safeParse({
      kind: "stake",
      amount: "0.1",
      receiver: "evil.testnet",
    }).success,
    false,
  );
});
