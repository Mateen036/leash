import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyPair } from "near-api-js";
import {
  near,
  toUnits,
  fromUnits,
  isGuestAccount,
  txUrl,
} from "../lib/near/config";
import {
  rejectReason,
  allowedMethods,
  type RelayAction,
} from "../lib/near/relay-policy";
import { buildDryQuote, NEAR_USDC } from "../lib/near/intents";
import { verifyAccountSignature, NearError } from "../lib/near/server";

const guest = `g-abcd12.${near.root}`;
const fc = (
  methodName: string,
  args: object = {},
  deposit = 0n,
  gas = 30_000_000_000_000n,
): RelayAction => ({
  methodName,
  args: new TextEncoder().encode(JSON.stringify(args)),
  gas,
  deposit,
});

test("token units round-trip without float drift", () => {
  assert.equal(toUnits("25.3"), "25300000");
  assert.equal(toUnits(0.1 + 0.2), "300000");
  assert.equal(fromUnits("25300000"), "25.3");
  assert.equal(fromUnits(1_000_000n), "1");
  assert.equal(fromUnits("1"), "0.000001");
  assert.throws(() => toUnits("-1"));
  assert.throws(() => toUnits("1.1234567"));
  assert.match(txUrl("abc"), /^https:\/\/testnet\.nearblocks\.io\/txns\/abc$/);
});

test("deployment points at testnet contracts", () => {
  assert.equal(near.network, "testnet");
  assert.ok(near.token.endsWith(".testnet"));
  assert.equal(near.tokenSymbol, "tUSDC");
});

test("only relayer-created guest accounts are sponsored", () => {
  assert.ok(isGuestAccount(guest));
  assert.ok(!isGuestAccount(`g-abcd12.evil.testnet`));
  assert.ok(!isGuestAccount(`alice.${near.root}`));
  assert.ok(!isGuestAccount(`g-AB.${near.root}`));
});

test("relay sponsorship excludes all legacy budget and transfer calls", () => {
  assert.deepEqual(allowedMethods(near.token), ["faucet"]);
  assert.equal(allowedMethods("legacy-budget.testnet"), undefined);
  assert.equal(
    rejectReason({
      senderId: guest,
      receiverId: near.token,
      actions: [fc("faucet")],
    }),
    null,
  );
  assert.match(
    rejectReason({
      senderId: guest,
      receiverId: near.token,
      actions: [fc("ft_transfer_call")],
    })!,
    /not sponsored/,
  );
  assert.match(
    rejectReason({
      senderId: "alice.testnet",
      receiverId: near.token,
      actions: [fc("faucet")],
    })!,
    /guest/,
  );
  assert.match(
    rejectReason({
      senderId: guest,
      receiverId: near.token,
      actions: [fc("faucet", {}, 2n)],
    })!,
    /Deposits/,
  );
  assert.match(
    rejectReason({ senderId: guest, receiverId: near.token, actions: [null] })!,
    /function calls/,
  );
});

test("1Click funding quotes are dry previews to NEAR USDC", () => {
  const q = buildDryQuote("base-usdc", "25000000", "alice.near", 0);
  assert.equal(q.dry, true);
  assert.equal(q.swapType, "EXACT_OUTPUT");
  assert.equal(q.destinationAsset, NEAR_USDC);
  assert.equal(q.recipient, "alice.near");
  assert.match(q.refundTo, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(q.deadline, new Date(600_000).toISOString());
  assert.equal(
    buildDryQuote("near-wnear", "1", "alice.near").refundTo,
    "alice.near",
  );
});

test("signed agent requests reject tampering and replays before any RPC call", async () => {
  const kp = KeyPair.fromRandom("ed25519");
  const msg = `leash_exec|4700000|1|${Date.now()}`;
  const sig = Buffer.from(
    kp.sign(new TextEncoder().encode(msg)).signature,
  ).toString("base64");
  const tampered = msg.replace("4700000", "9700000");
  await assert.rejects(
    verifyAccountSignature(guest, tampered, kp.getPublicKey().toString(), sig),
    (e: NearError) => e.status === 401 && /Bad signature/.test(e.message),
  );
  const old = `leash_exec|1|1|${Date.now() - 10 * 60_000}`;
  const oldSig = Buffer.from(
    kp.sign(new TextEncoder().encode(old)).signature,
  ).toString("base64");
  await assert.rejects(
    verifyAccountSignature(guest, old, kp.getPublicKey().toString(), oldSig),
    /expired/,
  );
});
