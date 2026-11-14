"use client";
import { useEffect, useState } from "react";
import { useAccount } from "../account/AccountProvider";
import { useDefiState } from "@/hooks/useDefiState";
import { loadReceipts, type Receipt } from "@/lib/defi/history";
import { txLink } from "@/lib/defi/client";
import { TokenIcon } from "./TokenIcon";
import { tokenDisplay, tokensInText } from "./token-display";
import { fromBase } from "@/lib/defi/tokens";
import { ErrorNotice } from "./ErrorNotice";
import { plainText, protocolName, actionName } from "./display";
import { Badge } from "./Badge";
export function ActivityFeed() {
  const { accountId } = useAccount(),
    d = useDefiState(accountId);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  useEffect(() => {
    const sync = () => setReceipts(loadReceipts(accountId));
    sync();
    window.addEventListener("leash:activity", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("leash:activity", sync);
      window.removeEventListener("storage", sync);
    };
  }, [accountId]);
  return (
    <section className="leash-panel activity-feed">
      <Badge variant="testnet" />
      <h2>Activity</h2>
      <p className="la-fineprint">
        Your recent actions and transaction receipts.
      </p>
      {!receipts.length && !d.activity?.length && (
        <p>Your first action will appear here.</p>
      )}
      {receipts.map((r) => (
        <article key={r.id}>
          <div className="la-row">
            <span
              className={`leash-badge ${r.rejected ? "badge-rejected" : ""}`}
            >
              {r.rejected
                ? "Rejected on-chain"
                : r.ok
                  ? "Confirmed receipt"
                  : "Failed attempt"}
            </span>
            <time>{new Date(r.at).toLocaleString()}</time>
          </div>
          <strong className="activity-token-label">
            {tokensInText(r.headline).map((t) => (
              <TokenIcon key={t.symbol} token={t} size={22} />
            ))}
            {plainText(r.headline)}
          </strong>
          {r.error && <ErrorNotice error={r.error} />}
          {r.txHash && (
            <a href={txLink(r.txHash)} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          )}
          {r.orderId && <p>Orderly reference: {r.orderId}</p>}
        </article>
      ))}
      <details>
        <summary>On-chain guard log ({d.activity?.length || 0})</summary>
        {d.activity
          ?.slice()
          .reverse()
          .map((a) => (
            <article key={a.id}>
              <strong>
                {actionName(a.kind)}
                {a.ok ? ` · ${actionName(a.reason)}` : ""}
              </strong>
              {a.asset && a.asset !== "perp_usd" && (
                <p className="activity-token-label">
                  <TokenIcon token={tokenDisplay(a.asset)} size={22} />
                  {fromBase(a.amount, tokenDisplay(a.asset).decimals)}{" "}
                  {tokenDisplay(a.asset).symbol}
                </p>
              )}
              {!a.ok && <ErrorNotice error={a.reason} />}
              <p>
                {protocolName(a.protocol)} · {new Date(a.ts).toLocaleString()}
              </p>
              <a
                href={`https://testnet.nearblocks.io/address/${accountId}`}
                target="_blank"
                rel="noreferrer"
              >
                Account transactions ↗
              </a>
            </article>
          ))}
      </details>
    </section>
  );
}
