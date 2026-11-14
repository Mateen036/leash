// BASE=http://localhost:3002 npx tsx scripts/defi/perps-e2e.ts [--guest <id> (uses /workspace/secrets/leash/e2e-guests.json)]
// Real testnet: guest -> guard -> Orderly account via Chain Signatures -> faucet -> 3x long (guard-authorized) -> 10x rejected on-chain -> close.
import { Account, JsonRpcProvider, KeyPair, base64Encode } from "near-api-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import deployment from "../../lib/near/deployment.testnet.json";
import { defaultPolicy, installGuardActions } from "../../lib/near/guard";
import { actionDigest } from "../../lib/defi/tokens";
const BASE = process.env.BASE || "http://localhost:3002";
const PRIV = "/workspace/secrets/leash/e2e-guests.json";
const out: any = { base: BASE, startedAt: new Date().toISOString(), steps: [] };
const step = (name: string, data: any) => { out.steps.push({ name, ...data }); console.log(name, JSON.stringify(data).slice(0, 300)); writeFileSync(process.env.OUT || "docs/defi-perps-e2e.json", JSON.stringify(out, null, 2) + "\n"); };
const post = async (p: string, b: unknown) => { const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };
let id: string, key: KeyPair;
const gi = process.argv.indexOf("--guest");
if (gi > 0) { id = process.argv[gi + 1]; key = KeyPair.fromString(JSON.parse(readFileSync(PRIV, "utf8")).find((r: any) => r.accountId === id).privateKey); }
else {
  key = KeyPair.fromRandom("ed25519");
  const g = await post("/api/near/guest", { publicKey: key.getPublicKey().toString() });
  id = g.body.accountId; step("createGuest", { account: id, tx: g.body.txHash });
  const recs = existsSync(PRIV) ? JSON.parse(readFileSync(PRIV, "utf8")) : []; recs.push({ accountId: id, privateKey: key.toString(), createdAt: new Date().toISOString(), purpose: "perps-e2e" }); writeFileSync(PRIV, JSON.stringify(recs, null, 2), { mode: 0o600 });
  await new Promise((r) => setTimeout(r, 2000));
  const acc = new Account(id, new JsonRpcProvider({ url: deployment.rpcUrl }), key.toString() as any);
  const inst: any = await acc.signAndSendTransaction({ receiverId: id, actions: installGuardActions(deployment.leash.agentGuardPublicKey, defaultPolicy(), id), waitUntil: "FINAL" } as any);
  step("installGuard", { tx: inst.transaction.hash });
}
out.account = id;
const auth = (payload: object) => { const message = ["leash_perp", actionDigest(payload), String(Date.now())].join("|"); return { accountId: id, message, publicKey: key.getPublicKey().toString(), signature: base64Encode(key.sign(new TextEncoder().encode(message)).signature) }; };
const b = await post("/api/perps/bootstrap", { auth: auth({}) }); step("bootstrap", { status: b.status, ...b.body });
let usdc = b.body.usdcBalance || 0;
for (let i = 0; i < 80 && usdc <= 0; i++) { await new Promise((r) => setTimeout(r, 15000)); const p = await (await fetch(`${BASE}/api/perps/positions?account=${id}`)).json(); usdc = p.usdcBalance || 0; if (i % 4 === 0) console.log("waiting for faucet USDC…", i); }
step("faucetBalance", { usdc });
if (usdc <= 0) throw new Error("Faucet USDC never arrived");
const o1 = { symbol: "PERP_ETH_USDC", side: "BUY", notionalUsd: 30, leverage: 3 };
const r1 = await post("/api/perps/order", { ...o1, auth: auth(o1) }); step("open3x", { status: r1.status, ...r1.body });
const o2 = { symbol: "PERP_ETH_USDC", side: "BUY", notionalUsd: 30, leverage: 10 };
const r2 = await post("/api/perps/order", { ...o2, auth: auth(o2) }); step("reject10x", { status: r2.status, ...r2.body });
await new Promise((r) => setTimeout(r, 4000));
step("positionsAfterOpen", await (await fetch(`${BASE}/api/perps/positions?account=${id}`)).json());
const c = await post("/api/perps/close", { symbol: "PERP_ETH_USDC", auth: auth({ symbol: "PERP_ETH_USDC" }) }); step("close", { status: c.status, ...c.body });
await new Promise((r) => setTimeout(r, 4000));
step("positionsAfterClose", await (await fetch(`${BASE}/api/perps/positions?account=${id}`)).json());
out.finishedAt = new Date().toISOString(); writeFileSync(process.env.OUT || "docs/defi-perps-e2e.json", JSON.stringify(out, null, 2) + "\n");
