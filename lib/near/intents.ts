/** NEAR Intents 1Click: "pay in with any asset" previews. Always dry: no deposit address, no funds move. */
export const NEAR_USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

export const FUNDING_ORIGINS = {
  "near-wnear": { label: "NEAR (wNEAR) on NEAR", asset: "nep141:wrap.near", chain: "near", decimals: 24, symbol: "NEAR" },
  "base-usdc": { label: "USDC on Base", asset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", chain: "evm", decimals: 6, symbol: "USDC" },
  "arb-usdc": { label: "USDC on Arbitrum", asset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", chain: "evm", decimals: 6, symbol: "USDC" },
  "eth-eth": { label: "ETH on Ethereum", asset: "nep141:eth.omft.near", chain: "evm", decimals: 18, symbol: "ETH" },
} as const;
export type FundingOrigin = keyof typeof FUNDING_ORIGINS;

// Placeholder refund addresses are only used for dry previews (dry: true never executes).
const PREVIEW_REFUND = { evm: "0x52908400098527886E0F7030069857D2E4169EE7" };

export function buildDryQuote(origin: FundingOrigin, amountUnits: string, recipient: string, now = Date.now()) {
  const o = FUNDING_ORIGINS[origin];
  return {
    dry: true,
    swapType: "EXACT_OUTPUT",
    slippageTolerance: 100,
    originAsset: o.asset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: NEAR_USDC,
    amount: amountUnits,
    refundTo: o.chain === "near" ? recipient : PREVIEW_REFUND[o.chain],
    refundType: "ORIGIN_CHAIN",
    recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(now + 10 * 60_000).toISOString(),
  };
}

export async function dryQuote(origin: FundingOrigin, amountUnits: string, recipient: string) {
  const body = buildDryQuote(origin, amountUnits, recipient);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.ONECLICK_JWT) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  const response = await fetch("https://1click.chaindefuser.com/v0/quote", { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.quote) throw new Error(json.message || `1Click returned ${response.status}`);
  const q = json.quote;
  return {
    origin: FUNDING_ORIGINS[origin].label,
    pay: `${q.amountInFormatted} ${FUNDING_ORIGINS[origin].symbol}`,
    payUsd: q.amountInUsd,
    receive: `${q.amountOutFormatted} USDC on NEAR`,
    timeEstimateSec: q.timeEstimate,
    recipient,
    dry: true,
    correlationId: json.correlationId,
    signature: json.signature,
  };
}

export const BRIDGE_LABEL = 'Quote only - execution happens on mainnet; nothing moves on testnet';
export type IntentsToken = {assetId:string;decimals:number;blockchain:string;symbol:string;price?:number;priceUpdatedAt?:string;contractAddress?:string};
let tokenCache: {at:number;tokens:IntentsToken[]}|undefined;
let tokenPending:Promise<IntentsToken[]>|undefined;
/** Live catalog, short shared cache and coalesced requests to avoid API bursts. No sample fallback. */
export async function intentsTokens():Promise<IntentsToken[]> {
  if(tokenCache&&Date.now()-tokenCache.at<60000) return tokenCache.tokens;
  if(tokenPending) return tokenPending;
  tokenPending=(async()=>{
    const r=await fetch('https://1click.chaindefuser.com/v0/tokens',{signal:AbortSignal.timeout(12000)});
    if(!r.ok) throw new Error(`1Click tokens unavailable (${r.status})`);
    const tokens=await r.json();
    if(!Array.isArray(tokens)||!tokens.every(t=>typeof t.assetId==='string'&&Number.isInteger(t.decimals)&&typeof t.blockchain==='string')) throw new Error('Invalid 1Click token catalog');
    tokenCache={at:Date.now(),tokens};return tokens;
  })();
  try{return await tokenPending;}finally{tokenPending=undefined;}
}
export function bridgeDestinations(tokens:IntentsToken[]) {
  // Display routes only for chains for which the dry API accepts a preview address format.
  const chains=new Set(['base','arb','eth','sol','btc','bsc','pol','avax','op']);
  // All currently listed routes passed a $20 USDC dry quote; see docs/defi-v3-bridge-routes.json.
  const symbols=new Set(['USDC','USDT','ETH','BTC','SOL','BNB','POL','AVAX','WBTC','DAI']);
  return tokens.filter(t=>chains.has(t.blockchain)&&symbols.has(t.symbol.toUpperCase()));
}
export function buildBridgeQuote(origin:IntentsToken,destination:IntentsToken,amount:string,now=Date.now()) {
  const evm='0x52908400098527886E0F7030069857D2E4169EE7';
  const recipient=destination.blockchain==='sol'?'So11111111111111111111111111111111111111112':destination.blockchain==='btc'?'1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa':evm;
  return {dry:true,swapType:'EXACT_INPUT',slippageTolerance:100,originAsset:origin.assetId,destinationAsset:destination.assetId,amount,depositType:'ORIGIN_CHAIN',refundTo:'intents.near',refundType:'ORIGIN_CHAIN',recipient,recipientType:'DESTINATION_CHAIN',deadline:new Date(now+600000).toISOString()};
}
export type BridgeQuote = {kind:'bridge';label:string;dry:true;source:string;destination:string;amountIn:string;amountOut:string;amountOutUsd:string|null;timeEstimateSec:number|null;correlationId:string;quotedAt:number;previewAddresses:true};
export async function bridgeQuote(source:'USDC'|'NEAR',destinationAsset:string,amount:string):Promise<BridgeQuote> {
  const {units}=await import('./swap');
  const tokens=await intentsTokens();
  const origin=tokens.find(t=>t.assetId===(source==='NEAR'?'nep141:wrap.near':NEAR_USDC));
  const destination=bridgeDestinations(tokens).find(t=>t.assetId===destinationAsset);
  if(!origin||!destination) throw new Error('Unsupported bridge token or destination chain');
  const amountUnits=units(amount,origin.decimals);
  if(Number(amount)>1000000) throw new Error('Preview at most 1,000,000 units');
  const headers:Record<string,string>={'content-type':'application/json'};
  if(process.env.ONECLICK_JWT) headers.authorization=`Bearer ${process.env.ONECLICK_JWT}`;
  const r=await fetch('https://1click.chaindefuser.com/v0/quote',{method:'POST',headers,body:JSON.stringify(buildBridgeQuote(origin,destination,amountUnits)),signal:AbortSignal.timeout(15000)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.quote) throw new Error(j.message||`1Click returned ${r.status}`);
  const q=j.quote;
  if(typeof q.amountOutFormatted!=='string') throw new Error('1Click returned an incomplete quote');
  return {kind:'bridge',label:BRIDGE_LABEL,dry:true,source:`${source} on NEAR`,destination:`${destination.symbol} on ${destination.blockchain}`,amountIn:q.amountInFormatted,amountOut:q.amountOutFormatted,amountOutUsd:q.amountOutUsd??null,timeEstimateSec:q.timeEstimate??null,correlationId:j.correlationId,quotedAt:Date.now(),previewAddresses:true};
}
