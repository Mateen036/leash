// Real Ref Finance v2 testnet pool. No keys are logged or written to the repository.
// LAP_SECRETS_DIR=/workspace/secrets/leash node scripts/near/setup-ref-pool.mjs
// Official ABI: https://github.com/ref-finance/docs/blob/main/contracts/ref-exchange.md
// Instant swaps: https://github.com/ref-finance/ref-sdk/blob/main/src/v1-swap/instantSwap.ts
import { Account, JsonRpcProvider, nearToYocto } from "near-api-js";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const path = new URL("../../lib/near/deployment.testnet.json", import.meta.url);
const d = JSON.parse(readFileSync(path, "utf8"));
const p = new JsonRpcProvider({ url: d.rpcUrl });
const key = JSON.parse(
  readFileSync(
    join(homedir(), ".near-credentials/testnet", `${d.root}.json`),
    "utf8",
  ),
).private_key;
const root = new Account(d.root, p, key);
const ref = "ref-finance-101.testnet",
  wrap = "wrap.testnet";
async function view(contract, method, args = {}) {
  const r = await p.query({
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(r.result).toString());
}
async function call(contractId, methodName, args, deposit = 0n) {
  const r = await root.callFunctionRaw({
    contractId,
    methodName,
    args,
    deposit,
    gas: 150_000_000_000_000n,
  });
  for (const o of [r, ...(r.receipts_outcome || []).map((x) => x.outcome)])
    if (o.status?.Failure)
      throw new Error(`${methodName}: ${JSON.stringify(o.status.Failure)}`);
  console.log(
    methodName,
    `https://testnet.nearblocks.io/txns/${r.transaction.hash}`,
  );
  return r;
}
await p.viewAccount({ accountId: ref, finality: "final" });
await p.viewAccount({ accountId: wrap, finality: "final" });
const tokens = await fetch("https://1click.chaindefuser.com/v0/tokens", {
  signal: AbortSignal.timeout(15000),
}).then((r) => r.json());
const price = tokens.find((t) => t.assetId === "nep141:wrap.near");
if (!(price?.price > 0)) throw new Error("No live NEAR price");
const nearAmount = process.env.LAP_POOL_NEAR || "1";
const wAmount = nearToYocto(nearAmount).toString();
const usdcAmount = String(Math.round(Number(nearAmount) * price.price * 1e6));
if (BigInt(usdcAmount) > 100_000_000n)
  throw new Error("Use modest liquidity <=100 tUSDC");
// Idempotent: existing recorded pool is never re-seeded.
if (Number.isInteger(d.refPoolId)) {
  console.log(
    "Recorded pool",
    d.refPoolId,
    await view(ref, "get_pool", { pool_id: d.refPoolId }),
  );
  process.exit(0);
}
await call(d.tokenContract, "register", { account_id: ref });
for (const account_id of [d.root, ref]) {
  if (!(await view(wrap, "storage_balance_of", { account_id })))
    await call(
      wrap,
      "storage_deposit",
      { account_id, registration_only: true },
      nearToYocto("0.00125"),
    );
}
await call(
  ref,
  "storage_deposit",
  { account_id: d.root, registration_only: false },
  nearToYocto("0.05"),
);
// Ref documents per-account token registration as the workaround for non-whitelisted tokens.
await call(ref, "register_tokens", { token_ids: [d.tokenContract, wrap] }, 1n);
await call(d.tokenContract, "faucet", { amount: usdcAmount });
await call(wrap, "near_deposit", {}, BigInt(wAmount));
const created = await call(
  ref,
  "add_simple_pool",
  { tokens: [d.tokenContract, wrap], fee: 30 },
  nearToYocto("0.05"),
);
const poolId = JSON.parse(
  Buffer.from(created.status.SuccessValue, "base64").toString(),
);
// Persist immediately so an interrupted run does not create another pool. Rerun instructions below.
d.refContract = ref;
d.wrapContract = wrap;
d.refPoolId = poolId;
d.refPoolSetup = {
  createdTx: created.transaction.hash,
  seedNear: nearAmount,
  seedTusdc: usdcAmount,
  nearUsd: price.price,
  priceUpdatedAt: price.priceUpdatedAt,
  seeded: false,
};
writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
await call(
  d.tokenContract,
  "ft_transfer_call",
  { receiver_id: ref, amount: usdcAmount, msg: "" },
  1n,
);
await call(
  wrap,
  "ft_transfer_call",
  { receiver_id: ref, amount: wAmount, msg: "" },
  1n,
);
const seeded = await call(
  ref,
  "add_liquidity",
  {
    pool_id: poolId,
    amounts: [usdcAmount, wAmount],
    min_amounts: [usdcAmount, wAmount],
  },
  nearToYocto("0.01"),
);
d.refPoolSetup.seeded = true;
d.refPoolSetup.liquidityTx = seeded.transaction.hash;
writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
console.log(
  "Live pool",
  poolId,
  await view(ref, "get_pool", { pool_id: poolId }),
);
