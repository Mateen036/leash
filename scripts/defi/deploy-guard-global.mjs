// Build: cargo near build non-reproducible-wasm --manifest-path contracts/guard/Cargo.toml
// Run: node scripts/defi/deploy-guard-global.mjs
// Immutable global publication costs 0.0001 test NEAR per byte. Uses only Leash reserves.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Account, actions, baseEncode, nearToYocto } from 'near-api-js';
import { connection, ROOT, DEPLOYMENT_PATH, WASM_PATH, assertSuccess, failures } from './guard-common.mjs';
const { root, provider, deployment, env } = connection();
const wasm = readFileSync(WASM_PATH);
const hash = baseEncode(createHash('sha256').update(wasm).digest());
if (deployment.leash?.guardCodeHash === hash && deployment.leash?.guardGlobalTx) {
  console.log(JSON.stringify({ root: ROOT, guardCodeHash: hash, guardGlobalTx: deployment.leash.guardGlobalTx, alreadyPublished: true }));
  process.exit(0);
}
const evidencePath = new URL('../../docs/defi-e2e.json', import.meta.url);
function record(name, result) {
  const evidence = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, 'utf8')) : {};
  evidence.guardDeployment ??= { network: 'testnet', transactions: [] };
  evidence.guardDeployment.transactions.push({ name, txHash: result.transaction.hash, outcome: result.status, receiptFailures: failures(result) });
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
}
async function available(accountId) {
  const state = await provider.query({ request_type: 'view_account', account_id: accountId, finality: 'optimistic' });
  return BigInt(state.amount) - BigInt(state.storage_usage) * 10n ** 19n;
}
// Leave enough to create the real guest after publication. Reserve accounts retain gas funds.
const required = BigInt(wasm.length) * 10n ** 20n + nearToYocto('1.65');
for (const id of ['leashfunda-11141537.testnet', 'leashfundb-11141537.testnet']) {
  const missing = required - await available(ROOT);
  if (missing <= 0n) break;
  const spare = await available(id) - nearToYocto('0.01');
  if (spare <= 0n) continue;
  const credential = JSON.parse(readFileSync(join(homedir(), '.near-credentials/testnet', `${id}.json`), 'utf8'));
  const reserve = new Account(id, provider, credential.private_key);
  const result = await reserve.signAndSendTransaction({ receiverId: ROOT, actions: [actions.transfer(spare < missing ? spare : missing)], waitUntil: 'FINAL', throwOnFailure: false });
  record(`fundRoot:${id}`, result); assertSuccess(result);
  console.log('Root funded', id, result.transaction.hash);
}
if (await available(ROOT) < required) throw new Error(`Insufficient Leash testnet funds for ${wasm.length}-byte global contract plus guest reserve`);
const result = await root.signAndSendTransaction({ receiverId: ROOT, actions: [actions.deployGlobalContract(wasm, 'codeHash')], waitUntil: 'FINAL', throwOnFailure: false });
record('deployGlobalGuard', result); assertSuccess(result);
const policyJson = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
  "import {defaultPolicy} from './lib/near/guard.ts'; process.stdout.write(JSON.stringify(defaultPolicy()));"], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });
deployment.leash = { ...deployment.leash, root: ROOT, guardCodeHash: hash, guardGlobalTx: result.transaction.hash,
  agentGuardPublicKey: env.AGENT_GUARD_PUBLIC_KEY, defaultPolicy: JSON.parse(policyJson) };
writeFileSync(DEPLOYMENT_PATH, JSON.stringify(deployment, null, 2) + '\n');
console.log(JSON.stringify({ root: ROOT, guardCodeHash: hash, guardGlobalTx: result.transaction.hash, bytes: wasm.length }));
