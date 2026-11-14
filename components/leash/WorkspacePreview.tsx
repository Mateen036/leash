import Link from "next/link";
import { PageFrame } from "../PageFrame";
import { AccountControls } from "../account/AccountControls";
import { Badge } from "./Badge";
const workspaces = {
  portfolio: {
    title: "Your positions. One perspective.",
    intro:
      "Balances, exposure and receipts belong together. Connect your testnet account to keep the same identity across every workspace.",
    label: "Portfolio",
    panels: ["Token balances", "Protocol positions", "Activity & receipts"],
    empty: "No portfolio data loaded",
    detail:
      "No sample balances or estimated positions are displayed. Use Swap for a live quote and a verified transaction receipt.",
  },
  perps: {
    title: "Exposure with boundaries.",
    intro:
      "A dedicated workspace for Orderly testnet markets, margin and position risk.",
    label: "Perps / Orderly testnet",
    panels: ["Markets", "Trade preview", "Positions & risk"],
    empty: "No market or position data loaded",
    detail:
      "Trading is unavailable in this preview. Actual leverage, margin, funding and liquidation estimates will appear beside each actionable trade.",
  },
  lend: {
    title: "Put capital to work.",
    intro:
      "Supply, debt and account health for Rhea Lending (Burrow) on NEAR testnet.",
    label: "Lend / Rhea Lending",
    panels: ["Supply markets", "Your collateral", "Debt & account health"],
    empty: "No lending account data loaded",
    detail:
      "Supply and withdrawal actions are unavailable in this preview. No APYs, collateral values or health scores are estimated here.",
  },
  stake: {
    title: "Stay liquid. Stake deliberately.",
    intro:
      "A clear view of LiNEAR staking, redemption and the underlying NEAR conversion rate.",
    label: "Stake / LiNEAR",
    panels: ["NEAR → LiNEAR", "Your stake", "Redemption & unlocks"],
    empty: "No staking account data loaded",
    detail:
      "Staking and redemption actions are unavailable in this preview. Rates and unlock times will come from the protocol.",
  },
  guardrails: {
    title: "Your authority. Your boundaries.",
    intro:
      "The place for protocol permissions, spending caps and expiry. The new guard is not deployed by this page.",
    label: "Guardrails / Policy preview",
    panels: [
      "Budget & per-action cap",
      "Protocols & expiry",
      "Rejected actions & receipts",
    ],
    empty: "No active guard policy loaded",
    detail:
      "Pause stops new actions. Revoke deletes the agent key. Closing positions is a separate action. These controls are unavailable until a guard is attached; existing testnet swap limits are managed in Agent → Wallet & swap limits.",
  },
};
export function WorkspacePreview({ kind }: { kind: keyof typeof workspaces }) {
  const data = workspaces[kind];
  return (
    <PageFrame>
      <span className="leash-eyebrow">LEASH / {data.label}</span>
      <h1 className="route-title">{data.title}</h1>
      <p className="route-intro">{data.intro}</p>
      <Badge variant="read-only" />
      <div className="preview-account">
        <AccountControls />
      </div>
      <div className="preview-grid">
        {data.panels.map((panel, index) => (
          <section className="leash-panel preview-panel" key={panel}>
            <span className="leash-eyebrow">0{index + 1}</span>
            <h2>{panel}</h2>
            <div className="preview-lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>Awaiting protocol data</p>
          </section>
        ))}
      </div>
      <section className="leash-panel preview-empty">
        <h2>{data.empty}</h2>
        <p>{data.detail}</p>
        <Link
          className="la-link"
          href={kind === "guardrails" ? "/agent" : "/protocols"}
        >
          {kind === "guardrails"
            ? "Manage testnet swap limits"
            : "Inspect protocol contracts"}{" "}
          ↗
        </Link>
        {kind === "guardrails" && (
          <div className="la-row">
            <button disabled>Pause agent</button>
            <button disabled className="revoke-link">
              Revoke agent
            </button>
            <button disabled>Close positions</button>
          </div>
        )}
      </section>
    </PageFrame>
  );
}
