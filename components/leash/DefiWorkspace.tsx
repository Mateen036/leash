"use client";
import { near } from "@/lib/near/config";
import { networkFetch } from "@/lib/near/network";

import { formatAmount, shortAccount } from "./display";
import { ErrorNotice } from "@/components/leash/ErrorNotice";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageFrame } from "../PageFrame";
import { AccountControls } from "../account/AccountControls";
import { useAccount } from "../account/AccountProvider";
import { useDefiState } from "@/hooks/useDefiState";
import type { Action } from "@/lib/agent/actions";
import type { Proposal } from "@/lib/defi/preview";
import { suppliedBalance } from "@/lib/defi/preview";
import {
  fromBase,
  TOKENS,
  getSwapTokens,
  swapToken,
  toBase,
} from "@/lib/defi/tokens";
import { postJson, walletPolicy, walletSpent } from "@/lib/defi/execution";
import { defaultPolicy } from "@/lib/near/guard";
import {
  selectSwapToken,
  swapBalance,
  swapMax,
  swapProposal,
  type SwapQuote,
} from "./swap-model";
import { tokenDisplay } from "./token-display";
import { GetTestTokens } from "./GetTestTokens";
import { EnableTokenLimits } from "./EnableTokenLimits";
import { Badge } from "./Badge";
import { ActionPreview } from "./ActionPreview";
import { ArrowRight, Info, ShieldCheck, Wallet } from "lucide-react";
import {
  AmountPanel,
  EmptyState,
  FlipButton,
  NumberTicker,
  PageHeader,
  PressableButton,
  QuoteCard,
  QuoteSkeleton,
  RouteList,
  Skeleton,
  TokenGlyph,
  TokenPicker,
  WidgetShell,
  type WidgetToken,
} from "./widget";
export type MarketData = {
  markets: { token: string; supplyApr: string | null }[];
  pool: { token_account_ids: string[]; amounts: string[] };
  quotedAt: number;
};
export function useMarkets() {
  const [data, setData] = useState<MarketData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const r = await networkFetch("/api/defi/markets");
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        if (active) {
          setData(j);
          setError("");
        }
      } catch (e) {
        if (active) setError(String((e as Error).message));
      }
    }
    void refresh();
    const t = setInterval(() => void refresh(), 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  return { data, error };
}
export function DefiWorkspace({ kind }: { kind: "stake" | "lend" | "swap" }) {
  const a = useAccount(),
    d = useDefiState(a.accountId),
    markets = useMarkets();
  const [amount, setAmount] = useState(kind === "swap" ? "0.05" : "0.2");
  const [operation, setOperation] = useState(kind === "lend" ? "supply" : kind);
  const [pair, setPair] = useState({
    source: "NEAR",
    target: near.tokenSymbol,
  });
  const { source, target } = pair;
  const inputToken = swapToken(source)!;
  const outputToken = swapToken(target)!;
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  // Ignore previews that settle after an amount, mode or account change.
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setProposal(null);
    setBusy(false);
    setError("");
  }, [a.accountId, a.walletSession, kind, amount, operation, source, target]);
  const closePicker = useCallback(() => {
    setPicker(null);
    setTimeout(
      () =>
        document
          .querySelector<HTMLButtonElement>(".widget-shell .token-pill")
          ?.focus(),
      180,
    );
  }, []);
  const linearPrice = Number(d.linearPrice || 0) / 1e24;
  const linearNear = (Number(d.tokens?.LiNEAR || 0) / 1e24) * linearPrice;
  const supplied = suppliedBalance(d.burrow);
  const nearAvailable = Math.max(
    0,
    Number(d.near?.available || 0) / 1e24 - 0.15,
  );
  const balance =
    kind === "lend" && operation === "withdraw"
      ? Number(supplied) / 1e24
      : kind === "stake" && operation === "unstake"
        ? linearNear
        : kind === "swap"
          ? Number(
              swapBalance(inputToken, d.near?.available || "0", d.tokens || {}),
            ) /
            10 ** inputToken.decimals
          : nearAvailable;
  const inputSymbol =
    kind === "swap"
      ? source
      : kind === "stake" && operation === "unstake"
        ? "LiNEAR"
        : kind === "lend" && operation === "withdraw"
          ? "wNEAR"
          : "NEAR";
  const outputSymbol =
    kind === "swap"
      ? target
      : kind === "stake"
        ? operation === "unstake"
          ? "NEAR"
          : "LiNEAR"
        : "wNEAR";
  const token = (symbol: string): WidgetToken => ({
    ...tokenDisplay(symbol),
    chain: `NEAR ${near.network}`,
  });
  const tokens = (
    kind === "swap" ? getSwapTokens() : [tokenDisplay(inputSymbol)]
  ).map((t) => ({
    ...token(t.symbol),
    balance: !d.exists
      ? undefined
      : fromBase(
          t.symbol === "NEAR"
            ? (
                BigInt(d.near?.available || "0") +
                BigInt(d.tokens?.wNEAR || "0")
              ).toString()
            : (d.tokens as Record<string, string> | undefined)?.[t.symbol] ||
                "0",
          t.decimals,
        ),
  }));
  const missingCaps =
    kind === "swap" && !a.walletSession && d.policy
      ? [inputToken, outputToken].filter((t) => !d.policy!.caps[t.id])
      : [];
  const apr = markets.data?.markets.find(
    (m) => m.token === TOKENS.wNEAR.id,
  )?.supplyApr;
  const estimated = proposal
    ? kind === "swap"
      ? proposal.facts
          .find((f) => f.label === "Minimum received")
          ?.value.split(" ")[0] || ""
      : kind === "stake" && operation === "stake"
        ? proposal.deltas[1]?.match(/[\d.]+/)?.[0] || ""
        : amount
    : "";
  async function preview() {
    const current = ++revision.current;
    setBusy(true);
    setError("");
    setProposal(null);
    try {
      const action: Action =
        kind === "swap"
          ? { kind: "swap", amount, source, target }
          : {
              kind: operation as "stake" | "unstake" | "supply" | "withdraw",
              amount,
            };
      let next: Proposal;
      if (kind === "swap") {
        const amountIn = toBase(amount, inputToken.decimals);
        const query = new URLSearchParams({
          kind: "swap",
          tokenIn: inputToken.id,
          tokenOut: outputToken.id,
          amountIn,
        });
        const response = await networkFetch(`/api/defi/quote?${query}`);
        const quote = await response.json();
        if (!response.ok)
          throw new Error("The quote is unavailable. Try again in a moment.");
        const policy = a.walletSession
          ? walletPolicy(a.accountId)
          : d.policy || defaultPolicy();
        const spent = a.walletSession
          ? walletSpent(a.accountId)
          : d.spent || {};
        next = swapProposal(
          inputToken,
          outputToken,
          amount,
          amountIn,
          quote as SwapQuote,
          policy,
          spent,
        );
      } else {
        const r = await postJson("/api/agent", {
          action,
          accountId: a.accountId,
          walletMode: !!a.walletSession,
        });
        next = r.proposals[0];
      }
      if (current === revision.current) setProposal(next);
    } catch (e) {
      if (current === revision.current) setError((e as Error).message);
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }
  function flip() {
    setProposal(null);
    if (kind === "swap") setPair({ source: target, target: source });
    else if (kind === "stake")
      setOperation(operation === "stake" ? "unstake" : "stake");
    else setOperation(operation === "supply" ? "withdraw" : "supply");
  }
  const protocol =
    kind === "swap"
      ? "Ref / Rhea DEX"
      : kind === "stake"
        ? "LiNEAR"
        : "Rhea Lending";
  return (
    <PageFrame>
      <PageHeader
        eyebrow={`LEASH / ${kind.toUpperCase()}`}
        title={
          kind === "swap"
            ? "Swap tokens"
            : kind === "stake"
              ? "Stake NEAR"
              : "Lend tokens"
        }
        description={
          kind === "swap"
            ? "Choose your tokens and get a live quote."
            : kind === "stake"
              ? "Earn staking rewards while holding LiNEAR."
              : "Supply tokens to earn a variable rate."
        }
        badges={<Badge variant="testnet" />}
      />
      <WidgetShell
        title={protocol}
        tabs={
          kind === "swap"
            ? [{ value: "swap", label: "Swap" }]
            : kind === "stake"
              ? [
                  { value: "stake", label: "Stake" },
                  { value: "unstake", label: "Unstake" },
                ]
              : [
                  { value: "supply", label: "Supply" },
                  { value: "withdraw", label: "Withdraw" },
                ]
        }
        value={operation}
        onTabChange={setOperation}
        actions={
          <button
            type="button"
            className="widget-icon-button"
            aria-label="Protocol information"
            onClick={() =>
              document.getElementById("protocol-info")?.toggleAttribute("open")
            }
          >
            <Info size={16} />
          </button>
        }
        picker={
          picker && (
            <TokenPicker
              tokens={tokens}
              selected={token(picker === "to" ? outputSymbol : inputSymbol).id}
              onClose={closePicker}
              onSelect={(t) => {
                if (kind === "swap")
                  setPair((previous) =>
                    selectSwapToken(previous, picker!, t.symbol),
                  );
                closePicker();
              }}
            />
          )
        }
        sidePanel={
          busy ? (
            <RouteList title="Reading the protocol">
              <QuoteSkeleton />
            </RouteList>
          ) : proposal ? (
            <RouteList title="Review your action">
              <ActionPreview
                key={`${a.accountId}-${proposal.quotedAt}`}
                proposal={proposal}
              />
            </RouteList>
          ) : kind === "lend" ? (
            <QuoteCard
              title="Rhea Lending / Burrow"
              output={
                apr != null ? (
                  <>
                    <NumberTicker value={Number(apr) * 100} decimalPlaces={4} />
                    % <small className="apr-label">supply APR</small>
                  </>
                ) : markets.data || markets.error ? (
                  <span className="apr-label">APR unavailable</span>
                ) : (
                  <Skeleton width="60%" height={30} />
                )
              }
              badges={<Badge variant="read-only" />}
              subtitle="Live exchange rate · changes over time."
              metrics={[
                { label: "Asset", value: "wNEAR" },
                { label: "Collateral", value: "Not enabled" },
                {
                  label: "Health factor",
                  value: d.burrow?.borrowed?.length
                    ? "Unavailable · oracle missing"
                    : "N/A · no borrowing",
                },
                { label: "Withdraw to", value: "Your own account" },
              ]}
            />
          ) : undefined
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void preview();
          }}
        >
          <AmountPanel
            label={
              operation === "unstake"
                ? "Unstake · value in NEAR"
                : operation === "withdraw"
                  ? "Withdraw"
                  : "You send"
            }
            amount={amount}
            onChange={setAmount}
            token={token(inputSymbol)}
            onTokenClick={kind === "swap" ? () => setPicker("from") : undefined}
            balance={
              d.exists
                ? `${kind === "swap" ? fromBase(swapBalance(inputToken, d.near?.available || "0", d.tokens || {}), inputToken.decimals) : (inputSymbol === "NEAR" ? Number(d.near?.available || 0) / 1e24 : balance).toFixed(4)}${operation === "unstake" ? " NEAR eq." : ""}`
                : undefined
            }
            balanceAction={
              d.exists && balance === 0 ? <GetTestTokens compact /> : undefined
            }
            onMax={
              d.exists
                ? () =>
                    setAmount(
                      kind === "swap"
                        ? swapMax(
                            inputToken,
                            d.near?.available || "0",
                            d.tokens || {},
                          )
                        : balance.toFixed(5),
                    )
                : undefined
            }
            subValue={
              operation === "unstake"
                ? "Enter the NEAR value you want to unstake"
                : inputSymbol === "NEAR"
                  ? "A little NEAR is kept for fees"
                  : near.network === "mainnet"
                    ? "Mainnet tokens · real funds"
                    : "Test tokens · no cash value"
            }
          />
          <FlipButton
            onClick={flip}
            label={
              kind === "swap"
                ? "Reverse swap direction"
                : kind === "stake"
                  ? "Switch stake and unstake"
                  : "Switch supply and withdraw"
            }
          />
          <AmountPanel
            label={
              kind === "lend" && operation === "supply"
                ? "You supply"
                : operation === "unstake"
                  ? "Pending redemption"
                  : kind === "swap"
                    ? "Minimum you receive"
                    : "You receive"
            }
            amount={estimated}
            readOnly
            loading={busy}
            token={token(outputSymbol)}
            onTokenClick={kind === "swap" ? () => setPicker("to") : undefined}
            subValue={
              proposal
                ? kind === "lend"
                  ? "Position held on your account"
                  : kind === "stake" && operation === "unstake"
                    ? "Withdraw from LiNEAR after the unlock period"
                    : "Estimated output"
                : "Get a fresh quote before you confirm"
            }
          />
          {kind === "swap" && (
            <p className="widget-footnote">Swaps go through NEAR</p>
          )}
          {!!missingCaps.length && (
            <EnableTokenLimits
              tokens={missingCaps}
              onUpdated={() => setProposal(null)}
            />
          )}
          <PressableButton
            type="submit"
            disabled={
              busy ||
              !!missingCaps.length ||
              !Number.isFinite(Number(amount)) ||
              Number(amount) <= 0
            }
          >
            {busy ? "Getting quote…" : "Get quote"}
            <ArrowRight size={15} />
          </PressableButton>
        </form>
        <p className="widget-inline-note">
          <ShieldCheck size={13} />
          {a.walletSession || near.network === "mainnet"
            ? "Your wallet signs · off-chain limit"
            : "Your limits apply on-chain"}
        </p>
        <details id="protocol-info" className="widget-info">
          <summary>Details</summary>
          <p>
            {kind === "swap"
              ? "Swaps use Ref Finance. NEAR is wrapped for trading; reverse swaps return wNEAR. Small test pools can move the price a lot, so check the price impact before confirming."
              : kind === "stake"
                ? "Unstaking starts an unlock period. Withdraw your NEAR from LiNEAR when it is ready."
                : "Your supplied tokens are not used as collateral. Borrowing is unavailable in this app."}
          </p>
        </details>
        {error && <ErrorNotice error={error} />}
      </WidgetShell>
      <div className="widget-support">
        <section className="widget-position">
          <div className="position-heading">
            <span>
              <Wallet size={14} />
              {kind === "stake"
                ? "Your staking position"
                : kind === "lend"
                  ? "Your supplied balance"
                  : "Your balances"}
            </span>
            <Badge variant="read-only" />
          </div>
          {!a.accountId ? (
            <EmptyState
              title="See your balances"
              description={
                near.network === "mainnet"
                  ? "Connect a funded mainnet wallet below."
                  : "Start free or connect a wallet below."
              }
            />
          ) : !d.state ? (
            <QuoteSkeleton />
          ) : !d.exists ? (
            <EmptyState
              title="Account unavailable"
              description="This account could not be loaded on the selected NEAR network."
            />
          ) : kind === "stake" ? (
            <>
              <div className="position-value">
                <TokenGlyph token={token("LiNEAR")} />
                <strong>
                  <NumberTicker
                    value={Number(d.tokens?.LiNEAR || 0) / 1e24}
                    decimalPlaces={4}
                  />{" "}
                  <small>LiNEAR</small>
                </strong>
              </div>
              <p>
                ≈{formatAmount(linearNear)} NEAR · 1 LiNEAR ={" "}
                {formatAmount(fromBase(d.linearPrice || "0", 24))} NEAR
              </p>
              <p>
                Pending redemption:{" "}
                {formatAmount(
                  fromBase(d.linearAccount?.unstaked_balance || "0", 24),
                )}{" "}
                NEAR ·{" "}
                {d.linearAccount?.can_withdraw
                  ? "Ready to withdraw in LiNEAR"
                  : "Waiting to unlock"}
              </p>
            </>
          ) : kind === "lend" ? (
            <>
              <div className="position-value">
                <TokenGlyph token={token("wNEAR")} />
                <strong>
                  <NumberTicker
                    value={Number(supplied) / 1e24}
                    decimalPlaces={4}
                  />{" "}
                  <small>wNEAR</small>
                </strong>
              </div>
              <p>
                Health factor:{" "}
                {d.burrow?.borrowed?.length
                  ? "Unavailable · account risk cannot be safely projected"
                  : "N/A · no borrows"}
              </p>
              <p>Withdraw to your account at any time.</p>
            </>
          ) : (
            <div className="balance-grid">
              {[...getSwapTokens().map((t) => t.symbol), "wNEAR"].map(
                (symbol) => (
                  <div key={symbol}>
                    <TokenGlyph token={token(symbol)} size={26} />
                    <span>
                      {symbol}
                      <strong>
                        <NumberTicker
                          value={
                            symbol === "NEAR"
                              ? Number(d.near?.available || 0) / 1e24
                              : Number(
                                  (
                                    d.tokens as
                                      Record<string, string> | undefined
                                  )?.[symbol] || 0,
                                ) /
                                10 ** tokenDisplay(symbol).decimals
                          }
                          decimalPlaces={4}
                        />
                      </strong>
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
          {d.error && <ErrorNotice error={d.error} />}
        </section>
        <AccountControls />
        {kind === "lend" && (
          <details className="widget-market-details">
            <summary>
              Explore other lending markets <span>Read only</span>
            </summary>
            <p>Other rates are for reference.</p>
            {!markets.data && !markets.error ? (
              <QuoteSkeleton />
            ) : (
              <div className="market-rows">
                {markets.data?.markets
                  .filter((m) => m.token !== TOKENS.wNEAR.id)
                  .map((m) => (
                    <div key={m.token}>
                      <span>{shortAccount(m.token)}</span>
                      <span>
                        {m.supplyApr === null
                          ? "Unavailable"
                          : `${(Number(m.supplyApr) * 100).toFixed(4)}% APR`}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {markets.error && <ErrorNotice error={markets.error} />}
          </details>
        )}
      </div>
    </PageFrame>
  );
}
