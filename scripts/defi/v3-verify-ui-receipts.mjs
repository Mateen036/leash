// Independently verifies the UI smoke's public transaction hashes with NEAR RPC.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const smoke = JSON.parse(readFileSync("docs/defi-v3-tokens-ui.json", "utf8"));
const deployment = JSON.parse(
  readFileSync("lib/near/deployment.testnet.json", "utf8"),
);
const transactions = [
  ...smoke.transactions.map((t) => ({
    kind: t.kind,
    hash: t.hash,
    signer: smoke.accountId,
  })),
  ...smoke.faucet.sent.map((t) => ({
    kind: `faucet-${t.symbol}`,
    hash: t.txHash,
    signer: deployment.root,
  })),
];
const results = [];
for (const tx of transactions) {
  const response = await fetch(deployment.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "leash-ui-receipt",
      method: "tx",
      params: {
        tx_hash: tx.hash,
        sender_account_id:
          tx.kind === "create-guest" ? deployment.root : tx.signer,
        wait_until: "FINAL",
      },
    }),
  });
  const data = await response.json();
  assert.equal(data.error, undefined, JSON.stringify(data.error));
  const r = data.result;
  assert.equal(r.transaction.hash, tx.hash);
  assert.equal(r.final_execution_status, "FINAL");
  const statuses = [
    r.status,
    ...r.receipts_outcome.map((item) => item.outcome.status),
  ];
  assert.ok(
    statuses.every((status) => !status.Failure),
    tx.hash,
  );
  results.push({
    kind: tx.kind,
    hash: tx.hash,
    signer: r.transaction.signer_id,
    status: r.final_execution_status,
    receipts: r.receipts_outcome.length,
    allReceiptsSucceeded: true,
  });
  console.log(
    `FINAL ${tx.kind} ${tx.hash} (${r.receipts_outcome.length} successful receipts)`,
  );
}
writeFileSync(
  process.env.EVIDENCE || "docs/defi-v3-ui-receipts.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      rpc: deployment.rpcUrl,
      passed: true,
      results,
    },
    null,
    2,
  ) + "\n",
);
