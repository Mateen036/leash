// Read-only 1Click probe: records dry quotes, never creates deposits or signs.
import { writeFileSync } from "node:fs";
const catalog = await fetch("https://1click.chaindefuser.com/v0/tokens").then(
  (r) => r.json(),
);
const chains = new Set([
  "base",
  "arb",
  "eth",
  "sol",
  "btc",
  "bsc",
  "pol",
  "avax",
  "op",
]);
const symbols = new Set([
  "USDC",
  "USDT",
  "ETH",
  "BTC",
  "SOL",
  "BNB",
  "POL",
  "AVAX",
  "WBTC",
  "DAI",
]);
const candidates = catalog.filter(
  (t) => chains.has(t.blockchain) && symbols.has(t.symbol.toUpperCase()),
);
const origin = catalog.find(
  (t) =>
    t.assetId ===
    "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
);
const headers = { "content-type": "application/json" };
if (process.env.ONECLICK_JWT)
  headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
const results = [];
let index = 0;
async function worker() {
  while (index < candidates.length) {
    const t = candidates[index++];
    const recipient =
      t.blockchain === "sol"
        ? "So11111111111111111111111111111111111111112"
        : t.blockchain === "btc"
          ? "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
          : "0x52908400098527886E0F7030069857D2E4169EE7";
    let result;
    try {
      const response = await fetch("https://1click.chaindefuser.com/v0/quote", {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          dry: true,
          swapType: "EXACT_INPUT",
          slippageTolerance: 100,
          originAsset: origin.assetId,
          destinationAsset: t.assetId,
          amount: (20n * 10n ** BigInt(origin.decimals)).toString(),
          depositType: "ORIGIN_CHAIN",
          refundTo: "intents.near",
          refundType: "ORIGIN_CHAIN",
          recipient,
          recipientType: "DESTINATION_CHAIN",
          deadline: new Date(Date.now() + 600000).toISOString(),
        }),
      });
      const data = await response.json();
      result = {
        assetId: t.assetId,
        symbol: t.symbol,
        chain: t.blockchain,
        status: response.status,
        ok: response.ok && !!data.quote?.amountOutFormatted,
        amountOut: data.quote?.amountOutFormatted,
        correlationId: data.correlationId,
        error: data.message,
      };
    } catch (e) {
      result = {
        assetId: t.assetId,
        symbol: t.symbol,
        chain: t.blockchain,
        ok: false,
        error: e.message,
      };
    }
    results.push(result);
    console.log(
      `${result.ok ? "OK" : "FAIL"} ${t.blockchain} ${t.symbol} ${result.amountOut || result.error || result.status}`,
    );
  }
}
await Promise.all([worker(), worker(), worker()]);
results.sort((a, b) =>
  `${a.chain}:${a.symbol}`.localeCompare(`${b.chain}:${b.symbol}`),
);
writeFileSync(
  "docs/defi-v3-bridge-routes.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      source: "20 USDC on NEAR",
      dry: true,
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `DRY QUOTES: ${results.filter((r) => r.ok).length}/${results.length} passed`,
);
