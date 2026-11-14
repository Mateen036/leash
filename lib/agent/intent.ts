export type Budget = { units: bigint; currency: "USD"; amount: number };
export function parseBudget(message: string): Budget | undefined {
  const text = message.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, "$1");
  const match =
    text.match(/\$\s*(\d+(?:\.\d+)?)\s*(k)?/) ||
    text.match(/(\d+(?:\.\d+)?)\s*(k)?\s*(?:usd|usdc|tusdc|dollars?)\b/) ||
    text.match(
      /(?:under|below|max(?:imum)?|budget(?: of| is)?|up ?to|within)\s*(\d+(?:\.\d+)?)\s*(k)?\b/,
    );
  if (!match) return;
  const amount = Number(match[1]) * (match[2] ? 1000 : 1);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return;
  return { units: BigInt(Math.round(amount * 1e6)), currency: "USD", amount };
}
export const formatBudget = (budget: Budget) => `$${budget.amount.toFixed(2)}`;
import { SWAP_TOKENS } from "../defi/tokens";
/** Lower-case alias -> swap token symbol (agent understands every listed token). */
export const SWAP_ALIASES: Record<string, string> = Object.fromEntries([
  ...SWAP_TOKENS.map((t) => [t.symbol.toLowerCase(), t.symbol]),
  ["wnear", "NEAR"],
  ["usd", "tUSDC"],
]);
export type FinancialIntent = {
  action: "swap" | "bridge";
  /** Bridge: "USDC" | "NEAR" (mainnet). Swap: any SWAP_TOKENS symbol. */
  source: string;
  target: string;
  amount: string;
  error?: string;
};
export const CHAIN_NAMES: Record<string, string> = {
  base: "base",
  arbitrum: "arb",
  arb: "arb",
  ethereum: "eth",
  eth: "eth",
  solana: "sol",
  sol: "sol",
  bitcoin: "btc",
  btc: "btc",
  bnb: "bsc",
  polygon: "pol",
  optimism: "op",
  avalanche: "avax",
};
export function parseFinancialIntent(
  message: string,
): FinancialIntent | undefined {
  const text = message.toLowerCase().trim();
  const verb = text.match(/\b(swap|convert|bridge|send)\b/);
  if (!verb) return;
  if (verb[1] === "send" && !/\b(?:usdc|tusdc|near|eth|btc|sol)\b/.test(text))
    return;
  const dest = text.match(
    /\b(?:to|into)\s+([a-z0-9]+)(?:\s+on\s+([a-z]+))?\s*[.!?]?$/,
  );
  const target = dest?.[2] || dest?.[1] || "";
  const chain = CHAIN_NAMES[target];
  const action =
    verb[1] === "bridge" ||
    verb[1] === "send" ||
    (chain && !["btc", "eth", "sol"].includes(target))
      ? "bridge"
      : "swap";
  const from = text
    .slice(verb.index! + verb[0].length, dest?.index ?? text.length)
    .trim();
  const match = from.match(
    /^\$?\s*(\d+(?:\.\d+)?)\s*(usdc|tusdc|usd|near|wnear|[a-z]+)?(?:\s+worth)?$/,
  );
  let source = "USDC",
    amount = "",
    error: string | undefined;
  if (!match) error = "Say an amount and a token, e.g. “swap 0.1 NEAR to USDT”";
  else {
    amount = match[1];
    if (action === "bridge") {
      if (["near", "wnear"].includes(match[2])) source = "NEAR";
      else if (match[2] && !["usdc", "usd"].includes(match[2]))
        error = `I can bridge NEAR or USDC, not ${match[2].toUpperCase()}`;
    } else {
      const sym = SWAP_ALIASES[match[2] || "usd"];
      if (!sym) error = `I can't swap ${String(match[2]).toUpperCase()} yet`;
      else source = sym;
    }
  }
  if (!dest) error = error || "Say what to get, e.g. “to NEAR”";
  if (action === "swap" && !SWAP_ALIASES[target])
    error = error || `I can't swap to ${target ? target.toUpperCase() : "that"} yet`;
  if (action === "bridge" && !chain)
    error = `I can't bridge to ${target || "that chain"} yet`;
  const normalized =
    action === "bridge" ? chain || target : SWAP_ALIASES[target] || target;
  if (!error && action === "swap" && normalized === source)
    error = "Choose two different tokens";
  if (!error && action === "swap" && source !== "NEAR" && normalized !== "NEAR")
    error = `Swaps go through NEAR — try “swap ${amount} ${source} to NEAR” first`;
  if (amount && !(Number(amount) > 0)) error = "Amount must be positive";
  return { action, source, target: normalized, amount, error };
}
export function parseIntent(message: string) {
  return {
    budget: parseBudget(message),
    finance: parseFinancialIntent(message),
  };
}
