// Read-only planner API smoke: BASE=http://localhost:3001 npx tsx scripts/defi/agent-smoke.ts
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const base = process.env.BASE || "http://localhost:3001";
const prompts = [
  "long ETH 3x with 20 USDC",
  "stake 1 NEAR",
  "supply 5 USDT",
  "swap 0.1 USDC to NEAR",
  "bridge 20 USDC to Base",
  "close all",
  "lever up 20x",
  "unstake 0.1 NEAR",
  "withdraw 0.2 wNEAR",
  "show my portfolio",
];
const expected = [
  "perp_open",
  "stake",
  "explain",
  "swap",
  "bridge_quote",
  "close_all",
  "perp_open",
  "unstake",
  "withdraw",
  "portfolio",
];
const results = [];
for (const [index, message] of prompts.entries()) {
  const r = await fetch(`${base}/api/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const result = await r.json();
  assert.ok(r.ok, `${message}: ${JSON.stringify(result)}`);
  assert.equal(result.actions[0].kind, expected[index], message);
  if (message === "stake 1 NEAR")
    assert.equal(result.proposals[0].blocked, "CAP_PER_ACTION");
  if (message === "lever up 20x")
    assert.equal(result.proposals[0].blocked, "LEVERAGE");
  console.log(
    "PASS",
    message,
    result.source,
    result.actions[0].kind,
    result.proposals[0].blocked || "preview",
  );
  results.push({ message, status: r.status, ...result });
}
writeFileSync(
  new URL("../../docs/defi-agent-smoke.json", import.meta.url),
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + "\n",
);
