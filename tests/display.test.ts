import test from "node:test";
import assert from "node:assert/strict";
import {
  plainText,
  formatAmount,
  shortAccount,
  protocolName,
  assetLabel,
  actionName,
} from "../components/leash/display";

test("financial display groups thousands and limits decimals without rounding tiny balances to zero", () => {
  assert.equal(formatAmount("1234567.123456"), "1,234,567.1235");
  assert.equal(formatAmount(0.000001), "<0.0001");
  assert.equal(formatAmount(Number.NaN), "—");
  assert.equal(
    plainText("Fee 0.123456 NEAR, value $12345.678901"),
    "Fee 0.1235 NEAR, value $12,345.6789",
  );
  assert.equal(plainText("Use 5, then 10."), "Use 5, then 10.");
});
test("UI replaces protocol internals and shortens accounts without changing their stored IDs", () => {
  assert.equal(
    protocolName("Ref get_return + get_pool · pool 2973"),
    "Ref Finance",
  );
  assert.equal(assetLabel("usdc.fakes.testnet"), "Test USDC");
  assert.equal(actionName("COMPLETED"), "Confirmed");
  assert.equal(
    shortAccount("g-abcdef.leash-11141537.testnet"),
    "g-abcdef…testnet",
  );
  assert.equal(plainText("Close PERP_ETH_USDC"), "Close ETH");
  assert.doesNotMatch(
    plainText('{"method":"agent_execute"}'),
    /[{]|agent_execute/,
  );
});
