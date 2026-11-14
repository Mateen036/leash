"use client";
import { useState } from "react";
import { useAccount } from "../account/AccountProvider";
import { refreshDefiState } from "@/hooks/useDefiState";
import { updatePolicy, txLink } from "@/lib/defi/client";
import { getPolicy } from "@/lib/near/guard";
import { fromBase, type SwapToken } from "@/lib/defi/tokens";
import { saveReceipt } from "@/lib/defi/history";
import { withTokenCaps } from "./swap-model";
import { useToast } from "./widget";

export function EnableTokenLimits({
  tokens,
  onUpdated,
}: {
  tokens: SwapToken[];
  onUpdated: () => void;
}) {
  const { guest, walletSession, accountId } = useAccount();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toast = useToast();
  if (!guest || walletSession || !tokens.length) return null;
  async function enable() {
    if (busy || !guest) return;
    setBusy(true);
    setError("");
    try {
      const current = await getPolicy(accountId);
      const result = await updatePolicy(guest, withTokenCaps(current, tokens));
      saveReceipt(accountId, {
        id: result.txHash,
        at: Date.now(),
        headline: `Enable ${tokens.map((t) => t.symbol).join(", ")} limits`,
        ...result,
      });
      if (!result.ok) throw new Error("Policy update failed");
      toast({
        title: "Token limits updated",
        variant: "success",
        href: txLink(result.txHash),
      });
      onUpdated();
      await refreshDefiState(accountId);
    } catch {
      setError("Could not update your limits. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="token-limits-notice">
      <strong>
        Turn on {tokens.map((t) => t.symbol).join(", ")} in your limits
      </strong>
      <p>
        {tokens
          .map(
            (t) =>
              `${t.symbol}: ${fromBase(t.cap.per_action, t.decimals)} per action · ${fromBase(t.cap.daily, t.decimals)} daily`,
          )
          .join("; ")}
      </p>
      <p>Your browser owner key approves this update.</p>
      <button
        type="button"
        className="max-chip"
        disabled={busy}
        onClick={() => void enable()}
      >
        {busy ? "Updating limits…" : "Turn on tokens"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
