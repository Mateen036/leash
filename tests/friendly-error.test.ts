import test from "node:test";
import assert from "node:assert/strict";
import { friendlyError, errorDetail } from "../components/leash/friendly-error";

const cases: [unknown, string][] = [
  [
    "Smart contract panicked: CAP_PER_ACTION",
    "Blocked: over your per-trade limit",
  ],
  ["CAP_DAILY", "Blocked: daily limit reached"],
  ["DAILY", "Blocked: daily limit reached"],
  ["PAUSED", "Agent is paused"],
  ["EXPIRED", "Your limits have expired — renew them in Guardrails"],
  ["PROTOCOL_NOT_ALLOWED", "That app isn't on your allow-list"],
  ["ASSET_NOT_ALLOWED", "That token isn't on your allow-list"],
  ["SLIPPAGE", "Price moved too much — try again"],
  ["E68", "Price moved too much — try again"],
  ["slippage error", "Price moved too much — try again"],
  ["LEVERAGE", "Blocked: leverage above your limit"],
  ["max_leverage", "Blocked: leverage above your limit"],
  ["BUSY", "Another action is still finishing — try again in a moment"],
  ["LOW_BALANCE", "Not enough balance"],
  ["NotEnoughBalance", "Not enough balance"],
  ["not enough funds", "Not enough balance"],
  [
    "relayer out of funds",
    "Guest sign-ups are busy — try again or connect a wallet",
  ],
  [
    "Exceeded 4 providers",
    "Guest sign-ups are busy — try again or connect a wallet",
  ],
  [
    "LackBalanceForState",
    "Guest sign-ups are busy — try again or connect a wallet",
  ],
  [
    "guest creation failure",
    "Guest sign-ups are busy — try again or connect a wallet",
  ],
  [
    "HTTP 429 rate limit",
    "Guest sign-ups are busy — try again or connect a wallet",
  ],
  ["too many requests", "Too many requests — wait a minute"],
  ["rate limit", "Too many requests — wait a minute"],
  ["User rejected request", "Cancelled in your wallet"],
  ["wallet closed", "Cancelled in your wallet"],
  [new TypeError("Failed to fetch"), "Network problem — try again"],
  [{ error: "network failed" }, "Network problem — try again"],
  ["faucet cooldown", "Already claimed — try again later"],
  ["Quote expired", "Quote expired — get a new quote"],
  [undefined, "Something went wrong — try again"],
  ["unknown backend failure", "Something went wrong — try again"],
];
for (const [raw, expected] of cases)
  test(`friendly error: ${String(raw)}`, () => {
    assert.equal(friendlyError(raw).title, expected);
    assert.equal(friendlyError(friendlyError(raw).title).title, expected);
  });
test("diagnostics omit credentials, environment names, paths and stacks", () => {
  const detail = errorDetail(
    "bad AGENT_GUARD_PRIVATE_KEY ed25519:secret /workspace/secrets/key\n    at handler (x:1)",
  );
  for (const privateText of [
    "ed25519",
    "secret",
    "AGENT_GUARD_PRIVATE_KEY",
    "/workspace",
    "handler",
  ])
    assert.ok(!detail.includes(privateText));
});

test("diagnostics never render structured payloads or contract calls", () => {
  assert.doesNotMatch(
    errorDetail(
      '{"method":"agent_execute","amount":"200000000000000000000000"}',
    ),
    /[{]|agent_execute|200000/,
  );
  assert.doesNotMatch(
    errorDetail("unknown failure in ft_transfer_call with 1e24 yoctoNEAR"),
    /ft_transfer_call|1e24|yocto/,
  );
});
