"use client";
import { ErrorNotice } from "@/components/leash/ErrorNotice";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAccount } from "../account/AccountProvider";
import { useDefiState } from "@/hooks/useDefiState";
import { amountMeta, limitText, type Proposal } from "@/lib/defi/preview";
import { plainText, protocolName } from "./display";
import { AccountId } from "./AccountId";
import {
  executeProposal,
  walletPolicy,
  walletSpent,
} from "@/lib/defi/execution";
import { saveReceipt } from "@/lib/defi/history";
import { txLink } from "@/lib/defi/client";
import {
  QuoteCard,
  ExecutionTimeline,
  PressableButton,
  useToast,
} from "./widget";
import { Badge } from "./Badge";
import { TokenIcon } from "./TokenIcon";
import { tokensInText } from "./token-display";
const inFlight = new Set<string>();
export function ActionPreview({
  proposal: p,
  children,
  network = "testnet",
}: {
  proposal: Proposal;
  children?: ReactNode;
  network?: "testnet" | "mainnet";
}) {
  const account = useAccount(),
    data = useDefiState(account.accountId);
  const toast = useToast();
  const [stage, setStage] = useState("review"),
    [seconds, setSeconds] = useState(3),
    [now, setNow] = useState(p.quotedAt);
  const [events, setEvents] = useState<{ status: string; at: string }[]>([]),
    [hashes, setHashes] = useState<string[]>([]),
    [error, setError] = useState(""),
    [orderId, setOrderId] = useState("");
  const executing = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const age = Math.max(0, Math.floor((now - p.quotedAt) / 1000));
  const expiresAt = p.expiresAt ?? p.quotedAt + 60000;
  const expired =
    now >= expiresAt &&
    (!!p.guardAction || p.action.kind === "perp_open" || !!p.expiresAt);
  const event = (status: string, hash?: string) => {
    setEvents((items) => [...items, { status, at: new Date().toISOString() }]);
    if (hash) setHashes((h) => [...new Set([...h, hash])]);
  };
  async function execute() {
    if (executing.current || inFlight.has(account.accountId)) {
      setError("Another action is still settling on this account");
      setStage("review");
      return;
    }
    if (
      Date.now() - p.quotedAt >= 60000 &&
      (p.guardAction || p.action.kind === "perp_open")
    ) {
      setError("Quote expired. Request a fresh preview before confirming.");
      setStage("review");
      return;
    }
    executing.current = true;
    inFlight.add(account.accountId);
    setStage("submitting");
    setError("");
    event(
      account.walletSession
        ? "Waiting for wallet signatures"
        : "Submitting to the on-chain guard",
    );
    try {
      const r = await executeProposal(
        p,
        account.guest,
        account.walletSession,
        event,
      );
      if (r.txHash) event("Submitted → included (reported by RPC)", r.txHash);
      if (r.orderId) setOrderId(r.orderId);
      const rejected = !r.ok && !!r.txHash;
      setStage(r.ok ? "final" : "failed");
      event(
        r.ok && ["perp_open", "perp_close", "close_all"].includes(p.action.kind)
          ? "Orderly request accepted · inspect positions for confirmed fills"
          : r.ok
            ? r.txHash
              ? "Final · protocol execution confirmed"
              : "Orderly request accepted · check positions for fills"
            : rejected
              ? "Rejected on-chain"
              : "Execution refused",
      );
      if (!r.ok) setError(r.error || "Execution failed");
      toast({
        title: r.ok
          ? p.action.kind.startsWith("perp") || p.action.kind === "close_all"
            ? "Orderly request accepted"
            : "Protocol execution confirmed"
          : rejected
            ? "Rejected on-chain"
            : "Execution refused",
        description: r.ok
          ? plainText(p.headline)
          : r.error || "Execution failed",
        variant: r.ok ? "success" : "error",
        href: r.txHash ? txLink(r.txHash) : undefined,
      });
      saveReceipt(account.accountId, {
        id: r.txHash || r.orderId || crypto.randomUUID(),
        at: Date.now(),
        headline: p.headline,
        ...r,
        rejected,
      });
      await data.refresh();
    } catch (e) {
      setError(String((e as Error).message));
      event("Request failed · no confirmed execution");
      toast({
        title: "Request failed",
        description: (e as Error).message,
        variant: "error",
      });
      setStage("failed");
    } finally {
      executing.current = false;
      inFlight.delete(account.accountId);
    }
  }
  useEffect(() => {
    if (stage !== "countdown") return;
    const start = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, 3 - Math.floor((Date.now() - start) / 1000));
      setSeconds(left);
      if (!left) {
        clearInterval(timer);
        void execute();
      }
    }, 200);
    return () => clearInterval(timer);
    // A confirmed proposal captures this account. Switching accounts unmounts its keyed card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  function confirm() {
    setError("");
    if (account.walletSession) void execute();
    else {
      setSeconds(3);
      setStage("countdown");
    }
  }
  let displayedLimit = p.limit;
  if (account.walletSession) {
    try {
      const asset = p.guardAction
        ? amountMeta(p.guardAction).asset
        : p.action.kind === "perp_open"
          ? "perp_usd"
          : null;
      if (asset)
        displayedLimit = limitText(
          walletPolicy(account.accountId),
          walletSpent(account.accountId),
          asset,
        );
    } catch {
      displayedLimit += " · browser usage unavailable";
    }
  }
  const actionTitles: Record<string, string> = {
    swap: "Swap",
    stake: "Stake",
    unstake: "Unstake",
    supply: "Supply",
    withdraw: "Withdraw",
    perp_open: "Open position",
    perp_close: "Close position",
    close_all: "Close all perps",
    bridge_quote: "Bridge quote",
    portfolio: "Your portfolio",
    explain: network === "mainnet" ? "Bridge" : "Your limits",
  };
  const actionLabel =
    p.action.kind === "perp_open"
      ? `Open ${p.action.side === "BUY" ? "long" : "short"}`
      : actionTitles[p.action.kind] || "Confirm";
  const canExecute =
    !!account.accountId &&
    (!!account.walletSession ||
      p.action.kind === "close_all" ||
      p.action.kind === "perp_close" ||
      (!!data.guardInstalled && !!data.agentKey));
  const statusTerminal = stage === "final" || stage === "failed";
  const shortFact = (label: string, value: string) => {
    if (label === "Unlock")
      return "Withdraw from LiNEAR after the unlock period.";
    if (label === "Projected health factor")
      return /no borrows/i.test(value)
        ? "Not used · no borrowing"
        : "Unavailable · repay borrows first";
    if (label === "Gas & storage") return "Paid in NEAR · storage may apply";
    if (label === "Slippage limit") return value.split(" · ")[0];
    if (label === "Liquidation estimate")
      return `${value.split(" · ")[0]} · cross-margin estimate`;
    if (label === "Margin mode / fees") return "Cross margin · fees on fills";
    if (label === "Stop controls")
      return "No automatic stop-loss · close manually";
    return plainText(value);
  };
  return (
    <QuoteCard
      ariaLabel="Action preview"
      className={`action-preview ${p.blocked ? "has-refusal" : ""}`}
      title={protocolName(p.protocol)}
      remaining={
        p.quoteOnly ? undefined : Math.max(0, (expiresAt - now) / 1000)
      }
      quoteDuration={(expiresAt - p.quotedAt) / 1000}
      output={plainText(
        p.deltas.find((delta) => delta.startsWith("+")) || p.headline,
      )}
      badges={
        <>
          <Badge
            variant={
              network === "mainnet"
                ? "real-mainnet"
                : p.action.kind === "bridge_quote"
                  ? "quote-only"
                  : "testnet"
            }
          />
          <span className="leash-badge">
            {network === "mainnet"
              ? "Wallet co-pilot"
              : account.walletSession
                ? "Wallet · off-chain limit"
                : "On-chain limits"}
          </span>
          {p.quoteOnly && p.action.kind !== "bridge_quote" && (
            <Badge
              variant={
                p.action.kind === "portfolio" || p.action.kind === "explain"
                  ? "read-only"
                  : "quote-only"
              }
            />
          )}
        </>
      }
      subtitle={
        <>
          <h2 className="quote-action-headline">
            {actionTitles[p.action.kind] || "Review action"}
          </h2>
          <div className="asset-deltas">
            {p.deltas.map((delta) => (
              <span key={delta}>
                {tokensInText(delta).map((t) => (
                  <TokenIcon key={t.symbol} token={t} size={20} />
                ))}
                {plainText(delta)}
              </span>
            ))}
          </div>
        </>
      }
      steps={
        <ol className="planned-route">
          <li>
            {p.quoteOnly
              ? "Read live protocol data"
              : account.walletSession || network === "mainnet"
                ? "Review and sign with your wallet"
                : "Check limits through the on-chain guard"}
          </li>
          <li>
            {p.quoteOnly
              ? "Preview only · no transaction"
              : `Submit to ${p.protocol}`}
          </li>
          <li>
            {p.quoteOnly
              ? "No funds move"
              : "Inspect the final protocol receipt"}
          </li>
          <li>App: {protocolName(p.protocol)}</li>
        </ol>
      }
      metrics={[
        ...p.facts
          .filter((fact) => !/reference/i.test(fact.label))
          .map((fact) => ({
            ...fact,
            label: plainText(fact.label),
            value: /^(Destination|Refund to)$/.test(fact.label) ? (
              <AccountId id={fact.value.split(" · ")[0]} />
            ) : (
              shortFact(fact.label, fact.value)
            ),
          })),
        {
          label: "Your limit",
          value: plainText(displayedLimit),
        },
        {
          label: "Quote",
          value: expired ? "Expired — get a new quote" : `${age}s ago`,
        },
      ]}
    >
      <details className="proposal-sources">
        <summary>Technical details</summary>
        <p>{plainText(p.because)}</p>
        {p.facts
          .filter(
            (fact) =>
              shortFact(fact.label, fact.value) !== plainText(fact.value),
          )
          .map((fact) => (
            <p key={fact.label}>
              {plainText(fact.label)}: {plainText(fact.value)}
            </p>
          ))}
        <p>App: {protocolName(p.protocol)}</p>
        {p.contract && (
          <p>
            Destination: <AccountId id={p.contract} />
          </p>
        )}
        {p.sources.map((source, i) => (
          <p key={i}>
            {protocolName(source.name)} · {new Date(source.at).toLocaleString()}
          </p>
        ))}
        <p>
          {account.walletSession
            ? "Your wallet approves each action."
            : "The agent can only act within your limits."}
        </p>
      </details>
      {p.blocked && (
        <>
          <ErrorNotice error={p.blocked} />
          {p.tryAnyway && (
            <p className="la-fineprint">
              Test the limit to see an on-chain rejection. A small testnet fee
              applies.
            </p>
          )}
        </>
      )}
      {children ||
        (!p.quoteOnly && (
          <>
            {!canExecute && (
              <p className="la-fineprint">
                {account.accountId
                  ? "Set up your agent or connect a wallet to continue."
                  : "Start free on testnet or connect a wallet to confirm."}
              </p>
            )}
            {stage === "countdown" ? (
              <div className="undo-countdown">
                <strong>Executing in {seconds}s</strong>
                <button onClick={() => setStage("review")}>Undo</button>
              </div>
            ) : stage === "submitting" ? (
              <p role="status">Waiting for confirmation…</p>
            ) : (
              !statusTerminal && (
                <PressableButton
                  variant={p.blocked ? "danger" : "primary"}
                  disabled={
                    !canExecute ||
                    expired ||
                    (!!p.blocked && (!p.tryAnyway || !!account.walletSession))
                  }
                  onClick={confirm}
                >
                  {p.blocked && p.tryAnyway
                    ? "Try anyway · prove on-chain"
                    : account.walletSession
                      ? `${actionLabel} in wallet`
                      : actionLabel}
                </PressableButton>
              )
            )}
          </>
        ))}
      {p.action.kind === "portfolio" && (
        <Link className="la-btn" href="/portfolio">
          Open Portfolio ↗
        </Link>
      )}
      {p.action.kind === "bridge_quote" && (
        <Link className="la-link" href="/bridge">
          Bridge workspace ↗
        </Link>
      )}
      {!!events.length && (
        <>
          <ExecutionTimeline
            success={stage === "final"}
            steps={[
              {
                label: account.walletSession
                  ? "Your wallet signs"
                  : p.guardAction || p.action.kind === "perp_open"
                    ? "Guard checks limits on-chain"
                    : "Agent submits reduce-only close",
                detail: account.walletSession
                  ? "Co-pilot · off-chain policy"
                  : p.guardAction || p.action.kind === "perp_open"
                    ? "Your limits apply"
                    : "Trading access only",
                status:
                  stage === "submitting"
                    ? "pending"
                    : stage === "failed"
                      ? "error"
                      : "success",
                href:
                  stage === "failed" && hashes.length
                    ? txLink(hashes[hashes.length - 1])
                    : undefined,
              },
              ...hashes.map((hash) => ({
                label:
                  stage === "failed"
                    ? "Inspect transaction receipt"
                    : "Transaction reported by RPC",
                detail: "View the receipt below",
                status:
                  stage === "failed"
                    ? ("error" as const)
                    : ("success" as const),
                href: txLink(hash),
              })),
              {
                label:
                  stage === "final"
                    ? events[events.length - 1].status
                    : stage === "failed"
                      ? events[events.length - 1].status
                      : "Waiting for the protocol receipt",
                status:
                  stage === "final"
                    ? "success"
                    : stage === "failed"
                      ? "error"
                      : "pending",
              },
            ]}
          />
          <details className="proposal-sources">
            <summary>Execution event log</summary>
            {events.map((e, i) => (
              <p key={i}>
                {plainText(e.status)} · {new Date(e.at).toLocaleTimeString()}
              </p>
            ))}
          </details>
        </>
      )}
      {orderId && (
        <p>
          Order reference: {orderId} ·{" "}
          <Link href="/perps">Inspect positions and fills</Link>
        </p>
      )}
      {error && <ErrorNotice error={error} />}
    </QuoteCard>
  );
}
