"use client";
import { networkFetch } from "@/lib/near/network";

import { AccountId } from "./AccountId";
import { shortAccount, actionName } from "./display";
import { ErrorNotice } from "@/components/leash/ErrorNotice";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionPreview } from "./ActionPreview";
import { Badge } from "./Badge";
import { ArrowRight, ShieldCheck, Wallet } from "lucide-react";
import {
  AmountPanel,
  EmptyState,
  ExecutionTimeline,
  FlipButton,
  PressableButton,
  QuoteSkeleton,
  RouteList,
  TokenPicker,
  WidgetShell,
  useToast,
  type WidgetToken,
} from "./widget";
import { useAccount } from "../account/AccountProvider";
import {
  connectMainnet,
  disconnectMainnet,
  signDeposit,
  DepositNotSentError,
  type MainnetSession,
} from "@/lib/bridge/wallet";
import {
  assertCap,
  destinationTokens,
  validateTransfer,
  validateQuote,
  type PreparedQuote,
} from "@/lib/bridge/validation";
import type { DepositPlan } from "@/lib/bridge/server";
import type { IntentsToken } from "@/lib/near/intents";
const STORAGE = "leash:mainnet-bridge:attempt:v1";
const TERMINAL = ["SUCCESS", "REFUNDED", "FAILED"];
type Attempt = {
  prepared: PreparedQuote;
  startedAt: string;
  txHash?: string;
  walletFailed?: boolean;
};
type Status = {
  status: string;
  swapDetails?: {
    destinationChainTxHashes?: { hash: string; explorerUrl: string }[];
  };
};
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await networkFetch(
    `/api/bridge/${path}`,
    data === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Bridge HTTP ${response.status}`);
  return result;
}
function Proof({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return /^https:\/\//.test(href) ? (
    <a href={href} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  ) : (
    <span>{children}</span>
  );
}
export function MainnetBridgePanel() {
  const { guest, walletSession, restoring, signOutGuest } = useAccount();
  const toast = useToast();
  const [picker, setPicker] = useState<"source" | "destination" | null>(null);
  const closePicker = useCallback(() => {
    setPicker(null);
    setTimeout(
      () =>
        document
          .querySelector<HTMLButtonElement>(".mainnet-widget .token-pill")
          ?.focus(),
      180,
    );
  }, []);
  const guestMode = !!guest && !walletSession;
  const [session, setSession] = useState<MainnetSession | null>(null);
  const [tokens, setTokens] = useState<IntentsToken[]>([]);
  const [source, setSource] = useState<"USDC" | "NEAR">("USDC");
  const [chain, setChain] = useState("base"),
    [asset, setAsset] = useState("");
  const [amount, setAmount] = useState(""),
    [recipient, setRecipient] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [prepared, setPrepared] = useState<PreparedQuote | null>(null);
  const [plan, setPlan] = useState<DepositPlan | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [timeline, setTimeline] = useState<{ status: string; at: string }[]>(
    [],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [manualHash, setManualHash] = useState("");
  const lock = useRef(false);
  const operation = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        setAttempt(JSON.parse(saved));
        lock.current = true;
      }
    } catch {
      setError(
        "Could not read saved bridge state. Inspect wallet history before signing again.",
      );
      lock.current = true;
    }
    void api<{ tokens: IntentsToken[] }>("tokens")
      .then((result) => setTokens(result.tokens))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setPrepared(null);
    setPlan(null);
    setConfirmed(false);
  }, [source, asset, amount, recipient, session, guestMode]);
  useEffect(() => {
    if (!attempt) return;
    let active = true;
    const poll = async () => {
      try {
        const quote = attempt.prepared.quote;
        const params = new URLSearchParams({
          depositAddress: quote.depositAddress!,
        });
        if (quote.depositMemo) params.set("depositMemo", quote.depositMemo);
        const next = await api<Status>(`status?${params}`);
        if (!active) return;
        setStatus(next);
        setTimeline((previous) =>
          previous.at(-1)?.status === next.status
            ? previous
            : [
                ...previous,
                { status: next.status, at: new Date().toISOString() },
              ],
        );
        setError("");
      } catch (e) {
        if (active)
          setError(
            `Status unavailable: ${(e as Error).message}. Do not deposit again.`,
          );
      }
    };
    void poll();
    const timer = setInterval(() => {
      if (!document.hidden) void poll();
    }, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [attempt]);
  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
      toast({
        title: "Bridge request failed",
        description: (e as Error).message,
        variant: "error",
      });
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function save(value: Attempt) {
    localStorage.setItem(STORAGE, JSON.stringify(value));
    setAttempt(value);
  }
  async function quote() {
    if (!session || guestMode || restoring || lock.current)
      throw new Error(
        "Connect your own mainnet wallet outside guest mode first",
      );
    const transfer = {
      mode: "mainnet-wallet" as const,
      source,
      amount,
      destinationAsset: asset,
      recipient,
      refundTo: session.accountId,
      realMoneyConfirmed: true as const,
    };
    const v = validateTransfer(transfer, tokens);
    assertCap(v.usd, "Source input");
    const result = await api<PreparedQuote>("quote", {
      ...transfer,
      dry: false,
    });
    validateQuote(result.quote, result.quoteRequest, transfer, v.origin);
    assertCap(result.totalUsd, "Total including fees");
    const deposit = await api<DepositPlan>("deposit-plan", {
      ...transfer,
      depositAddress: result.quote.depositAddress,
      ...(result.quote.depositMemo
        ? { depositMemo: result.quote.depositMemo }
        : {}),
    });
    assertCap(deposit.totalUsd, "Total including fees");
    setPrepared(result);
    setPlan(deposit);
    setConfirmed(false);
  }
  async function send() {
    if (
      !session ||
      !prepared ||
      !plan ||
      !confirmed ||
      guestMode ||
      restoring ||
      lock.current
    )
      throw new Error("Review and confirm the mainnet transfer first");
    // Fresh server checks immediately before signing; no client-provided deposit amount is trusted.
    const fresh = await api<DepositPlan>("deposit-plan", {
      ...prepared.transfer,
      depositAddress: prepared.quote.depositAddress,
      ...(prepared.quote.depositMemo
        ? { depositMemo: prepared.quote.depositMemo }
        : {}),
    });
    assertCap(fresh.totalUsd, "Total including fees");
    if (fresh.totalUsd > plan.totalUsd + 0.01) {
      setPlan(fresh);
      setConfirmed(false);
      throw new Error(
        "Wallet costs changed. Review the updated total and confirm again.",
      );
    }
    if (localStorage.getItem(STORAGE))
      throw new Error(
        "An existing deposit attempt is already saved. Reload to inspect it before signing again.",
      );
    lock.current = true;
    let current: Attempt = { prepared, startedAt: new Date().toISOString() };
    // Persist before opening the wallet: ambiguous redirects/timeouts must not allow a second deposit.
    try {
      save(current);
    } catch {
      lock.current = false;
      throw new Error(
        "Browser storage unavailable; signing disabled to prevent duplicate deposits",
      );
    }
    try {
      const result = await signDeposit(session, fresh);
      current = {
        ...current,
        txHash: result.txHash,
        walletFailed: result.failed,
      };
      save(current);
      toast({
        title: result.failed
          ? "Wallet reported a failed receipt"
          : "Mainnet deposit submitted",
        variant: result.failed ? "error" : "success",
        href: result.txHash
          ? `https://nearblocks.io/txns/${result.txHash}`
          : undefined,
      });
      if (!result.failed) await submit(current, result.txHash);
    } catch (e) {
      if (e instanceof DepositNotSentError) {
        localStorage.removeItem(STORAGE);
        setAttempt(null);
        lock.current = false;
      }
      throw e;
    }
  }
  async function submit(value: Attempt, txHash: string) {
    await api("submit", {
      depositAddress: value.prepared.quote.depositAddress,
      txHash,
      nearSenderAccount: value.prepared.transfer.refundTo,
      ...(value.prepared.quote.depositMemo
        ? { memo: value.prepared.quote.depositMemo }
        : {}),
    });
    save({ ...value, txHash });
  }
  const destinations = destinationTokens(tokens);
  const chains = [...new Set(destinations.map((t) => t.blockchain))];
  const selected = destinations.find((t) => t.assetId === asset);
  const widgetToken = (t: IntentsToken): WidgetToken => ({
    id: t.assetId,
    symbol: t.symbol,
    name: `${t.symbol} on ${t.blockchain}`,
    chain: t.blockchain,
    logo: `/tokens/${t.symbol.toLowerCase()}.png`,
  });
  const inputPrice = tokens.find(
    (t) => t.blockchain === "near" && t.symbol === source,
  )?.price;
  const inputUsd =
    inputPrice && Number.isFinite(Number(amount))
      ? Number(amount) * Math.max(inputPrice, source === "USDC" ? 1 : 0)
      : 0;
  const cappedTotal = plan?.totalUsd ?? inputUsd;
  const review =
    prepared && plan ? (
      <ActionPreview
        network="mainnet"
        proposal={{
          action: { kind: "explain", topic: "mainnet deposit" },
          headline: `Bridge ${prepared.quote.amountInFormatted} ${source} to ${prepared.destinationToken.blockchain}`,
          deltas: [
            `−${prepared.quote.amountInFormatted} ${source} on NEAR mainnet`,
            `+≥${Number(prepared.quote.minAmountOut) / 10 ** prepared.destinationToken.decimals} ${prepared.destinationToken.symbol}`,
          ],
          protocol: "NEAR Intents 1Click",
          contract: prepared.quote.depositAddress || "No deposit address",
          because:
            "Because you selected your own destination address and an exact input route.",
          quotedAt: Date.parse(prepared.timestamp),
          expiresAt: Date.parse(plan.deadline),
          sources: [
            {
              name: "1Click executable mainnet quote",
              at: Date.parse(prepared.timestamp),
            },
          ],
          limit:
            "$25 total including fees and wallet reserve · enforced client and server",
          facts: [
            {
              label: "Estimated receive",
              value: `${prepared.quote.amountOutFormatted} ${prepared.destinationToken.symbol}`,
            },
            {
              label: "Minimum received",
              value: `${Number(prepared.quote.minAmountOut) / 10 ** prepared.destinationToken.decimals} ${prepared.destinationToken.symbol}`,
            },
            {
              label: "Total including reserve",
              value: `$${plan.totalUsd.toFixed(4)} / $25`,
            },
            {
              label: "Time estimate",
              value: `${prepared.quote.timeEstimate}s after deposit · not guaranteed`,
            },
            {
              label: "Fees / slippage",
              value:
                "Route fees included in input · no Leash fee · 1% slippage limit",
            },
            {
              label: "Wallet reserve",
              value: `${plan.walletReserveNear} NEAR for gas/storage · unused gas stays yours`,
            },
            {
              label: "Destination",
              value: `${prepared.transfer.recipient} · ${prepared.destinationToken.blockchain}`,
            },
            {
              label: "Refund to",
              value: `${prepared.transfer.refundTo} · refund fees may apply`,
            },
            {
              label: "Expires",
              value: new Date(plan.deadline).toLocaleString(),
            },
          ],
        }}
      >
        <label className="bridge-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            I checked my destination address and costs. I approve this
            real-money transfer.
          </span>
        </label>
        <PressableButton
          variant="danger"
          disabled={!confirmed || !session || busy || guestMode || lock.current}
          onClick={() => void run(send)}
        >
          Sign mainnet deposit <ArrowRight size={15} />
        </PressableButton>
      </ActionPreview>
    ) : null;
  return (
    <div className="mainnet-widget">
      {attempt ? (
        <section className="mainnet-tracking-card">
          <Badge variant="real-mainnet" />
          <div aria-live="polite" className="bridge-tracking">
            <h3>
              {status?.status
                ? actionName(status.status)
                : "Checking deposit status…"}
            </h3>
            <p>Started {new Date(attempt.startedAt).toLocaleString()}</p>
            <p>
              Deposit:{" "}
              <AccountId
                id={attempt.prepared.quote.depositAddress || "Pending"}
              />
              {attempt.prepared.quote.depositMemo &&
                ` · Memo ${attempt.prepared.quote.depositMemo}`}
            </p>
            <p>
              Destination:{" "}
              <AccountId id={attempt.prepared.transfer.recipient} /> ·{" "}
              {attempt.prepared.destinationToken.symbol} on{" "}
              {attempt.prepared.destinationToken.blockchain}
            </p>
            {attempt.txHash ? (
              <p>
                <Proof href={`https://nearblocks.io/txns/${attempt.txHash}`}>
                  View NEAR deposit
                </Proof>
                {attempt.walletFailed && " · Wallet reported a failed receipt"}
              </p>
            ) : (
              <p>
                Wallet signing may have been interrupted. Check wallet history
                before any further action. This deposit is locked against
                resending.
              </p>
            )}
            <p>
              <Proof href="https://explorer.near-intents.org">
                Intents explorer · search the deposit address
              </Proof>
            </p>
            <ExecutionTimeline
              success={status?.status === "SUCCESS"}
              steps={[
                {
                  label: "Your mainnet wallet signs the deposit",
                  detail: attempt.txHash
                    ? "Wallet returned a transaction hash; inspect its receipt."
                    : "Check wallet history before any further action.",
                  status: attempt.walletFailed
                    ? "error"
                    : attempt.txHash
                      ? "success"
                      : "pending",
                  href: attempt.txHash
                    ? `https://nearblocks.io/txns/${attempt.txHash}`
                    : undefined,
                },
                ...timeline.map((t) => ({
                  label: `Transfer: ${actionName(t.status)}`,
                  detail: new Date(t.at).toLocaleTimeString(),
                  status:
                    t.status === "FAILED"
                      ? ("error" as const)
                      : t.status === "SUCCESS" || t.status === "REFUNDED"
                        ? ("success" as const)
                        : ("idle" as const),
                })),
                {
                  label:
                    status?.status === "SUCCESS"
                      ? "Destination delivery reported"
                      : status?.status === "REFUNDED"
                        ? "Refund reported · inspect wallet"
                        : status?.status === "FAILED"
                          ? "Route failed · inspect receipts"
                          : "Tracking destination delivery",
                  status:
                    status?.status === "SUCCESS" ||
                    status?.status === "REFUNDED"
                      ? "success"
                      : status?.status === "FAILED"
                        ? "error"
                        : "pending",
                },
              ]}
            />
            {status?.swapDetails?.destinationChainTxHashes?.map((tx) => (
              <p key={tx.hash}>
                <Proof href={tx.explorerUrl}>
                  View destination transaction
                </Proof>
              </p>
            ))}
            {status?.status === "SUCCESS" && (
              <p>
                1Click reports destination delivery. Verify the receipt and your
                destination wallet.
              </p>
            )}
            {status?.status === "REFUNDED" && (
              <p>
                Refund sent to{" "}
                <AccountId id={attempt.prepared.transfer.refundTo} />. Refund
                fees may apply.
              </p>
            )}
            {status?.status === "FAILED" && (
              <p>
                Route failed. Inspect the receipts; failure alone does not
                confirm a refund.
              </p>
            )}
            {!TERMINAL.includes(status?.status || "") && (
              <>
                <label>
                  Already sent? Paste the existing NEAR transaction hash
                  <input
                    value={manualHash || attempt.txHash || ""}
                    onChange={(e) => setManualHash(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || !(manualHash || attempt.txHash)}
                  onClick={() =>
                    void run(() =>
                      submit(attempt, manualHash || attempt.txHash!),
                    )
                  }
                >
                  Track this transaction
                </button>
              </>
            )}
            <div className="la-row">
              <a
                download="leash-bridge-proof.json"
                href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ attempt, timeline, status }, null, 2))}`}
              >
                Download quote &amp; proof
              </a>
              {TERMINAL.includes(status?.status || "") && (
                <button
                  onClick={() => {
                    localStorage.removeItem(STORAGE);
                    lock.current = false;
                    setAttempt(null);
                    setPrepared(null);
                    setPlan(null);
                    setStatus(null);
                    setTimeline([]);
                  }}
                >
                  New transfer
                </button>
              )}
            </div>
          </div>
          {error && <ErrorNotice error={error} />}
        </section>
      ) : (
        <WidgetShell
          title="Bridge · mainnet"
          actions={<Badge variant="real-mainnet" />}
          picker={
            picker && (
              <TokenPicker
                title={
                  picker === "source" ? "Send from NEAR" : "Select destination"
                }
                tokens={
                  picker === "source"
                    ? ["USDC", "NEAR"].map((symbol) => ({
                        id: symbol,
                        symbol,
                        chain: "near",
                      }))
                    : destinations.map(widgetToken)
                }
                selected={picker === "source" ? source : asset}
                chains={picker === "destination" ? chains : undefined}
                chain={picker === "destination" ? chain : undefined}
                onChainChange={setChain}
                loading={picker === "destination" && !tokens.length && !error}
                onClose={closePicker}
                onSelect={(t) => {
                  if (picker === "source") setSource(t.symbol as typeof source);
                  else {
                    setAsset(t.id);
                    setChain(t.chain || chain);
                  }
                  closePicker();
                }}
              />
            )
          }
          sidePanel={
            busy && !prepared ? (
              <RouteList title="Waiting for confirmation">
                <QuoteSkeleton />
              </RouteList>
            ) : review ? (
              <RouteList title="Review before signing">{review}</RouteList>
            ) : undefined
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(quote);
            }}
          >
            <fieldset disabled={busy || guestMode || restoring}>
              <AmountPanel
                label="You send · NEAR mainnet"
                amount={amount}
                onChange={setAmount}
                token={{ id: source, symbol: source, chain: "near" }}
                onTokenClick={() => setPicker("source")}
                subValue={
                  inputUsd > 0
                    ? `≈$${inputUsd.toFixed(2)} input · fees checked on quote`
                    : "Exact input · maximum $25 including fees"
                }
              />
              <FlipButton label="Mainnet bridge is from NEAR only" disabled />
              <AmountPanel
                label="You receive · destination"
                amount={prepared?.quote.amountOutFormatted || ""}
                readOnly
                token={
                  selected
                    ? widgetToken(selected)
                    : { id: "select", symbol: "Select", chain }
                }
                onTokenClick={() => setPicker("destination")}
                subValue="Choose a chain and token from the live catalog"
              />
              <label className="bridge-address">
                Your own destination address
                <input
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Address on the destination network"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </label>
              <div className="bridge-cap">
                <div>
                  <span>{plan ? "Total with reserve" : "Input estimate"}</span>
                  <strong>
                    {cappedTotal > 0 ? `$${cappedTotal.toFixed(2)}` : "—"}{" "}
                    <small>/ $25 cap</small>
                  </strong>
                </div>
                <meter
                  value={Math.min(cappedTotal, 25)}
                  max={25}
                  aria-label="Bridge value against the 25 dollar cap"
                />
                <p>Route fees, gas and storage reserve count toward the cap.</p>
              </div>
              <PressableButton
                type="submit"
                variant="danger"
                disabled={
                  !session ||
                  !asset ||
                  !tokens.length ||
                  busy ||
                  lock.current ||
                  !Number(amount)
                }
              >
                {busy ? "Please wait…" : "Get quote"}
                <ArrowRight size={15} />
              </PressableButton>
            </fieldset>
          </form>
          {guestMode ? (
            <p className="integration-notice">
              Mainnet signing is unavailable in testnet guest mode.{" "}
              <button type="button" onClick={signOutGuest}>
                Leave guest mode
              </button>{" "}
              only if you have saved access to your testnet account.
            </p>
          ) : (
            <PressableButton
              variant="secondary"
              disabled={busy || restoring}
              onClick={() =>
                void run(async () => {
                  if (session) {
                    await disconnectMainnet();
                    setSession(null);
                  } else setSession(await connectMainnet());
                })
              }
            >
              <Wallet size={14} />
              {session
                ? `Disconnect ${shortAccount(session.accountId)}`
                : "Connect mainnet wallet"}
            </PressableButton>
          )}
          <p className="widget-inline-note">
            <ShieldCheck size={13} />
            Only your wallet can approve this transfer.
          </p>
          <details className="widget-info">
            <summary>Who holds the keys?</summary>
            <p>
              Your NEAR mainnet wallet keeps your key and signs the deposit.
              This connection is independent of your testnet session. Only send
              to your own destination address. Refunds go to your NEAR mainnet
              wallet; fees may apply.
            </p>
          </details>
          {error && <ErrorNotice error={error} />}
        </WidgetShell>
      )}
    </div>
  );
}
