"use client";
import { ErrorNotice } from "@/components/leash/ErrorNotice";
import { AccountId } from "../leash/AccountId";
import { useState } from "react";
import Link from "next/link";
import { useAccount } from "./AccountProvider";
import { useDefiState } from "@/hooks/useDefiState";
import { txLink } from "@/lib/defi/client";
import deployment from "@/lib/near/deployment.testnet.json";
import { Badge } from "../leash/Badge";
import { CustodyFacts } from "../leash/CustodyFacts";
import { GetTestTokens } from "../leash/GetTestTokens";
export function AccountControls() {
  const a = useAccount();
  const state = useDefiState(a.accountId);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="account-controls" aria-label="NEAR account and mode">
      <div className="la-row">
        <Badge variant="testnet" />
        <span className="leash-badge">
          {a.walletSession
            ? "Wallet · off-chain limit"
            : a.accountId
              ? "Guest · on-chain limits"
              : "Free practice account"}
        </span>
        <details className="display-options">
          <summary>Display</summary>
          <div className="la-row">
            <button
              className="detail-toggle"
              aria-pressed={a.advanced}
              onClick={() => a.setAdvanced(!a.advanced)}
            >
              {a.advanced ? "Advanced" : "Simple"}
            </button>
            <button
              className="detail-toggle"
              aria-label="Toggle light or dark theme"
              onClick={() => a.setTheme(a.theme === "dark" ? "light" : "dark")}
            >
              {a.theme === "dark" ? "Dark" : "Light"}
            </button>
            <button
              className="detail-toggle"
              aria-pressed={a.compact}
              onClick={() => a.setCompact(!a.compact)}
            >
              {a.compact ? "Compact" : "Comfortable"}
            </button>
          </div>
        </details>
      </div>
      <p>
        <strong>
          {a.accountId ? (
            <AccountId id={a.accountId} />
          ) : a.restoring ? (
            "Restoring session…"
          ) : (
            "Try Leash for free"
          )}
        </strong>
      </p>
      {!a.accountId && <CustodyFacts />}
      <div className="la-row">
        {!a.guest && !a.walletSession && (
          <button
            className="la-btn"
            disabled={a.restoring || busy}
            onClick={() => void run(a.setupGuest)}
          >
            Start free on testnet
          </button>
        )}
        {a.guest &&
          !a.walletSession &&
          state.state?.exists &&
          !state.guardInstalled && (
            <button
              className="la-btn"
              disabled={busy}
              onClick={() => void run(() => a.setupGuard(a.guest!))}
            >
              Install guard
            </button>
          )}
        {!a.walletSession ? (
          <button
            className="la-btn ghost"
            disabled={a.restoring || busy}
            onClick={() => void run(a.linkWallet)}
          >
            Connect wallet
          </button>
        ) : (
          <button
            className="la-btn ghost"
            disabled={busy}
            onClick={() => void run(a.unlinkWallet)}
          >
            Disconnect wallet
          </button>
        )}
        {a.accountId && <GetTestTokens />}
        <Link href="/guardrails" className="la-link">
          View limits ↗
        </Link>
      </div>
      {a.walletSession && a.walletWelcome && (
        <div className="wallet-faucet-banner" role="status">
          <span>New here? Get test tokens</span>
          <GetTestTokens compact />
          <button
            type="button"
            className="detail-toggle"
            aria-label="Dismiss test token reminder"
            onClick={() => a.setWalletWelcome(false)}
          >
            Dismiss
          </button>
        </div>
      )}
      {a.walletSession && (
        <p className="la-fineprint">You approve each action in your wallet.</p>
      )}
      {a.guest && !a.walletSession && (
        <details className="onboarding-details">
          <summary>Account details</summary>
          <ol className="onboarding-timeline" aria-label="Account onboarding">
            <li>
              Account created{" "}
              {a.guest.createdTx && (
                <a
                  href={txLink(a.guest.createdTx)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Transaction ↗
                </a>
              )}
            </li>
            <li>
              {state.guardInstalled || a.guest.guardTx
                ? "Guard installed"
                : "Guard installation pending"}{" "}
              · verified guard{" "}
              <a
                href={txLink(deployment.leash.guardGlobalTx)}
                target="_blank"
                rel="noreferrer"
              >
                Global deploy ↗
              </a>{" "}
              {a.guest.guardTx && (
                <a
                  href={txLink(a.guest.guardTx)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Install tx ↗
                </a>
              )}
            </li>
            <li>
              {state.agentKey || (a.guest.guardTx && !state.guardInstalled)
                ? "Limited agent key added"
                : state.guardInstalled
                  ? "Agent key revoked"
                  : "Limited key pending"}{" "}
              · limited permissions{" "}
              {a.guest.guardTx && (
                <a
                  href={txLink(a.guest.guardTx)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Key tx ↗
                </a>
              )}
            </li>
          </ol>
        </details>
      )}
      {a.onboarding && <p role="status">{a.onboarding}</p>}
      {(error || a.onboardingError || state.error) && (
        <ErrorNotice error={error || a.onboardingError || state.error} />
      )}
    </aside>
  );
}
