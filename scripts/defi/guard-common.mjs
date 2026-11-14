// Testnet scripts only. Never log keys or persist them inside the repository.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Account, JsonRpcProvider, KeyPair } from 'near-api-js';
export const ROOT = 'leash-11141537.testnet';
export const PRIVATE_DIR = '/workspace/secrets/leash';
export const DEPLOYMENT_PATH = new URL('../../lib/near/deployment.testnet.json', import.meta.url);
export const WASM_PATH = new URL('../../contracts/target/near/guard/guard.wasm', import.meta.url);
export function leashEnv() {
  /** @type {Record<string, string>} */
  const env = {};
  for (const line of readFileSync(join(PRIVATE_DIR, '.dev.vars'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}
export function connection() {
  const deployment = JSON.parse(readFileSync(DEPLOYMENT_PATH, 'utf8'));
  if (deployment.network !== 'testnet') throw new Error('Testnet only');
  const provider = new JsonRpcProvider({ url: deployment.rpcUrl });
  const key = JSON.parse(readFileSync(join(homedir(), '.near-credentials/testnet', `${ROOT}.json`), 'utf8')).private_key;
  const root = new Account(ROOT, provider, key);
  const env = leashEnv();
  const agentKey = KeyPair.fromString(env.AGENT_GUARD_PRIVATE_KEY);
  if (agentKey.getPublicKey().toString() !== env.AGENT_GUARD_PUBLIC_KEY) throw new Error('Agent public/private key mismatch');
  return { deployment, provider, root, env, agentKey };
}
export async function view(provider, accountId, method, args = {}) {
  const r = await provider.query({ request_type: 'call_function', finality: 'optimistic', account_id: accountId,
    method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  return JSON.parse(Buffer.from(r.result).toString());
}
export function failures(result) {
  return [result.transaction_outcome, ...(result.receipts_outcome || [])]
    .filter(x => x?.outcome?.status?.Failure).map(x => ({ receiptId: x.id, failure: x.outcome.status.Failure }));
}
export function assertSuccess(result) {
  if (result.status?.Failure || failures(result).length) throw new Error(`Transaction failed: ${result.transaction.hash} ${JSON.stringify(failures(result))}`);
}
