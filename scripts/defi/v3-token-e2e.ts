// Real testnet e2e for every listed swap token through the guard + the faucet for a plain (wallet-style) account.
// Usage: set -a; . /workspace/secrets/leash/.dev.vars; set +a; npx tsx scripts/defi/v3-token-e2e.ts > docs/defi-v3-tokens-e2e.json
import { Account, JsonRpcProvider, KeyPair, nearToYocto } from "near-api-js";
import deployment from "../../lib/near/deployment.testnet.json";
import { defaultPolicy, installGuardActions } from "../../lib/near/guard";
import { createGuest, relayerAccount } from "../../lib/near/server";
import { agentExecute, swapQuote, view } from "../../lib/defi/server";
import { SWAP_TOKENS, TOKENS, fromBase, poolFor, toBase } from "../../lib/defi/tokens";
import { claimFaucet } from "../../lib/defi/faucet";
const out: any = { at: new Date().toISOString(), swaps: [], faucet: null };
const log = (...a: any[]) => console.error(...a);
const key = KeyPair.fromRandom("ed25519");
const g = await createGuest(key.getPublicKey().toString());
out.guest = g; log("guest", g.accountId);
await new Promise((r) => setTimeout(r, 2500));
const acc = new Account(g.accountId, new JsonRpcProvider({ url: deployment.rpcUrl }), key.toString() as any);
const inst: any = await acc.signAndSendTransaction({ receiverId: g.accountId, actions: installGuardActions(deployment.leash.agentGuardPublicKey, defaultPolicy(), g.accountId), waitUntil: "FINAL" } as any);
out.install = inst.transaction.hash; log("install", out.install);
for (const t of SWAP_TOKENS.filter((t) => t.pool != null)) {
  const amountIn = toBase("0.04", 24);
  const q = await swapQuote(TOKENS.wNEAR.id, t.id, amountIn);
  const min = (BigInt(q.amountOut) * 9900n / 10000n).toString();
  const r1 = await agentExecute(g.accountId, { kind: "RefSwap", pool_id: poolFor(TOKENS.wNEAR.id, t.id), token_in: TOKENS.wNEAR.id, token_out: t.id, amount_in: amountIn, min_amount_out: min } as any);
  const bal = await view<string>(t.id, "ft_balance_of", { account_id: g.accountId });
  const back = (BigInt(bal) / 2n).toString();
  let r2: any = { ok: false, error: "skipped" };
  if (BigInt(back) > 0n) {
    const q2 = await swapQuote(t.id, TOKENS.wNEAR.id, back);
    r2 = await agentExecute(g.accountId, { kind: "RefSwap", pool_id: t.pool, token_in: t.id, token_out: TOKENS.wNEAR.id, amount_in: back, min_amount_out: (BigInt(q2.amountOut) * 9900n / 10000n).toString() } as any);
  }
  const row = { symbol: t.symbol, pool: t.pool, nearToToken: { ok: r1.ok, tx: r1.txHash, error: r1.error, received: fromBase(bal, t.decimals, 6) }, tokenToNear: { ok: r2.ok, tx: r2.txHash, error: r2.error, sent: fromBase(back, t.decimals, 6) } };
  out.swaps.push(row); log(JSON.stringify(row));
}
// Over-limit swap must be rejected on-chain (per-action cap 0.5 NEAR).
const big = toBase("0.6", 24);
const qb = await swapQuote(TOKENS.wNEAR.id, "usdt.itachicara.testnet", big);
const rb = await agentExecute(g.accountId, { kind: "RefSwap", pool_id: 1084, token_in: TOKENS.wNEAR.id, token_out: "usdt.itachicara.testnet", amount_in: big, min_amount_out: (BigInt(qb.amountOut) * 99n / 100n).toString() } as any);
out.overLimit = { ok: rb.ok, tx: rb.txHash, error: rb.error }; log("overlimit", JSON.stringify(out.overLimit));
// Wallet-style plain account (full-access key, no guard) claims the faucet.
const wkey = KeyPair.fromRandom("ed25519");
const wid = `w-${Date.now().toString(36)}.${deployment.root}`;
const cr: any = await relayerAccount().createSubAccount({ accountOrPrefix: wid.split(".")[0], publicKey: wkey.getPublicKey().toString(), nearToTransfer: nearToYocto("0.1") } as any);
log("wallet acct", wid, cr.transaction.hash);
await new Promise((r) => setTimeout(r, 2500));
out.faucet = { walletAccount: wid, createTx: cr.transaction.hash, result: await claimFaucet(wid) };
log("faucet", JSON.stringify(out.faucet));
console.log(JSON.stringify(out, null, 2));
