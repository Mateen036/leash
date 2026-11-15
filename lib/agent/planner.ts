import { near } from "../near/config";
import { getSwapTokens } from "../defi/tokens";
import { ActionSchema, type Action } from "./actions";
import { parseFinancialIntent } from "./intent";
import type { Proposal } from "../defi/preview";
export type Plan = {
  reply: string;
  source: "rules" | "near-ai";
  model?: string;
  fallback?: string;
  actions: Action[];
  proposals?: Proposal[];
};
export function parseAction(message: string): Action {
  const text = message.trim().toLowerCase();
  const amount = text.match(
    /(?:unstake|stake|supply|lend|withdraw)\s+(\d+(?:\.\d+)?)/,
  )?.[1];
  if (/prove.*(?:leash|work)|prove it/.test(text))
    return { kind: "stake", amount: "0.9" };
  if (/\bclose\s+all\b/.test(text)) return { kind: "close_all" };
  if (/portfolio|my balances|my positions/.test(text))
    return { kind: "portfolio" };
  const symbol = `PERP_${text.match(/\b(eth|btc|sol|near)\b/)?.[1]?.toUpperCase() || "ETH"}_USDC`;
  if (/\bclose\b/.test(text) && /\b(eth|btc|sol)\b/.test(text))
    return { kind: "perp_close", symbol };
  if (/\blong\b|\bshort\b|lever(?:age)? up|\bperp\b/.test(text)) {
    const notionalUsd = Number(
      text.match(/\$\s*(\d+(?:\.\d+)?)/)?.[1] ||
        text.match(/(?:with|using)\s+(\d+(?:\.\d+)?)\s*(?:usdc|usd)/)?.[1] ||
        text.match(/(\d+(?:\.\d+)?)\s*(?:usdc|usd)/)?.[1] ||
        "30",
    );
    return ActionSchema.parse({
      kind: "perp_open",
      symbol,
      side: /\bshort\b/.test(text) ? "SELL" : "BUY",
      notionalUsd,
      leverage: Number(text.match(/(\d+(?:\.\d+)?)\s*x\b/)?.[1] || "2"),
    });
  }
  if (amount) {
    const kind = /\bunstake\b/.test(text)
      ? "unstake"
      : /\bwithdraw\b/.test(text)
        ? "withdraw"
        : /\bsupply\b|\blend\b/.test(text)
          ? "supply"
          : "stake";
    if (/\b(?:usdt|usdc|tusdc|eth|btc)\b/.test(text))
      return {
        kind: "explain",
        topic:
          "Only NEAR/wNEAR supply and withdrawal are executable. Other lending markets are read only; choose supply 0.2 NEAR.",
      };
    return ActionSchema.parse({ kind, amount });
  }
  const finance = parseFinancialIntent(message);
  if (finance) {
    if (finance.error) return { kind: "explain", topic: finance.error };
    return ActionSchema.parse(
      finance.action === "bridge"
        ? {
            kind: "bridge_quote",
            amount: finance.amount,
            source: finance.source,
            destination: finance.target,
          }
        : {
            kind: "swap",
            amount: finance.amount,
            source: finance.source,
            target: finance.target,
          },
    );
  }
  return { kind: "explain", topic: message };
}
export function rulesPlan(message: string): Plan {
  const action = parseAction(message);
  return {
    source: "rules",
    reply:
      action.kind === "explain"
        ? `I can stake, unstake, supply or withdraw NEAR/wNEAR, swap ${getSwapTokens()
            .map((t) => t.symbol)
            .join(
              ", ",
            )}, and propose Orderly ${near.network} perps. Every action starts with a preview. Bridge proposals are quote only.`
        : "Review the live data and the limit below. Confirm a proposal to authorize its execution.",
    actions: [action],
  };
}
