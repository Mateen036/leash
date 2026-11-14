import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { KeyPair } from "near-api-js";
import {
  defaultPolicy, installGuardActions, agentExecuteArgs, authorizePerpArgs,
  agentExecuteTransaction, authorizePerpTransaction, setPolicyTransaction,
  pauseTransaction, unpauseTransaction, revokeAgentTransaction,
  getPolicy, getActivity, getSpent, getAgentKey, GUARD_KEY_ALLOWANCE, GUARD_GAS, GUARD_ACTION_GAS,
} from "../lib/near/guard";
const accountId = "g-test01.leash-11141537.testnet";
const publicKey = KeyPair.fromRandom("ed25519").getPublicKey().toString();
const decode = (value: Uint8Array) => JSON.parse(new TextDecoder().decode(value));

test("guard defaults use exact base units and seven-day expiry", () => {
  const p = defaultPolicy(1000);
  assert.equal(p.expires_at_ms, 1000 + 7 * 86_400_000);
  assert.deepEqual(p.caps.near, { per_action: (5n * 10n ** 23n).toString(), daily: (15n * 10n ** 23n).toString() });
  assert.deepEqual(p.caps["wrap.testnet"], p.caps.near);
  assert.deepEqual(p.caps["usdtt.fakes.testnet"], { per_action: "50000000", daily: "150000000" });
  assert.deepEqual(p.caps["usdc.fakes.testnet"], p.caps["usdtt.fakes.testnet"]);
  assert.deepEqual(p.caps.perp_usd, { per_action: "500", daily: "1500" });
  assert.equal(p.max_leverage_x100, 500); assert.equal(p.max_perp_notional_usd, 500);
  assert.equal(p.max_slippage_bps, 100); assert.equal(p.paused, false);
  assert.ok(p.allowed_protocols.includes("orderly-testnet"));
  p.caps.near.daily = "1";
  assert.notEqual(defaultPolicy(1000).caps.near.daily, "1");
  assert.notEqual(p.caps["wrap.testnet"].daily, "1");
});
test("global installation is atomic and agent key has only two methods on self", () => {
  const policy = defaultPolicy(1000);
  const batch = installGuardActions(publicKey, policy, accountId, { codeHash: "11111111111111111111111111111111" });
  assert.deepEqual(batch.map(a => a.enum), ["useGlobalContract", "functionCall", "addKey"]);
  assert.equal(batch[1].functionCall!.methodName, "init");
  assert.deepEqual(decode(batch[1].functionCall!.args), { agent_pk: publicKey, policy });
  assert.equal(batch[1].functionCall!.deposit, 0n);
  const key = batch[2].addKey!;
  assert.equal(key.publicKey.toString(), publicKey);
  assert.equal(key.accessKey.permission.enum, "functionCall");
  const permission = key.accessKey.permission.functionCall!;
  assert.equal(permission.receiverId, accountId);
  assert.deepEqual(permission.methodNames, ["agent_execute", "authorize_perp"]);
  assert.equal(permission.allowance, GUARD_KEY_ALLOWANCE);
  assert.throws(() => installGuardActions(publicKey, policy, ""), /accountId/);
  assert.throws(() => installGuardActions("bad", policy, accountId, { codeHash: "11111111111111111111111111111111" }));
});
test("explicit fallback changes only installation code action", () => {
  const wasm = new Uint8Array([0,97,115,109]);
  const batch = installGuardActions(publicKey, defaultPolicy(1), accountId, { fallbackWasm: wasm });
  assert.deepEqual(batch.map(a => a.enum), ["deployContract", "functionCall", "addKey"]);
  assert.deepEqual(batch[0].deployContract!.code, wasm);
});
test("agent builders preserve tagged amounts and never attach deposits", () => {
  const action = { kind: "LinearStake" as const, amount: "200000000000000000000000" };
  assert.deepEqual(agentExecuteArgs(action), { action });
  const tx = agentExecuteTransaction(accountId, action);
  assert.equal(tx.receiverId, accountId);
  assert.equal(tx.actions[0].functionCall!.gas, GUARD_ACTION_GAS.LinearStake);
  assert.equal(GUARD_ACTION_GAS.RefSwap, GUARD_GAS);
  assert.equal(tx.actions[0].functionCall!.deposit, 0n);
  assert.deepEqual(decode(tx.actions[0].functionCall!.args), { action });
  const auth = { venue: "orderly-testnet", symbol: "PERP_ETH_USDC", side: "BUY", notional_usd: 50, leverage_x100: 300 };
  assert.deepEqual(authorizePerpArgs(auth), auth);
  assert.equal(authorizePerpTransaction(accountId, auth).actions[0].functionCall!.methodName, "authorize_perp");
  assert.equal(authorizePerpTransaction(accountId, auth).actions[0].functionCall!.deposit, 0n);
});
test("owner controls target the user's own guard with exact contract arguments", () => {
  const p = defaultPolicy(1);
  const calls = [setPolicyTransaction(accountId,p), pauseTransaction(accountId), unpauseTransaction(accountId), revokeAgentTransaction(accountId)];
  assert.deepEqual(calls.map(t => t.actions[0].functionCall!.methodName), ["set_policy", "pause", "unpause", "revoke_agent"]);
  assert.deepEqual(decode(calls[0].actions[0].functionCall!.args), { policy: p });
  for (const t of calls) { assert.equal(t.receiverId, accountId); assert.equal(t.actions[0].functionCall!.deposit, 0n); }
});
test("typed views decode actual RPC bytes and surface RPC/HTTP failures", async () => {
  const requests: any[] = [];
  const expected: Record<string, unknown> = { get_policy: defaultPolicy(1), get_activity: [], get_spent: { near: { day_index: 1, amount: "123" } }, get_agent_key: publicKey };
  const server = createServer(async (req,res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body.params);
    res.setHeader("content-type", "application/json");
    if (body.params.account_id === "http.testnet") {res.statusCode=503;res.end("{}");return;}
    if (body.params.account_id === "missing.testnet") {res.end(JSON.stringify({error:{message:"Unknown account"}}));return;}
    res.end(JSON.stringify({result:{result:[...new TextEncoder().encode(JSON.stringify(expected[body.params.method_name]))]}}));
  });
  await new Promise<void>(r => server.listen(0,"127.0.0.1",r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.deepEqual(await getPolicy(accountId,url), expected.get_policy);
    assert.deepEqual(await getActivity(accountId,url), []);
    assert.deepEqual(await getSpent(accountId,url), expected.get_spent);
    assert.equal(await getAgentKey(accountId,url), publicKey);
    assert.equal(requests[0].account_id,accountId); assert.equal(requests[0].args_base64,"e30=");
    await assert.rejects(getPolicy("missing.testnet",url), /Unknown account/);
    await assert.rejects(getPolicy("http.testnet",url), /HTTP 503/);
  } finally {await new Promise<void>((resolve,reject) => server.close(e=>e?reject(e):resolve()));}
});
