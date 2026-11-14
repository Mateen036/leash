// Run: npx tsx scripts/defi/e2e-guard.ts
// Real testnet receipts only; private guest keys are written outside this repository.
import { Account, KeyPair, actions, nearToYocto, baseEncode } from "near-api-js";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { join } from "node:path";
import {
  defaultPolicy, installGuardActions, agentExecuteTransaction, authorizePerpTransaction,
  revokeAgentTransaction, getActivity, getPolicy, getSpent, type GuardAction,
} from "../../lib/near/guard";
import { connection, ROOT, PRIVATE_DIR, WASM_PATH, view, failures } from "./guard-common.mjs";

const { root, provider, env, deployment, agentKey } = connection();
const resumeId = process.argv.includes("--resume") ? process.argv[process.argv.indexOf("--resume") + 1] : undefined;
const preflight = process.argv.includes("--preflight") || !!resumeId;
const codeHash = preflight ? baseEncode(createHash("sha256").update(readFileSync(WASM_PATH)).digest()) : deployment.leash.guardCodeHash;
if (!codeHash) throw new Error("Publish the global guard first");
const guest = resumeId ?? `g-${randomBytes(3).toString("hex")}.${ROOT}`;
const privatePath = join(PRIVATE_DIR, "e2e-guests.json");
const privateRecords = existsSync(privatePath) ? JSON.parse(readFileSync(privatePath,"utf8")) : [];
const ownerKey = resumeId ? KeyPair.fromString(privateRecords.find((r:any)=>r.accountId===resumeId).privateKey) : KeyPair.fromRandom("ed25519");
const owner = new Account(guest, provider, ownerKey.toString());
const agent = new Account(guest, provider, agentKey.toString());
const publicKey = env.AGENT_GUARD_PUBLIC_KEY;
if (!Array.isArray(privateRecords)) throw new Error("Expected private e2e-guests.json to contain an array");
if (!resumeId) privateRecords.push({ accountId: guest, privateKey: ownerKey.toString(), createdAt: new Date().toISOString() });
writeFileSync(privatePath,JSON.stringify(privateRecords,null,2)+"\n",{mode:0o600}); chmodSync(privatePath,0o600);
const evidencePath = new URL("../../docs/defi-e2e.json",import.meta.url);
// Preserve other task evidence and all previous guard runs.
const document = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath,"utf8")) : {};
const evidence: any = resumeId ? document.guard : { network:"testnet", startedAt:new Date().toISOString(), guest,
  preflight, guardCodeHash:codeHash, globalDeployTx:deployment.leash.guardGlobalTx,
  installation:"UseGlobalContract", passed:false, transactions:[], checks:{}, notes:[
    "Protocol success is verified from receipts, guard activity and actual balances/positions.",
    "Rejected panics roll back contract state; see failed transaction receipts for rejection history.",
    "Caps reserve attempted spend, including failed protocol calls. Slippage bps is applied to a live server quote; guard requires a positive minimum and Ref enforces it.",
    "authorize_perp grants an authorization id only; this script does not place an Orderly order.",
  ] };
const oldRuns = (document.guardRuns ?? []).filter((r:any)=>r.guest!==guest);
function save() { const latest = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath,"utf8")) : {}; latest.guard = evidence; latest.guardRuns = [...oldRuns,evidence]; writeFileSync(evidencePath,JSON.stringify(latest,null,2)+"\n"); }
function record(name:string, r:any) {
  const f=failures(r);
  const entry={name,txHash:r.transaction.hash,outcome:r.status,receiptFailures:f,gasBurnt:[r.transaction_outcome,...(r.receipts_outcome??[])].reduce((n,x)=>n+BigInt(x?.outcome?.gas_burnt??0),0n).toString()};
  evidence.transactions.push(entry);save();console.log(name,entry.txHash, f.length?"FAILED":"OK");return entry;
}
async function send(name:string,account:Account,tx:any,expectedFailure?:string) {
  const r=await account.signAndSendTransaction({...tx,waitUntil:"FINAL",throwOnFailure:false});
  const entry=record(name,r);
  if (expectedFailure) {
    if(!JSON.stringify(entry.receiptFailures).includes(expectedFailure))throw new Error(`${name}: expected ${expectedFailure}`);
  } else if (entry.receiptFailures.length || (typeof r.status === "object" && "Failure" in r.status)) {
    throw new Error(`${name}: ${JSON.stringify(entry.receiptFailures)}`);
  }
  return r;
}
async function execute(name:string,action:GuardAction) {
  const r=await send(name,agent,agentExecuteTransaction(guest,action));
  const last=(await getActivity(guest)).at(-1);
  if(!last?.ok || last.reason!=="COMPLETED")throw new Error(`${name}: guard activity ${JSON.stringify(last)}`);
  evidence.checks[name]={activity:last};save();return r;
}
async function poll<T>(fn:()=>Promise<T>,ok:(value:T)=>boolean):Promise<T> {
  let value:T;
  for(let i=0;i<12;i++){value=await fn();if(ok(value))return value;await new Promise(r=>setTimeout(r,1500));}
  throw new Error(`On-chain balance check failed: ${JSON.stringify(value!)}`);
}
try {
  if (!resumeId) await send("createGuest",root,{receiverId:guest,actions:[actions.createAccount(),actions.transfer(nearToYocto("1.5")),actions.addFullAccessKey(ownerKey.getPublicKey())]});
  const policy=defaultPolicy();
  if (resumeId) {
    await send("upgradePreflightGuard",owner,{receiverId:guest,actions:[actions.deployContract(readFileSync(WASM_PATH))]});
    await send("clearPreflightPending",owner,{receiverId:guest,actions:[actions.functionCall("pause",{},30_000_000_000_000n,0n),actions.functionCall("unpause",{},30_000_000_000_000n,0n)]});
    evidence.guardCodeHash=codeHash;
  } else {
  const install=await owner.signAndSendTransaction({receiverId:guest,actions:installGuardActions(publicKey,policy,guest,{codeHash}),waitUntil:"FINAL",throwOnFailure:false});
  const global=record("installGlobalGuard",install);
  if(global.receiptFailures.length || (typeof install.status==="object" && "Failure" in install.status)) {
    evidence.installation="DeployContract fallback";
    await send("fundFallbackStorage",root,{receiverId:guest,actions:[actions.transfer(BigInt(readFileSync(WASM_PATH).length) * 10n ** 19n + nearToYocto("0.1"))]});
    await send("installFallbackGuard",owner,{receiverId:guest,actions:installGuardActions(publicKey,policy,guest,{fallbackWasm:readFileSync(WASM_PATH)})});
  }
  }
  const keys=await owner.getAccessKeyList();
  const permission=keys.keys.find((k:any)=>k.public_key===publicKey)?.access_key.permission;
  evidence.checks.agentKeyPermission=permission;
  if(typeof permission!=="object" || !("FunctionCall" in permission) || permission.FunctionCall.receiver_id!==guest || permission.FunctionCall.method_names.join(",")!=="agent_execute,authorize_perp")throw new Error("Incorrect function-call key permission");
  if (!evidence.checks.linearBalance) await execute("linearStake",{kind:"LinearStake",amount:nearToYocto("0.2").toString()});
  const linear=await poll<string>(()=>view(provider,"linear-protocol.testnet","ft_balance_of",{account_id:guest}),n=>BigInt(n)>0n);
  evidence.checks.linearBalance=linear; save();
  // Pool 2973 has verified live reserves. Quote immediately before the transaction.
  const input=nearToYocto("0.1").toString();
  const outputToken="usdc.lapdemo-11140542.testnet";
  const quote=await view(provider,"ref-finance-101.testnet","get_return",{pool_id:2973,token_in:"wrap.testnet",token_out:outputToken,amount_in:input});
  const minimum=(BigInt(quote)*BigInt(10_000-policy.max_slippage_bps)/10_000n).toString();
  if(BigInt(minimum)<=0n)throw new Error("Live pool has no liquidity");
  evidence.checks.swapQuote={poolId:2973,input,quote,minAmountOut:minimum,quotedAt:new Date().toISOString()};save();
  if (!evidence.checks.refSwap) await execute("refSwap",{kind:"RefSwap",pool_id:2973,token_in:"wrap.testnet",token_out:outputToken,amount_in:input,min_amount_out:minimum});
  const output=await poll<string>(()=>view(provider,outputToken,"ft_balance_of",{account_id:guest}),n=>BigInt(n)>=BigInt(minimum));
  evidence.checks.swapOutput={token:outputToken,amount:output};save();
  await execute("burrowSupply",{kind:"BurrowSupply",token:"wrap.testnet",amount:nearToYocto("0.2").toString(),as_collateral:false});
  const supplied=await view(provider,"contract.burrow.testnet","get_account",{account_id:guest});
  const suppliedAmount=supplied.supplied.find((a:any)=>a.token_id==="wrap.testnet")?.balance??"0";
  if(BigInt(suppliedAmount)<nearToYocto("0.199"))throw new Error("Burrow supplied balance missing");
  evidence.checks.burrowAfterSupply=supplied;save();
  const wnearBefore=await view(provider,"wrap.testnet","ft_balance_of",{account_id:guest});
  await execute("burrowWithdraw",{kind:"BurrowWithdraw",token:"wrap.testnet",amount:nearToYocto("0.2").toString()});
  const withdrawn=await poll<string>(()=>view(provider,"wrap.testnet","ft_balance_of",{account_id:guest}),n=>BigInt(n)-BigInt(wnearBefore)>=nearToYocto("0.2"));
  evidence.checks.burrowWithdrawal={before:wnearBefore,after:withdrawn,account:await view(provider,"contract.burrow.testnet","get_account",{account_id:guest})};save();
  await send("overCapStake",agent,agentExecuteTransaction(guest,{kind:"LinearStake",amount:nearToYocto("0.9").toString()}),"CAP_PER_ACTION");
  const auth={venue:"orderly-testnet",symbol:"PERP_ETH_USDC",side:"BUY",notional_usd:50,leverage_x100:300};
  const authorized=await send("authorizePerp3x",agent,authorizePerpTransaction(guest,auth));
  if(typeof authorized.status!=="object" || !("SuccessValue" in authorized.status))throw new Error("Missing authorization id");
  evidence.checks.perpAuthorizationId=JSON.parse(Buffer.from(authorized.status.SuccessValue,"base64").toString());
  await send("rejectPerp20x",agent,authorizePerpTransaction(guest,{...auth,leverage_x100:2000}),"LEVERAGE");
  // Sign before revocation so the post-revoke test actually submits a signed transaction.
  const signed=await agent.createSignedTransaction(agentExecuteTransaction(guest,{kind:"LinearStake",amount:nearToYocto("0.01").toString()}));
  const attemptedHash=baseEncode(createHash("sha256").update(signed.transaction.encode()).digest());
  await send("revokeAgent",owner,revokeAgentTransaction(guest));
  if((await owner.getAccessKeyList()).keys.some((k:any)=>k.public_key===publicKey))throw new Error("Agent key still exists");
  evidence.checks.agentKeyDeleted=true;
  let rejected=false;
  try {
    const r=await provider.sendTransaction(signed);record("afterRevoke",r);
    if(!(typeof r.status==="object" && "Failure" in r.status))throw new Error("Revoked key was accepted");
    rejected=true;
  } catch(error) {
    const reason=String((error as Error).message);
    if(!/AccessKeyDoesNotExist|access key.*not exist|access key.*doesn't exist|not found|UNKNOWN_ACCESS_KEY/i.test(reason))throw error;
    rejected=true;
    evidence.transactions.push({name:"afterRevoke",txHash:attemptedHash,outcome:"RPC_REJECTED",includedOnChain:false,reason:reason.slice(0,1600)});save();
    console.log("afterRevoke",attemptedHash,"RPC_REJECTED (deleted access key; not included on chain)");
  }
  if(!rejected)throw new Error("Revocation not verified");
  evidence.checks.finalPolicy=await getPolicy(guest); evidence.checks.spent=await getSpent(guest); evidence.checks.activity=await getActivity(guest);
  delete evidence.error; evidence.passed=true; evidence.finishedAt=new Date().toISOString();save();
  console.log("GUARD E2E PASSED",guest);
} catch(error) {
  evidence.error=String((error as Error).message).slice(0,3000);evidence.finishedAt=new Date().toISOString();save();
  console.error("GUARD E2E FAILED",evidence.error);process.exitCode=1;
}
