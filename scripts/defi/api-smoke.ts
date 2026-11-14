// Run against a running server: BASE=http://localhost:3001 npx tsx scripts/defi/api-smoke.ts
// Creates a real guest via the API, installs the guard with the browser-style key, then runs guarded actions through /api/defi/execute.
import { Account, JsonRpcProvider, KeyPair, base64Encode } from "near-api-js";
import deployment from "../../lib/near/deployment.testnet.json";
import { defaultPolicy, installGuardActions } from "../../lib/near/guard";
import { actionDigest, toBase } from "../../lib/defi/tokens";
const BASE = process.env.BASE || "http://localhost:3001";
const post = async (p: string, b: unknown) => { const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };
const key = KeyPair.fromRandom("ed25519");
const g = await post("/api/near/guest", { publicKey: key.getPublicKey().toString() });
console.log("guest", g.status, g.body.accountId, g.body.txHash);
const id = g.body.accountId as string;
const acc = new Account(id, new JsonRpcProvider({ url: deployment.rpcUrl }), key.toString() as any);
await new Promise((r) => setTimeout(r, 2000));
const inst: any = await acc.signAndSendTransaction({ receiverId: id, actions: installGuardActions(deployment.leash.agentGuardPublicKey, defaultPolicy(), id), waitUntil: "FINAL" } as any);
console.log("install", inst.transaction.hash);
async function exec(action: any) {
  const message = ["leash_exec", actionDigest(action), String(Date.now())].join("|");
  const sig = key.sign(new TextEncoder().encode(message)).signature;
  const r = await post("/api/defi/execute", { action, auth: { accountId: id, message, publicKey: key.getPublicKey().toString(), signature: base64Encode(sig) } });
  console.log(action.kind, r.status, JSON.stringify(r.body).slice(0, 200));
  return r;
}
await exec({ kind: "LinearStake", amount: toBase("0.1", 24) });
const q = await (await fetch(`${BASE}/api/defi/quote?kind=swap&tokenIn=wrap.testnet&tokenOut=usdc.lapdemo-11140542.testnet&amountIn=${toBase("0.05", 24)}`)).json();
await exec({ kind: "RefSwap", pool_id: 2973, token_in: "wrap.testnet", token_out: "usdc.lapdemo-11140542.testnet", amount_in: toBase("0.05", 24), min_amount_out: (BigInt(q.amountOut) * 9950n / 10000n).toString() });
await exec({ kind: "LinearStake", amount: toBase("0.8", 24) });
console.log(JSON.stringify((await (await fetch(`${BASE}/api/defi/state?account=${id}`)).json()).activity).slice(0, 400));
