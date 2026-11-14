// Buys a small faucet reserve of each listed test token for the relayer by swapping NEAR on Ref testnet.
// Usage: set -a; . /workspace/secrets/leash/.dev.vars; set +a; NEAR_EACH=1.2 npx tsx scripts/defi/stock-faucet.ts
import { Account, JsonRpcProvider, actions } from "near-api-js";
import { SWAP_TOKENS, REF, TOKENS, toBase, fromBase } from "../../lib/defi/tokens";
const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
const id = process.env.RELAYER_ACCOUNT_ID!;
const acc = new Account(id, provider, process.env.RELAYER_PRIVATE_KEY as any);
const view = async (c: string, m: string, a: object) => provider.callFunction({ contractId: c, method: m, args: a } as any) as any;
const G = 30_000_000_000_000n;
const each = BigInt(toBase(process.env.NEAR_EACH || "1.2", 24));
const targets = SWAP_TOKENS.filter((t) => t.faucet && t.pool != null && t.id !== TOKENS.tUSDC.id && (!process.env.ONLY || process.env.ONLY.split(",").includes(t.symbol)));
const total = each * BigInt(targets.length);
const wr = BigInt((await view("wrap.testnet", "ft_balance_of", { account_id: id }).catch(() => "0")) || "0");
const ops: any[] = [];
if (!(await view("wrap.testnet", "storage_balance_of", { account_id: id }).catch(() => null))) ops.push(actions.functionCall("storage_deposit", { account_id: id, registration_only: true }, G, 12_500_000_000_000_000_000_000n));
if (wr < total) ops.push(actions.functionCall("near_deposit", {}, G, total - wr));
if (ops.length) { const r: any = await acc.signAndSendTransaction({ receiverId: "wrap.testnet", actions: ops } as any); console.log("wrap", r.transaction.hash); }
if (!(await view(REF, "storage_balance_of", { account_id: id }).catch(() => null))) { const r: any = await acc.signAndSendTransaction({ receiverId: REF, actions: [actions.functionCall("storage_deposit", { account_id: id, registration_only: false }, G, 100_000_000_000_000_000_000_000n)] } as any); console.log("ref storage", r.transaction.hash); }
for (const t of targets) {
  if (!(await view(t.id, "storage_balance_of", { account_id: id }).catch(() => null))) await acc.signAndSendTransaction({ receiverId: t.id, actions: [actions.functionCall("storage_deposit", { account_id: id, registration_only: true }, G, 12_500_000_000_000_000_000_000n)] } as any);
  await acc.signAndSendTransaction({ receiverId: REF, actions: [actions.functionCall("register_tokens", { token_ids: ["wrap.testnet", t.id] }, G, 1n)] } as any);
  const out: string = await view(REF, "get_return", { pool_id: t.pool, token_in: "wrap.testnet", token_out: t.id, amount_in: each.toString() });
  const min = (BigInt(out) * 97n / 100n).toString();
  const msg = JSON.stringify({ force: 0, actions: [{ pool_id: t.pool, token_in: "wrap.testnet", token_out: t.id, amount_in: each.toString(), min_amount_out: min }] });
  const r: any = await acc.signAndSendTransaction({ receiverId: "wrap.testnet", actions: [actions.functionCall("ft_transfer_call", { receiver_id: REF, amount: each.toString(), msg }, 180_000_000_000_000n, 1n)] } as any);
  const bal: string = await view(t.id, "ft_balance_of", { account_id: id });
  console.log(t.symbol, "swap tx", r.transaction.hash, "relayer now holds", fromBase(bal, t.decimals, 4), "claims", (BigInt(bal) / BigInt(t.faucet!)).toString());
}
