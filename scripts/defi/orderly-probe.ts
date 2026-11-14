// npx tsx scripts/defi/orderly-probe.ts <nearAccountId>  — bootstrap + faucet (loads /workspace/secrets/leash/.dev.vars)
import { readFileSync } from "node:fs";
for (const l of readFileSync("/workspace/secrets/leash/.dev.vars", "utf8").split("\n")) { const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1); }
const { ensureAccount, requestFaucet, holdings, positions, accountInfo } = await import("../../lib/defi/orderly");
const id = process.argv[2] || "leash-11141537.testnet";
const t = Date.now();
const s = await ensureAccount(id);
console.log("session", JSON.stringify({ ...s }), "ms", Date.now() - t);
console.log("faucet", JSON.stringify(await requestFaucet(s.address)));
console.log("holdings", JSON.stringify(await holdings(s)));
console.log("info", JSON.stringify(await accountInfo(s)).slice(0, 300));
