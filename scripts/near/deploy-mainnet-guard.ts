/** Preflight by default. Publication requires --publish and locally supplied credentials. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Account, actions, baseEncode } from "near-api-js";
import { withNetwork } from "../../lib/near/network-server";
import { near, getDeployment } from "../../lib/near/config";
import { failoverProvider } from "../../lib/near/rpc";
import { networkEnv } from "../../lib/near/env";

await withNetwork("mainnet", async () => {
  const deployment = getDeployment();
  const accountId = networkEnv("RELAYER_ACCOUNT_ID") || deployment.root;
  if (accountId !== deployment.root)
    throw new Error(
      `Deployment account must match ${deployment.root} in deployment.mainnet.json`,
    );
  const wasmPath =
    process.env.MAINNET_GUARD_WASM ||
    "contracts/guard/target/mainnet/wasm32-unknown-unknown/release/guard.wasm";
  const wasm = new Uint8Array(await readFile(wasmPath));
  const strings = new TextDecoder().decode(wasm);
  if (
    !strings.includes("v2.ref-finance.near") ||
    !strings.includes("contract.main.burrow.near") ||
    strings.includes("ref-finance-101.testnet")
  )
    throw new Error(
      "This is not a mainnet guard artifact. Build with --features mainnet and a separate target directory.",
    );
  const codeHash = baseEncode(createHash("sha256").update(wasm).digest());
  const provider = failoverProvider();
  const state = await provider.query<any>({
    request_type: "view_account",
    finality: "final",
    account_id: accountId,
  });
  // NEAR global contract publication charges storage once at 0.0001 NEAR per byte.
  // Keep one additional NEAR for gas and subsequent operations.
  const publicationCost = BigInt(wasm.length) * 10n ** 20n;
  const required = publicationCost + 10n ** 24n;
  const unlocked =
    BigInt(state.amount) - BigInt(state.storage_usage) * 10n ** 19n;
  const available = unlocked > 0n ? unlocked : 0n;
  console.log(
    JSON.stringify(
      {
        network: near.network,
        accountId,
        bytes: wasm.length,
        codeHash,
        publicationCostYoctoNear: publicationCost.toString(),
        requiredYoctoNear: required.toString(),
        availableYoctoNear: available.toString(),
        funded: available >= required,
        publish: process.argv.includes("--publish"),
      },
      null,
      2,
    ),
  );
  if (!process.argv.includes("--publish")) return;
  if (available < required)
    throw new Error(
      "Fund the deployment account before publishing; no transaction was sent.",
    );
  const privateKey = networkEnv("RELAYER_PRIVATE_KEY");
  if (!privateKey)
    throw new Error(
      "Set MAINNET_RELAYER_PRIVATE_KEY locally. Never put it in chat or git.",
    );
  const result: any = await new Account(
    accountId,
    provider,
    privateKey as `ed25519:${string}`,
  ).signAndSendTransaction({
    receiverId: accountId,
    actions: [actions.deployGlobalContract(wasm, "codeHash")],
    waitUntil: "FINAL",
    throwOnFailure: false,
  } as any);
  const outcomes = [
    result.status,
    ...(result.receipts_outcome || []).map((r: any) => r.outcome.status),
  ];
  if (!outcomes.every((s: any) => s && !("Failure" in s)))
    throw new Error(
      `Publication failed; inspect transaction ${result.transaction.hash}`,
    );
  deployment.leash.guardCodeHash = codeHash;
  deployment.leash.guardGlobalTx = result.transaction.hash;
  await writeFile(
    new URL("../../lib/near/deployment.mainnet.json", import.meta.url),
    JSON.stringify(deployment, null, 2) + "\n",
  );
  console.log(
    `Published ${codeHash}: ${near.explorer}/txns/${result.transaction.hash}`,
  );
});
