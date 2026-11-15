import {
  LINEAR_TOKEN,
  getSwapTokens,
  TOKENS,
  swapToken,
} from "@/lib/defi/tokens";

const mainnetSymbols = [
  "near",
  "usdt",
  "usdc",
  "eth",
  "btc",
  "sol",
  "bnb",
  "avax",
  "pol",
  "arb",
  "op",
  "dai",
  "wbtc",
];
export const CHAIN_NAMES: Record<string, string> = {
  near: "NEAR",
  base: "Base",
  arb: "Arbitrum",
  eth: "Ethereum",
  sol: "Solana",
  btc: "Bitcoin",
  bsc: "BNB Chain",
  pol: "Polygon",
  op: "Optimism",
  avax: "Avalanche",
};
export function chainCode(chain: string) {
  const value = chain.toLowerCase();
  return value.startsWith("near")
    ? "near"
    : Object.keys(CHAIN_NAMES).find(
        (code) => code === value || CHAIN_NAMES[code].toLowerCase() === value,
      );
}
export function tokenDisplay(symbolOrId: string) {
  if (symbolOrId === "near") return getSwapTokens()[0];
  if (symbolOrId === "wNEAR")
    return {
      ...getSwapTokens()[0],
      id: TOKENS.wNEAR.id,
      symbol: "wNEAR",
      name: "Wrapped NEAR",
    };
  if (["LiNEAR", LINEAR_TOKEN.id].includes(symbolOrId)) return LINEAR_TOKEN;
  const token = swapToken(symbolOrId);
  if (token) return token;
  const symbol = symbolOrId.replace(/^PERP_/, "").replace(/_USDC$/, "");
  return {
    id: symbolOrId,
    symbol,
    name: symbol,
    decimals: 0,
    logo: mainnetSymbols.includes(symbol.toLowerCase())
      ? `/tokens/${symbol.toLowerCase()}.png`
      : undefined,
  };
}
/** Match whole symbols, never substrings such as NEAR inside LiNEAR. */
export function tokensInText(text: string) {
  const symbols = [
    ...getSwapTokens().map((t) => t.symbol),
    "wNEAR",
    "LiNEAR",
    "ETH",
    "BTC",
    "SOL",
    "BNB",
    "POL",
    "AVAX",
    "wBTC",
    "DAI",
  ];
  return symbols
    .filter((s) => new RegExp(`(^|[^a-zA-Z])${s}([^a-zA-Z]|$)`, "i").test(text))
    .map(tokenDisplay);
}
