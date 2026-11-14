import { Badge } from "@/components/leash/Badge";
import { QuoteCard } from "@/components/leash/widget";
import {
  marketName,
  number,
  percent,
  previewRisk,
  usd,
  type Market,
} from "./model";
import styles from "./perps.module.css";

export function PerpPreview({
  market,
  side,
  notional,
  leverage,
  walletMode,
  maxLeverage = 5,
  maxNotional = 500,
}: {
  market: Market;
  side: "BUY" | "SELL";
  notional: number;
  leverage: number;
  walletMode: boolean;
  maxLeverage?: number;
  maxNotional?: number;
}) {
  const risk = previewRisk(side, market.markPrice, notional, leverage);
  return (
    <QuoteCard
      title="Trade preview"
      output={`${side === "BUY" ? "Long" : "Short"} ${marketName(market.symbol)}`}
      subtitle={`${usd(notional)} total exposure · cross margin`}
      badges={<Badge variant="quote-only">Quote only · estimate</Badge>}
      metrics={[
        { label: "Current price", value: usd(market.markPrice) },
        {
          label: "Leverage",
          value: `${leverage}x`,
          warning: leverage > maxLeverage,
        },
        {
          label: "Liquidation · estimate",
          value: usd(risk?.liquidation),
          warning: leverage > maxLeverage,
        },
        {
          label: "Distance to liquidation",
          value: `${number(risk?.distancePct)}%`,
        },
        { label: "Margin required", value: usd(risk?.margin) },
        { label: "Taker fee · 0.1% estimate", value: usd(risk?.fee) },
        {
          label: "Token amount",
          value: `${number(risk?.quantity, 6)} ${marketName(market.symbol)}`,
        },
        {
          label: "Funding rate",
          value: percent(market.fundingRate),
        },
      ]}
      steps={
        <>
          <p>
            1.{" "}
            {walletMode
              ? "Your wallet approves; off-chain limits apply."
              : "Your on-chain limits are checked."}
          </p>
          <p>2. Orderly receives the order.</p>
          <p>3. Your position appears after the trade fills.</p>
        </>
      }
    >
      <div className={styles.limit}>
        {walletMode ? "Off-chain limit (wallet mode)" : "On-chain guard"}: max{" "}
        {maxLeverage}x · {usd(maxNotional)} notional
      </div>
      <details className="widget-info">
        <summary>Risk details</summary>
        <p className={styles.fineprint}>
          Orderly uses cross margin. Effective leverage and liquidation depend
          on all collateral, positions and fills. Size is rounded down to the
          market tick.
        </p>
        <p className={styles.fineprint}>
          Limits restrict new exposure; they do not cap losses or close
          positions. No automatic stop-loss is configured. Testnet funds.
        </p>
      </details>
    </QuoteCard>
  );
}
