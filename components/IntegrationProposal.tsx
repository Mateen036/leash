"use client";
import type { BridgeQuote } from "@/lib/near/intents";
import type { Proposal } from "@/lib/defi/preview";
import { ActionPreview } from "./leash/ActionPreview";
export function IntegrationProposal({ quote: q }: { quote: BridgeQuote }) {
  const p: Proposal = {
    action: {
      kind: "bridge_quote",
      amount: q.amountIn,
      source: q.source.startsWith("NEAR") ? "NEAR" : "USDC",
      destination: q.destination,
    },
    headline: `Quote: ${q.amountIn} ${q.source} → ≈${q.amountOut} ${q.destination}`,
    deltas: ["Preview only · no funds move"],
    protocol: "NEAR Intents 1Click",
    contract: "1Click dry quote API",
    quoteOnly: true,
    because: "Because you asked to preview a route to another chain.",
    quotedAt: q.quotedAt,
    sources: [{ name: "1Click live dry quote", at: q.quotedAt }],
    limit: "Quote only · no signing authority",
    facts: [
      {
        label: "Estimated time",
        value:
          q.timeEstimateSec === null ? "Unavailable" : `${q.timeEstimateSec}s`,
      },
      {
        label: "Estimated value",
        value: q.amountOutUsd === null ? "Unavailable" : `$${q.amountOutUsd}`,
      },
      { label: "Quote reference", value: q.correlationId },
    ],
  };
  return <ActionPreview proposal={p} />;
}
