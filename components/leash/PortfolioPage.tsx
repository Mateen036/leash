"use client";
import { near } from "@/lib/near/config";
import { networkFetch } from "@/lib/near/network";

import { ErrorNotice } from "./ErrorNotice";
import { formatAmount, plainText } from "./display";
import { AccountId } from "./AccountId";
import { useEffect, useState } from "react";
import { PageFrame } from "../PageFrame";
import { AccountControls } from "../account/AccountControls";
import { useAccount } from "../account/AccountProvider";
import { useDefiState } from "@/hooks/useDefiState";
import { suppliedBalance } from "@/lib/defi/preview";
import {
  TOKENS,
  getSwapTokens,
  LINEAR_TOKEN,
  fromBase,
} from "@/lib/defi/tokens";
import { useMarkets } from "./DefiWorkspace";
import { GetTestTokens } from "./GetTestTokens";
import { tokenDisplay } from "./token-display";
import { ActivityFeed } from "./ActivityFeed";
import { Badge } from "./Badge";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Layers3, Wallet, ShieldCheck } from "lucide-react";
import {
  PageHeader,
  NumberTicker,
  TokenGlyph,
  QuoteSkeleton,
  Skeleton,
  EmptyState,
} from "./widget";
import {
  marketName,
  usd,
  number,
  type PerpsAccount,
} from "@/components/perps/model";
import styles from "./management.module.css";
export function PortfolioPage() {
  const reduced = useReducedMotion();
  const { accountId } = useAccount(),
    d = useDefiState(accountId),
    markets = useMarkets();
  const [perps, setPerps] = useState<PerpsAccount | null>(null),
    [perpsError, setPerpsError] = useState("");
  useEffect(() => {
    setPerps(null);
    setPerpsError("");
    if (!accountId) return;
    let active = true;
    async function refresh() {
      try {
        const r = await networkFetch(
          `/api/perps/positions?account=${encodeURIComponent(accountId)}`,
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok)
          throw new Error(
            r.status === 404
              ? "Perps unavailable"
              : j.error || "Perps unavailable",
          );
        if (active) {
          setPerps(j);
          setPerpsError("");
        }
      } catch (e) {
        if (active) setPerpsError(String((e as Error).message));
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [accountId]);
  const pool = markets.data?.pool;
  const nearUsd = pool
    ? Number(pool.amounts[pool.token_account_ids.indexOf(TOKENS.tUSDC.id)]) /
      1e6 /
      (Number(pool.amounts[pool.token_account_ids.indexOf(TOKENS.wNEAR.id)]) /
        1e24)
    : null;
  const rate = Number(d.linearPrice || 0) / 1e24;
  const supplied = Number(suppliedBalance(d.burrow)) / 1e24;
  const nearTotal = d.near
    ? Number(d.near.total) / 1e24 +
      Number(d.tokens?.wNEAR || 0) / 1e24 +
      (Number(d.tokens?.LiNEAR || 0) / 1e24) * rate +
      supplied +
      Number(d.linearAccount?.unstaked_balance || 0) / 1e24
    : null;
  const usdTokens = Number(d.tokens?.[near.tokenSymbol] || 0) / 1e6;
  const totalNear =
    nearTotal === null ? null : nearTotal + (nearUsd ? usdTokens / nearUsd : 0);
  const allocations = [
    {
      name: "Wallet",
      color: "#75dfb1",
      value: d.near
        ? Number(d.near.total) / 1e24 +
          Number(d.tokens?.wNEAR || 0) / 1e24 +
          (nearUsd ? usdTokens / nearUsd : 0)
        : 0,
    },
    {
      name: "Staked",
      color: "#b7a3ee",
      value: (Number(d.tokens?.LiNEAR || 0) / 1e24) * rate,
    },
    { name: "Supplied", color: "#80bed0", value: supplied },
    {
      name: "Unstaking",
      color: "#e4bd86",
      value: Number(d.linearAccount?.unstaked_balance || 0) / 1e24,
    },
  ];
  const loading = !!accountId && !d.state && !d.error;
  return (
    <PageFrame>
      <div className={styles.page}>
        <PageHeader
          eyebrow="LEASH / PORTFOLIO"
          title="Your portfolio"
          description="Your balances and positions, together."
          badges={
            <>
              <Badge variant="testnet" />
              <Badge variant="read-only" />
            </>
          }
        />
        <section className={styles.hero} aria-label="Portfolio value">
          <span className={styles.heroLabel}>
            <Layers3 size={15} /> Total assets · estimate
          </span>
          <div className={styles.heroValue}>
            {loading ? (
              <Skeleton width="70%" height={54} />
            ) : totalNear === null ? (
              <span>—</span>
            ) : (
              <NumberTicker
                className={styles.ticker}
                value={totalNear}
                decimalPlaces={4}
              />
            )}
            <small>NEAR</small>
          </div>
          <div className={styles.heroSub}>
            {totalNear !== null && nearUsd ? (
              <>
                ≈ $
                <NumberTicker
                  className={styles.ticker}
                  value={totalNear * nearUsd}
                  decimalPlaces={2}
                />{" "}
                illustrative USD
              </>
            ) : accountId ? (
              "Waiting for live balances and pool prices"
            ) : (
              "Connect an account to see live balances"
            )}
          </div>
          <div
            className={styles.allocation}
            role="img"
            aria-label={
              totalNear && totalNear > 0
                ? allocations
                    .map(
                      (a) =>
                        `${a.name}: ${((a.value / totalNear) * 100).toFixed(1)}%`,
                    )
                    .join(", ")
                : "Allocation available after balances load"
            }
          >
            {allocations.map((a) => (
              <motion.div
                key={a.name}
                initial={false}
                animate={{
                  width: `${totalNear && totalNear > 0 ? (a.value / totalNear) * 100 : 0}%`,
                }}
                transition={{ duration: reduced ? 0 : 0.6 }}
                style={{ background: a.color }}
              />
            ))}
          </div>
          <div className={styles.legend}>
            {allocations.map((a) => (
              <span key={a.name}>
                <i style={{ background: a.color }} />
                {a.name}
                {totalNear && totalNear > 0
                  ? ` · ${Math.round((a.value / totalNear) * 100)}%`
                  : ""}
              </span>
            ))}
          </div>
          <details className={styles.fineprint}>
            <summary>Details</summary>
            <p>
              Live LiNEAR rates and Ref prices; USD stablecoins are treated as
              $1 for illustration. Testnet assets have no cash value. Small-pool
              prices are volatile. Includes storage-locked NEAR. Excludes perps,
              other lending assets, historical rewards, fees and realized PnL.
            </p>
          </details>
        </section>
        <AccountControls />
        {d.error && <ErrorNotice error={d.error} className={styles.warning} />}
        <div className={styles.grid}>
          <section className="leash-panel">
            <div className={styles.sectionHead}>
              <h2>
                <Wallet size={16} /> Wallet assets
              </h2>
              <GetTestTokens compact />
            </div>
            {loading ? (
              <QuoteSkeleton />
            ) : !d.exists ? (
              <EmptyState
                title="No assets yet"
                description="Connect a wallet to see balances, or switch to testnet for a free practice account."
              />
            ) : (
              <div className={styles.assetList}>
                {[...getSwapTokens(), tokenDisplay("wNEAR"), LINEAR_TOKEN]
                  .map((t) => ({
                    ...t,
                    units:
                      t.symbol === "NEAR"
                        ? d.near?.total || "0"
                        : (d.tokens as Record<string, string> | undefined)?.[
                            t.symbol
                          ] || "0",
                  }))
                  .filter((t) => BigInt(t.units) > 0n)
                  .map((t) => ({
                    ...t,
                    amount: fromBase(t.units, t.decimals, 8),
                    usd:
                      t.symbol === "NEAR" && nearUsd
                        ? (Number(t.units) / 1e24) * nearUsd
                        : t.symbol === near.tokenSymbol
                          ? Number(t.units) / 1e6
                          : undefined,
                    detail:
                      t.symbol === "NEAR"
                        ? `${fromBase(d.near?.storageLocked || "0", 24)} NEAR storage locked`
                        : t.name,
                  }))
                  .map((t) => (
                    <div key={t.symbol} className={styles.asset}>
                      <TokenGlyph token={{ ...t, chain: "NEAR" }} size={35} />
                      <div>
                        <strong>{t.symbol}</strong>
                        <small>{plainText(t.detail)}</small>
                      </div>
                      <span className={styles.assetValue}>
                        {formatAmount(t.amount)} {t.symbol}
                        {t.usd !== undefined && (
                          <small>≈${t.usd.toFixed(2)}</small>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>
          <section className="leash-panel">
            <div className={styles.sectionHead}>
              <h2>
                <Layers3 size={16} /> Earning &amp; supplied
              </h2>
              <Badge variant="testnet" />
            </div>
            {loading ? (
              <QuoteSkeleton />
            ) : !d.exists ? (
              <EmptyState
                title="No staking or lending yet"
                description="Your confirmed positions will appear here."
              />
            ) : (
              <div className={styles.assetList}>
                <div className={styles.asset}>
                  <TokenGlyph
                    token={{ id: "linear", symbol: "LiNEAR", color: "#b6a4ec" }}
                    size={35}
                  />
                  <div>
                    <strong>LiNEAR staked</strong>
                    <small>
                      ≈{" "}
                      {formatAmount(
                        (Number(d.tokens?.LiNEAR || 0) / 1e24) * rate,
                      )}{" "}
                      NEAR
                    </small>
                  </div>
                  <span className={styles.assetValue}>
                    {formatAmount(fromBase(d.tokens?.LiNEAR || "0", 24))} LiNEAR
                  </span>
                </div>
                <div className={styles.asset}>
                  <TokenGlyph
                    token={{ id: "pending", symbol: "NEAR", color: "#e4bd86" }}
                    size={35}
                  />
                  <div>
                    <strong>Unstaking</strong>
                    <small>Pending protocol withdrawal</small>
                  </div>
                  <span className={styles.assetValue}>
                    {formatAmount(
                      fromBase(d.linearAccount?.unstaked_balance || "0", 24),
                    )}{" "}
                    NEAR
                  </span>
                </div>
                <div className={styles.asset}>
                  <TokenGlyph
                    token={{ id: "burrow", symbol: "wNEAR", color: "#80bed0" }}
                    size={35}
                  />
                  <div>
                    <strong>Rhea supplied</strong>
                    <small>
                      Health:{" "}
                      {d.burrow?.borrowed?.length
                        ? "Unavailable · inspect borrows"
                        : "N/A · no borrows"}
                    </small>
                  </div>
                  <span className={styles.assetValue}>
                    {formatAmount(supplied)} wNEAR
                  </span>
                </div>
              </div>
            )}
            <p className={styles.fineprint}>Balances are read from each app.</p>
          </section>
        </div>
        <section className="leash-panel">
          <div className={styles.sectionHead}>
            <h2>Perpetual positions</h2>
            <Link href="/perps" className={styles.link}>
              Manage perps <ArrowUpRight size={14} />
            </Link>
          </div>
          {perpsError ? (
            <ErrorNotice error={perpsError} className={styles.warning} />
          ) : accountId && !perps ? (
            <QuoteSkeleton />
          ) : !perps ? (
            <EmptyState
              title="See your live exposure"
              description="Connect an account to read Orderly positions."
            />
          ) : (
            <>
              <p className={styles.fineprint}>
                {perps.usdcBalance === undefined ? (
                  "Balance unavailable"
                ) : (
                  <>
                    <NumberTicker
                      className={styles.ticker}
                      value={Number(perps.usdcBalance)}
                      decimalPlaces={2}
                    />{" "}
                    test USDC
                  </>
                )}{" "}
                ·{" "}
                {perps.signerMode === "chain-signatures"
                  ? "Chain Signatures owner"
                  : perps.signerMode === "server-derived"
                    ? "Server-derived owner"
                    : "Owner not registered"}
              </p>
              <p className={styles.fineprint}>
                Actual positions and unrealized PnL from Orderly. Historical
                realized PnL and fees are not aggregated.{" "}
                {perps.address && (
                  <>
                    Owner: <AccountId id={perps.address} />
                  </>
                )}
              </p>
              {!perps.positions?.length ? (
                <EmptyState
                  icon={<ShieldCheck size={23} />}
                  title="No open exposure"
                  description="Filled positions and their live PnL will appear here."
                />
              ) : (
                <div className={styles.positionGrid}>
                  {perps.positions.map((p) => (
                    <article key={p.symbol} className={styles.position}>
                      <div className={styles.positionHead}>
                        <strong>{marketName(p.symbol)} / USDC</strong>
                        <small>
                          {p.qty > 0 ? "Long" : "Short"} · {p.leverage}x
                        </small>
                      </div>
                      <div
                        className={`${styles.pnl} ${p.unrealizedPnl >= 0 ? styles.positive : styles.negative}`}
                      >
                        $
                        <NumberTicker
                          className={styles.ticker}
                          value={p.unrealizedPnl}
                          decimalPlaces={2}
                        />
                      </div>
                      <span className={styles.fineprint}>Unrealized PnL</span>
                      <dl>
                        <div>
                          <dt>Size</dt>
                          <dd>{number(Math.abs(p.qty), 6)}</dd>
                        </div>
                        <div>
                          <dt>Entry / mark</dt>
                          <dd>
                            {usd(p.avgOpen)} / {usd(p.markPrice)}
                          </dd>
                        </div>
                        <div>
                          <dt>Est. liquidation</dt>
                          <dd>
                            {p.estLiqPrice > 0
                              ? usd(p.estLiqPrice)
                              : "Unavailable"}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
        {markets.error && (
          <ErrorNotice error={markets.error} className={styles.warning} />
        )}
        <ActivityFeed />
      </div>
    </PageFrame>
  );
}
