"use client";
import { networkFetch } from "@/lib/near/network";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAccount } from "../account/AccountProvider";
import { refreshDefiState } from "@/hooks/useDefiState";
import { saveReceipt } from "@/lib/defi/history";
import { ManagementDialog } from "./ManagementDialog";
import { TokenIcon } from "./TokenIcon";
import { tokenDisplay } from "./token-display";
import { Badge } from "./Badge";

type Stock = { symbol: string; amount: string; available: boolean };
type Result = {
  accountId: string;
  sent: { symbol: string; amount: string; txHash: string }[];
  skipped: { symbol: string; reason: string }[];
};
const skippedReasons = new Set([
  "You already have enough",
  "Out of stock — swap NEAR for it instead",
  "Transfer failed — try again",
  "Temporarily unavailable",
]);

export function GetTestTokens({ compact = false }: { compact?: boolean }) {
  const { accountId, network } = useAccount();
  const [open, setOpen] = useState(false);
  if (network === "mainnet") return null;
  return (
    <>
      <button
        type="button"
        className={compact ? "max-chip faucet-chip" : "la-btn ghost"}
        onClick={() => setOpen(true)}
      >
        Get test tokens
      </button>
      {open && (
        <FaucetDialog
          key={accountId}
          accountId={accountId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function FaucetDialog({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const [stock, setStock] = useState<Stock[] | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<Result | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void networkFetch("/api/faucet", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("Stock unavailable");
        setStock((await r.json()).tokens);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "The faucet is unavailable right now. Please try again later.",
          );
      });
    return () => controller.abort();
  }, []);
  async function claim() {
    if (locked.current || !accountId) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await networkFetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(
          response.status === 429
            ? "You’ve requested tokens recently. Please wait a few minutes before trying again."
            : response.status === 503
              ? "The faucet needs a refill. Please try again later."
              : response.status === 404
                ? "This account is not on testnet yet. Create it with the NEAR faucet below."
                : "Could not claim tokens. Please try again in a moment.",
        );
        return;
      }
      setResult(data);
      for (const sent of (data as Result).sent)
        saveReceipt(accountId, {
          id: sent.txHash,
          at: Date.now(),
          headline: `Faucet: +${sent.amount} ${sent.symbol}`,
          ok: true,
          txHash: sent.txHash,
          error: null,
        });
      await refreshDefiState(accountId);
    } catch {
      setError(
        "The connection was interrupted. Check your balances before trying again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <ManagementDialog
      title="Get test tokens"
      onClose={busy && !result ? () => {} : onClose}
    >
      <div className="faucet-content">
        <Badge variant="testnet" />
        <p>
          Top up your account to these amounts. Test tokens have no cash value.
        </p>
        {accountId ? (
          <p className="faucet-account">To {accountId}</p>
        ) : (
          <p>
            Connect a NEAR testnet wallet or create a free guest account first.
          </p>
        )}
        {!stock && !error && <p role="status">Checking available tokens…</p>}
        {!result && stock && (
          <ul className="faucet-tokens">
            {stock.map((t) => (
              <li key={t.symbol}>
                <TokenIcon token={tokenDisplay(t.symbol)} size={28} />
                <strong>{t.symbol}</strong>
                <span>
                  {t.available
                    ? `Up to ${t.amount}`
                    : "Temporarily unavailable"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {busy && !result && (
          <p role="status">
            Sending test tokens… Each token settles separately.
          </p>
        )}
        {result && (
          <ul
            className="faucet-tokens"
            aria-label="Faucet results"
            aria-live="polite"
          >
            {result.sent.map((t, i) => (
              <motion.li
                key={t.symbol}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduced ? 0 : 0.2,
                  delay: reduced ? 0 : i * 0.06,
                }}
              >
                <TokenIcon token={tokenDisplay(t.symbol)} size={28} />
                <strong>
                  +{t.amount} {t.symbol}
                </strong>
                <a
                  href={`https://testnet.nearblocks.io/txns/${t.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction ↗
                </a>
              </motion.li>
            ))}
            {result.skipped.map((t) => (
              <li key={t.symbol}>
                <TokenIcon token={tokenDisplay(t.symbol)} size={28} />
                <strong>{t.symbol}</strong>
                <span>
                  {skippedReasons.has(t.reason)
                    ? t.reason
                    : "Temporarily unavailable"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="integration-notice">
            {error}
          </p>
        )}
        {!result && (
          <button
            type="button"
            className="widget-button widget-button-primary"
            disabled={busy || !accountId || !stock?.some((t) => t.available)}
            onClick={() => void claim()}
          >
            {busy ? "Claiming…" : "Claim"}
          </button>
        )}
        {result && (
          <button
            type="button"
            className="widget-button widget-button-secondary"
            onClick={onClose}
          >
            Done
          </button>
        )}
        <a
          className="faucet-gas-link"
          href="https://near-faucet.io/"
          target="_blank"
          rel="noreferrer"
        >
          Need NEAR for gas? Official NEAR testnet faucet ↗
        </a>
      </div>
    </ManagementDialog>
  );
}
