"use client";
import { ErrorNotice } from "../leash/ErrorNotice";
import { AccountId } from "../leash/AccountId";
import { plainText } from "../leash/display";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  Search,
} from "lucide-react";
import { PageFrame } from "@/components/PageFrame";
import { useAccount } from "@/components/account/AccountProvider";
import { Badge } from "@/components/leash/Badge";
import { signRequest } from "@/lib/near/client";
import { walletSignRequest } from "@/lib/near/wallet";
import { saveReceipt } from "@/lib/defi/history";
import { actionDigest } from "@/lib/defi/tokens";
import {
  WidgetShell,
  Tabs,
  TokenGlyph,
  PageHeader,
  ExecutionTimeline,
  QuoteSkeleton,
  EmptyState,
  NumberTicker,
  PressableButton,
  useToast,
} from "@/components/leash/widget";
import { ManagementDialog } from "@/components/leash/ManagementDialog";
import { CustodyFacts } from "@/components/leash/CustodyFacts";
import { useDefiState } from "@/hooks/useDefiState";
import { PerpPreview } from "./PerpPreview";
import { PerpChart } from "./PerpChart";
import {
  marketName,
  number,
  percent,
  PerpsRequestError,
  perpsRequest,
  usd,
  type Market,
  type PerpsAccount,
  type TradeResult,
} from "./model";
import styles from "./perps.module.css";

type Receipt = {
  kind: "open" | "close";
  label: string;
  status: "pending" | "done" | "failed";
  wallet: boolean;
  exposure?: { symbol: string; side: "BUY" | "SELL"; before: number };
  result?: TradeResult;
  error?: string;
};
const txUrl = (hash: string) =>
  `https://testnet.nearblocks.io/txns/${encodeURIComponent(hash)}`;

export default function PerpsPage() {
  const { accountId, guest, walletSession, restoring } = useAccount();
  const walletMode = !!walletSession;
  const guard = useDefiState(accountId);
  const maxLeverage = walletMode
    ? 5
    : (guard.policy?.max_leverage_x100 ?? 500) / 100;
  const maxNotional = walletMode
    ? 500
    : (guard.policy?.max_perp_notional_usd ?? 500);
  const [picker, setPicker] = useState(false),
    [search, setSearch] = useState("");
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const reduced = useReducedMotion();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [symbol, setSymbol] = useState("PERP_ETH_USDC");
  const [marketError, setMarketError] = useState("");
  const [marketTime, setMarketTime] = useState(0);
  const [account, setAccount] = useState<PerpsAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [notional, setNotional] = useState("30");
  const [leverage, setLeverage] = useState(2);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [closeTarget, setCloseTarget] = useState<string | null>(null);
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const actionLock = useRef(false);
  const market = markets.find((m) => m.symbol === symbol);
  const positions = account?.positions ?? [];
  const amount = Number(notional);
  const registered = account?.registered === true;
  const authorizationRejected =
    receipt?.result && "rejectedTx" in receipt.result;
  const observedExposure =
    receipt?.status === "done" &&
    receipt.exposure &&
    positions.some(
      (p) =>
        p.symbol === receipt.exposure!.symbol &&
        (receipt.exposure!.side === "BUY"
          ? p.qty > receipt.exposure!.before
          : p.qty < receipt.exposure!.before),
    );

  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const data = await perpsRequest<{ markets: Market[] }>(
          "/api/perps/markets",
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const valid = data.markets.filter(
          (m) => Number.isFinite(m.markPrice) && m.markPrice > 0,
        );
        setMarkets(valid);
        setMarketTime(Date.now());
        setMarketError(
          valid.length ? "" : "No markets are available right now.",
        );
        setSymbol((selected) =>
          valid.some((m) => m.symbol === selected)
            ? selected
            : (valid[0]?.symbol ?? selected),
        );
      } catch (e) {
        if (!controller.signal.aborted) setMarketError((e as Error).message);
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const refreshAccount = useCallback(
    async (id: string, signal?: AbortSignal) => {
      const data = await perpsRequest<PerpsAccount>(
        `/api/perps/positions?account=${encodeURIComponent(id)}`,
        undefined,
        signal,
      );
      if (currentAccount.current === id && !signal?.aborted) {
        setAccount((previous) => ({ ...previous, ...data }));
        setAccountError("");
      }
    },
    [],
  );

  useEffect(() => {
    setAccount(null);
    setAccountError("");
    setError("");
    setReceipt(null);
    setCloseTarget(null);
    if (!accountId || restoring) {
      setAccountLoading(false);
      return;
    }
    const controller = new AbortController();
    let running = false;
    setAccountLoading(true);
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        await refreshAccount(accountId, controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) setAccountError((e as Error).message);
      } finally {
        running = false;
        if (!controller.signal.aborted) setAccountLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [accountId, restoring, refreshAccount]);

  async function authorize(payload: object) {
    const parts = ["leash_perp", actionDigest(payload)];
    if (walletSession) return walletSignRequest(walletSession, parts);
    if (guest && guest.accountId === accountId)
      return signRequest(guest, parts);
    throw new Error(
      "Start a guest or connect a NEAR testnet wallet on the Agent page.",
    );
  }

  async function bootstrap() {
    if (actionLock.current) return;
    actionLock.current = true;
    const id = accountId;
    setBusy("bootstrap");
    setError("");
    try {
      const auth = await authorize({});
      const data = await perpsRequest<PerpsAccount>("/api/perps/bootstrap", {
        auth,
      });
      if (currentAccount.current !== id) return;
      setAccount((previous) => ({
        ...previous,
        ...data,
        positions: previous?.positions ?? [],
      }));
      setAccountError("");
      if (data.usdcBalance === 0 && !data.faucetRequested)
        setError(
          "Account is registered, but the faucet did not accept the request. Try setup again in a few minutes.",
        );
      await refreshAccount(id).catch((e: Error) => {
        if (currentAccount.current === id) setAccountError(e.message);
      });
    } catch (e) {
      if (currentAccount.current === id) setError((e as Error).message);
    } finally {
      actionLock.current = false;
      setBusy("");
    }
  }

  async function trade(kind: "open" | "close", target?: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    const id = accountId;
    const payload =
      kind === "open"
        ? { symbol, side, notionalUsd: amount, leverage }
        : target === "all"
          ? {}
          : { symbol: target! };
    const label =
      kind === "open"
        ? `${side === "BUY" ? "Long" : "Short"} ${marketName(symbol)} · ${usd(amount)} · ${leverage}x`
        : target === "all"
          ? "Close all positions · reduce only"
          : `Close ${marketName(target!)} · reduce only`;
    const pending: Receipt = {
      kind,
      label,
      status: "pending",
      wallet: walletMode,
      ...(kind === "open"
        ? {
            exposure: {
              symbol,
              side,
              before: positions.find((p) => p.symbol === symbol)?.qty ?? 0,
            },
          }
        : {}),
    };
    setBusy(kind);
    setError("");
    setCloseTarget(null);
    setReceipt(pending);
    try {
      const auth = await authorize(payload);
      // One API request performs authorization and placement in sequence. Never invent intermediate confirmations.
      const result = await perpsRequest<TradeResult>(
        kind === "open"
          ? "/api/perps/order"
          : target === "all"
            ? "/api/perps/close-all"
            : "/api/perps/close",
        { ...payload, auth },
      );
      if (currentAccount.current !== id) return;
      setReceipt({ ...pending, status: "done", result });
      if (result.authTx)
        saveReceipt(id, {
          id: result.authTx,
          at: Date.now(),
          headline: `Guard authorized · ${label}`,
          ok: true,
          txHash: result.authTx,
          orderId:
            result.orderId === undefined ? undefined : String(result.orderId),
        });
      toast({
        title: "Orderly accepted the request",
        description:
          "Positions refresh from the venue. Acceptance is not a fill receipt.",
        variant: "success",
        href: result.authTx ? txUrl(result.authTx) : undefined,
      });
    } catch (e) {
      if (currentAccount.current !== id) return;
      if (
        e instanceof PerpsRequestError &&
        (e.result.rejectedTx || e.result.authTx)
      ) {
        const txHash = e.result.rejectedTx || e.result.authTx!;
        saveReceipt(id, {
          id: txHash,
          at: Date.now(),
          headline: e.result.rejectedTx
            ? `Guard rejected · ${label}`
            : `Guard authorized; venue failed · ${label}`,
          ok: false,
          txHash,
          rejected: !!e.result.rejectedTx,
          error: e.message,
        });
      }
      toast({
        title: "Execution stopped",
        description: (e as Error).message,
        variant: "error",
        href:
          e instanceof PerpsRequestError && e.result.rejectedTx
            ? txUrl(e.result.rejectedTx)
            : undefined,
      });
      setReceipt({
        ...pending,
        status: "failed",
        error: (e as Error).message,
        result: e instanceof PerpsRequestError ? e.result : undefined,
      });
    } finally {
      if (currentAccount.current === id) {
        await refreshAccount(id).catch((e: Error) => {
          if (currentAccount.current === id) setAccountError(e.message);
        });
      }
      actionLock.current = false;
      setBusy("");
    }
  }

  const blocked = restoring
    ? "Restoring your NEAR account…"
    : !accountId
      ? "Start a guest on the Agent page to trade."
      : !registered
        ? "Set up your perps account first."
        : accountError
          ? "Account refresh failed. Check the account panel before trading."
          : !(Number(account?.usdcBalance) > 0)
            ? "Waiting for test USDC. Your balance refreshes every 15 seconds."
            : marketError || !market
              ? "Live market data is unavailable. Waiting for the next refresh."
              : !Number.isFinite(amount) || amount < 10
                ? "Enter at least $10 notional. Market-specific minimums also apply."
                : "";

  return (
    <PageFrame>
      <div className={styles.page}>
        <PageHeader
          eyebrow="LEASH / PERPETUAL FUTURES"
          title="Trade perps"
          description="Go long or short with test funds."
          badges={
            <>
              <Badge variant="testnet" />
              {walletMode && <Badge variant="off-chain-limit" />}
            </>
          }
        />
        <PerpChart
          symbol={symbol}
          markPrice={market?.markPrice}
          change24h={market?.change24h}
          position={positions.find((p) => p.symbol === symbol) ?? null}
        />
        <WidgetShell
          title="Perpetuals"
          actions={<Badge variant="testnet">Orderly · testnet</Badge>}
          sidePanel={
            market ? (
              <PerpPreview
                market={market}
                side={side}
                notional={amount}
                leverage={leverage}
                walletMode={walletMode}
                maxLeverage={maxLeverage}
                maxNotional={maxNotional}
              />
            ) : marketError ? (
              <EmptyState
                title="Market data unavailable"
                description="Waiting for the next successful Orderly refresh."
              />
            ) : (
              <QuoteSkeleton />
            )
          }
        >
          <button
            ref={pickerTrigger}
            className={styles.marketTrigger}
            onClick={() => {
              setSearch("");
              setPicker(true);
            }}
            disabled={!!busy}
            aria-haspopup="dialog"
          >
            <TokenGlyph
              token={{
                id: symbol,
                symbol: marketName(symbol),
                chain: "Arbitrum Sepolia",
              }}
              size={38}
            />
            <span>
              <strong>
                {marketName(symbol)} <small>/ USDC</small>
              </strong>
              <small>Perpetual · cross margin</small>
            </span>
            <ChevronDown size={15} />
          </button>
          <div className={styles.markStrip}>
            <div>
              <span>Mark price</span>
              {market ? (
                <strong>{usd(market.markPrice)}</strong>
              ) : (
                <span>Reading market…</span>
              )}
            </div>
            <div>
              <span>24h change</span>
              <strong
                className={
                  market && market.change24h >= 0
                    ? styles.positive
                    : styles.negative
                }
              >
                {market ? percent(market.change24h) : "—"}
              </strong>
            </div>
          </div>
          {marketError && (
            <ErrorNotice error={marketError} className={styles.warning} />
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!blocked && !busy) void trade("open");
            }}
          >
            <fieldset disabled={!!busy} className={styles.ticket}>
              <legend className={styles.srOnly}>
                Position direction, size and leverage
              </legend>
              <Tabs
                label="Position side"
                tabs={[
                  { value: "BUY", label: "↗ Long" },
                  { value: "SELL", label: "↘ Short" },
                ]}
                value={side}
                onChange={(v) => setSide(v as "BUY" | "SELL")}
              />
              <label className={styles.inputLabel} htmlFor="perp-notional">
                Position size <span>USD · total exposure</span>
              </label>
              <div className={styles.amountInput}>
                <span>$</span>
                <input
                  id="perp-notional"
                  type="number"
                  inputMode="decimal"
                  min="10"
                  max="100000"
                  step="any"
                  required
                  value={notional}
                  onChange={(e) => setNotional(e.target.value)}
                />
                <span>USD</span>
              </div>
              <div className={styles.leverageLabel}>
                <label htmlFor="perp-leverage">Leverage</label>
                <output
                  htmlFor="perp-leverage"
                  className={
                    leverage > maxLeverage ? styles.negative : styles.positive
                  }
                >
                  {leverage}x
                </output>
              </div>
              <input
                className={styles.slider}
                id="perp-leverage"
                type="range"
                min="1"
                max={advanced ? Math.max(20, maxLeverage) : maxLeverage}
                step="1"
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
              />
              <div className={styles.rangeLabels}>
                <span>1x</span>
                <span>
                  {advanced
                    ? `${Math.max(20, maxLeverage)}x · test the limit`
                    : `${maxLeverage}x · guard cap`}
                </span>
              </div>
              <label className={styles.advanced}>
                <input
                  type="checkbox"
                  checked={advanced}
                  onChange={(e) => {
                    setAdvanced(e.target.checked);
                    if (!e.target.checked)
                      setLeverage((v) => Math.min(v, maxLeverage));
                  }}
                />{" "}
                Test an over-limit trade
              </label>
              {(leverage > maxLeverage || amount > maxNotional) && (
                <p className={styles.warning}>
                  {walletMode
                    ? "This exceeds the off-chain policy and will be rejected."
                    : "This exceeds your limit. Confirm to test the guard; a small testnet fee applies."}
                </p>
              )}
              <p className={styles.because}>
                <ShieldCheck size={13} /> {walletMode ? "Off-chain" : "Guard"}{" "}
                cap: {maxLeverage}x / {usd(maxNotional)}.
              </p>
              <div className={styles.mobilePreview}>
                {market ? (
                  <PerpPreview
                    market={market}
                    side={side}
                    notional={amount}
                    leverage={leverage}
                    walletMode={walletMode}
                    maxLeverage={maxLeverage}
                    maxNotional={maxNotional}
                  />
                ) : marketError ? (
                  <EmptyState title="Market data unavailable" />
                ) : (
                  <QuoteSkeleton />
                )}
              </div>
              <PressableButton
                type="submit"
                disabled={!!blocked || !!busy}
                aria-describedby="perp-blocked"
              >
                {busy === "open"
                  ? "Placing order…"
                  : `Open ${side === "BUY" ? "long" : "short"}`}{" "}
                <ArrowUpRight size={16} />
              </PressableButton>
              <p id="perp-blocked" className={styles.fineprint}>
                {blocked ||
                  "Market execution · final fill price may differ from this mark."}
              </p>
            </fieldset>
          </form>

          <CustodyFacts />
          <p className={styles.fineprint}>
            Orderly · Arbitrum Sepolia
            <br />
            {marketTime
              ? `Orderly public futures · read ${new Date(marketTime).toLocaleTimeString("en-GB")}`
              : "Reading live Orderly market data"}
          </p>
        </WidgetShell>
        {picker && (
          <ManagementDialog
            title="Select market"
            returnFocus={pickerTrigger}
            onClose={() => {
              setPicker(false);
            }}
          >
            <label className="picker-search">
              <Search size={16} />
              <input
                autoFocus
                aria-label="Search markets"
                placeholder="Search ETH, BTC, SOL…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className={styles.markets}>
              {!markets.length && !marketError ? (
                <QuoteSkeleton />
              ) : (
                markets
                  .filter((m) =>
                    m.symbol.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((m) => (
                    <button
                      key={m.symbol}
                      className={`${styles.market} ${symbol === m.symbol ? styles.marketSelected : ""}`}
                      aria-pressed={symbol === m.symbol}
                      onClick={() => {
                        setSymbol(m.symbol);
                        setPicker(false);
                      }}
                    >
                      <TokenGlyph
                        token={{ id: m.symbol, symbol: marketName(m.symbol) }}
                      />
                      <span>
                        <strong>
                          {marketName(m.symbol)} <small>/ USDC</small>
                        </strong>
                        <small>{usd(m.markPrice)}</small>
                      </span>
                      <span
                        className={
                          m.change24h >= 0 ? styles.positive : styles.negative
                        }
                      >
                        {percent(m.change24h)}
                        <small>F {percent(m.fundingRate)}</small>
                      </span>
                    </button>
                  ))
              )}
              {!!markets.length &&
                !markets.some((m) =>
                  m.symbol.toLowerCase().includes(search.toLowerCase()),
                ) && (
                  <EmptyState
                    title="No matching markets"
                    description="Try another market symbol."
                  />
                )}
            </div>
            <p className={styles.fineprint}>
              Live Orderly testnet markets · refresh every 10 s
            </p>
          </ManagementDialog>
        )}
        <details
          className={styles.account}
          open={!accountId || (!!accountId && !registered)}
        >
          <summary>
            Account &amp; test funds{" "}
            <span>
              {accountId
                ? registered
                  ? "Registered"
                  : "Setup needed"
                : "Start on Agent"}
            </span>
          </summary>
          <div className={styles.accountBody}>
            <div className={styles.sectionHeading}>
              <h2>Your perps account</h2>
              {account?.signerMode && (
                <Badge
                  variant={
                    account.signerMode === "chain-signatures"
                      ? "testnet"
                      : "off-chain-limit"
                  }
                >
                  {account.signerMode === "chain-signatures"
                    ? "NEAR Chain Signatures"
                    : "Server-derived fallback"}
                </Badge>
              )}
            </div>
            {restoring ? (
              <QuoteSkeleton />
            ) : !accountId ? (
              <div className={styles.accountCta}>
                <p>Create your free account to start trading.</p>
                <Link href="/agent" className={styles.primary}>
                  Start free on Agent <ArrowUpRight size={16} />
                </Link>
              </div>
            ) : accountLoading ? (
              <QuoteSkeleton />
            ) : (
              <>
                <div className={styles.accountGrid}>
                  <div>
                    <span className={styles.label}>
                      NEAR account · {walletMode ? "co-pilot" : "guest"}
                    </span>
                    <AccountId id={accountId} />
                  </div>
                  <div>
                    <span className={styles.label}>Trading address</span>
                    {account?.address ? (
                      <>
                        <AccountId id={account.address} />
                        <a
                          className={styles.address}
                          href={`https://sepolia.arbiscan.io/address/${account.address}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View explorer <ExternalLink size={12} />
                        </a>
                      </>
                    ) : (
                      <span>Set up to derive your address</span>
                    )}
                  </div>
                  <div>
                    <span className={styles.label}>Orderly account ID</span>
                    <AccountId
                      id={
                        account?.orderlyAccountId ?? account?.accountId ?? "—"
                      }
                    />
                  </div>
                  <div>
                    <span className={styles.label}>Test USDC balance</span>
                    <strong className={styles.balance}>
                      {account?.usdcBalance === undefined ? (
                        "—"
                      ) : (
                        <NumberTicker
                          className={styles.ticker}
                          value={Number(account.usdcBalance)}
                          decimalPlaces={2}
                        />
                      )}{" "}
                      <small>USDC</small>
                    </strong>
                  </div>
                </div>
                <div className={styles.accountActions}>
                  {(!registered || !(Number(account?.usdcBalance) > 0)) && (
                    <button
                      className={styles.primary}
                      onClick={() => void bootstrap()}
                      disabled={!!busy || accountLoading}
                    >
                      {busy === "bootstrap"
                        ? "Setting up your account…"
                        : accountLoading
                          ? "Checking account…"
                          : "Set up perps account"}
                    </button>
                  )}
                  <span className={styles.fineprint}>
                    {registered
                      ? "Balance & positions refresh every 15 s"
                      : "Registration may take a minute. Setup requests test funds when needed."}
                  </span>
                  {!walletMode && (
                    <Link href="/agent" className={styles.textLink}>
                      Manage guest guard ↗
                    </Link>
                  )}
                </div>
                <p className={styles.fineprint}>
                  Perps use Orderly test USDC. Setup sends you 50 test USDC
                  right away.
                </p>
                <a
                  className={styles.textLink}
                  href="https://near-faucet.io/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Need NEAR for gas? Official NEAR testnet faucet ↗
                </a>
                {account?.faucetRequested &&
                  !(Number(account.usdcBalance) > 0) && (
                    <p className={styles.notice} role="status">
                      Test funds requested from Orderly's faucet. This can take a while, so try setup again in a few minutes.
                    </p>
                  )}
              </>
            )}
            {accountError && (
              <ErrorNotice error={accountError} className={styles.warning} />
            )}
            {error && <ErrorNotice error={error} className={styles.warning} />}
          </div>
        </details>

        {receipt && (
          <motion.section
            className={styles.receipt}
            aria-label="Execution status"
            aria-live="polite"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className={styles.sectionHeading}>
              <h2>
                {receipt.status === "pending"
                  ? "Execution in progress"
                  : receipt.status === "failed"
                    ? "Execution stopped"
                    : "Request accepted"}
              </h2>
              <Badge variant="testnet" />
            </div>
            <p className={styles.mono}>{plainText(receipt.label)}</p>
            <ExecutionTimeline
              success={receipt.status === "done"}
              steps={[
                ...(receipt.kind === "open"
                  ? [
                      {
                        label: receipt.wallet
                          ? "Check off-chain limit · wallet approval"
                          : "Check your limits on-chain",
                        status:
                          receipt.result?.authTx ||
                          (receipt.wallet && receipt.status === "done")
                            ? ("success" as const)
                            : receipt.status === "failed"
                              ? ("error" as const)
                              : ("pending" as const),
                        detail:
                          receipt.status === "pending"
                            ? "Waiting for confirmation…"
                            : receipt.error && !receipt.result?.authTx
                              ? receipt.error
                              : undefined,
                        href: receipt.result?.rejectedTx
                          ? txUrl(receipt.result.rejectedTx)
                          : receipt.result?.authTx
                            ? txUrl(receipt.result.authTx)
                            : undefined,
                      },
                    ]
                  : []),
                {
                  label:
                    receipt.kind === "close"
                      ? "Orderly · reduce-only close"
                      : "Orderly · submit with trading key",
                  detail: authorizationRejected
                    ? "Skipped: guard rejected authorization."
                    : "Trading access cannot withdraw your funds.",
                  status:
                    receipt.status === "done"
                      ? "success"
                      : authorizationRejected
                        ? "idle"
                        : receipt.status === "failed"
                          ? "error"
                          : receipt.kind === "close"
                            ? "pending"
                            : "idle",
                },
                {
                  label:
                    receipt.status === "done"
                      ? "Accepted · check live positions for fills"
                      : "Venue acceptance",
                  detail: "Check positions below to confirm the fill.",
                  status: receipt.status === "done" ? "success" : "idle",
                },
                ...(receipt.kind === "open"
                  ? [
                      {
                        label: observedExposure
                          ? "Live exposure updated"
                          : "Await live position update",
                        detail: "Live position from Orderly.",
                        status: observedExposure
                          ? ("success" as const)
                          : ("idle" as const),
                      },
                    ]
                  : []),
              ]}
            />
            {receipt.status === "pending" && (
              <p className={styles.fineprint}>
                Keep this page open while the request finishes.
              </p>
            )}
            {receipt.error && (
              <ErrorNotice error={receipt.error} className={styles.warning} />
            )}
            <div className={styles.receiptLinks}>
              {receipt.result?.authTx && (
                <a
                  href={txUrl(receipt.result.authTx)}
                  target="_blank"
                  rel="noreferrer"
                >
                  NEAR authorization tx ↗
                </a>
              )}
              {receipt.result?.rejectedTx && (
                <a
                  href={txUrl(receipt.result.rejectedTx)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Failed NEAR tx · view on-chain rejection ↗
                </a>
              )}
              {receipt.result?.authId != null && (
                <span>Authorization #{receipt.result.authId}</span>
              )}
              {receipt.result?.orderId != null && (
                <span>
                  Orderly order ID <strong>{receipt.result.orderId}</strong>
                </span>
              )}
              {receipt.result?.orderIds?.map((id) => (
                <span key={id}>
                  Orderly order ID <strong>{id}</strong>
                </span>
              ))}
            </div>
            {receipt.status === "done" && (
              <p className={styles.fineprint}>
                Positions refresh from Orderly every 15 s. An accepted request
                is not a guaranteed fill.
                {receipt.kind === "close" && !receipt.result?.orderIds?.length
                  ? " No open positions were found to close."
                  : ""}
              </p>
            )}
          </motion.section>
        )}

        <section className={styles.positions} aria-label="Positions">
          <div className={styles.sectionHeading}>
            <h2>
              Your positions{" "}
              <span className={styles.count}>{positions.length}</span>
            </h2>
            <button
              className={styles.danger}
              disabled={!positions.length || !!busy || !accountId}
              onClick={() => setCloseTarget("all")}
            >
              Close all
            </button>
          </div>
          <p className={styles.fineprint}>
            Pause and revoke leave positions open. Use Close to exit.
          </p>
          {closeTarget && (
            <ManagementDialog
              title="Review position close"
              onClose={() => setCloseTarget(null)}
            >
              <div className={styles.closePreview}>
                <h3>
                  {closeTarget === "all"
                    ? `Close all ${positions.length} open positions?`
                    : `Close ${marketName(closeTarget)}?`}
                </h3>
                <p>
                  Close at the available market price. Estimated fee: 0.1% of
                  the position size.
                </p>
                <div className={styles.accountActions}>
                  <button
                    className={styles.danger}
                    onClick={() => void trade("close", closeTarget)}
                    disabled={!!busy}
                  >
                    Confirm {closeTarget === "all" ? "close all" : "close"}
                  </button>
                  <button
                    className={styles.secondary}
                    onClick={() => setCloseTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </ManagementDialog>
          )}
          {accountLoading ? (
            <QuoteSkeleton />
          ) : !positions.length ? (
            <EmptyState
              title={
                accountError
                  ? "Positions could not be refreshed"
                  : "No open positions"
              }
              description={
                accountError
                  ? "Waiting for the next successful refresh."
                  : "Your positions appear here after a trade fills."
              }
            />
          ) : (
            <div className={styles.positionCards}>
              {positions.map((p) => (
                <article className={styles.positionCard} key={p.symbol}>
                  <div className={styles.positionHeader}>
                    <TokenGlyph
                      token={{ id: p.symbol, symbol: marketName(p.symbol) }}
                    />
                    <strong>
                      {marketName(p.symbol)}
                      <small
                        className={
                          p.qty > 0 ? styles.positive : styles.negative
                        }
                      >
                        {p.qty > 0 ? "Long" : "Short"} · {p.leverage}x
                      </small>
                    </strong>
                    <button
                      className={styles.secondary}
                      disabled={!!busy}
                      onClick={() => setCloseTarget(p.symbol)}
                      aria-label={`Close ${marketName(p.symbol)} position`}
                    >
                      Close
                    </button>
                  </div>
                  <p className={styles.fineprint}>Unrealized PnL</p>
                  <div
                    className={`${styles.positionPnl} ${p.unrealizedPnl >= 0 ? styles.positive : styles.negative}`}
                  >
                    $
                    <NumberTicker
                      className={styles.ticker}
                      value={p.unrealizedPnl}
                      decimalPlaces={2}
                    />
                  </div>
                  <dl className={styles.metrics}>
                    <div>
                      <dt>Size</dt>
                      <dd>{number(Math.abs(p.qty), 6)}</dd>
                    </div>
                    <div>
                      <dt>Entry</dt>
                      <dd>{usd(p.avgOpen)}</dd>
                    </div>
                    <div>
                      <dt>Mark</dt>
                      <dd>{usd(p.markPrice)}</dd>
                    </div>
                    <div>
                      <dt>Est. liquidation</dt>
                      <dd>
                        {p.estLiqPrice > 0 ? usd(p.estLiqPrice) : "Unavailable"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
