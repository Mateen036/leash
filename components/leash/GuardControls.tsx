"use client";
import { ErrorNotice } from "@/components/leash/ErrorNotice";
import { useState } from "react";
import { useAccount } from "../account/AccountProvider";
import { useDefiState } from "@/hooks/useDefiState";
import {
  pauseAgent,
  resumeAgent,
  revokeAgent,
  txLink,
} from "@/lib/defi/client";
import { ManagementDialog } from "./ManagementDialog";
import { PressableButton, useToast } from "./widget";
import { saveReceipt } from "@/lib/defi/history";
export function GuardControls({ compact = false }: { compact?: boolean }) {
  const { accountId, guest, walletSession } = useAccount();
  const d = useDefiState(accountId);
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<"pause" | "resume" | "revoke" | null>(
      null,
    ),
    [error, setError] = useState(""),
    [hash, setHash] = useState("");
  const toast = useToast();
  if (!d.guardInstalled || walletSession || !guest) return null;
  async function run(kind: "pause" | "resume" | "revoke") {
    setBusy(true);
    setConfirm(null);
    setError("");
    try {
      const r = await {
        pause: pauseAgent,
        resume: resumeAgent,
        revoke: revokeAgent,
      }[kind](guest!);
      setHash(r.txHash);
      saveReceipt(accountId, {
        id: r.txHash,
        at: Date.now(),
        headline: `${kind} agent`,
        ...r,
      });
      if (!r.ok) {
        setError(r.error || "Owner transaction failed");
        toast({
          title: "Control transaction failed",
          description: r.error || undefined,
          variant: "error",
          href: txLink(r.txHash),
        });
      } else
        toast({
          title:
            kind === "revoke"
              ? "Agent key revoked on-chain"
              : kind === "pause"
                ? "Agent paused on-chain"
                : "Agent resumed on-chain",
          variant: "success",
          href: txLink(r.txHash),
        });
      await d.refresh();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`guard-controls ${compact ? "compact" : ""}`}>
      <div className="la-row">
        <button
          disabled={busy || !d.agentKey}
          onClick={() => setConfirm(d.policy?.paused ? "resume" : "pause")}
        >
          {d.policy?.paused ? "Resume agent" : "Pause agent"}
        </button>
        <button
          className="revoke-link"
          disabled={busy || !d.agentKey}
          onClick={() => setConfirm("revoke")}
        >
          {d.agentKey ? "Revoke agent" : "Agent revoked"}
        </button>
      </div>
      {confirm && (
        <ManagementDialog
          title={
            confirm === "revoke"
              ? "Revoke agent access?"
              : confirm === "pause"
                ? "Pause new agent actions?"
                : "Resume the agent?"
          }
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm === "revoke"
              ? "Permanently remove this agent’s access. Pending actions may finish. Your funds and open positions stay in your account."
              : confirm === "pause"
                ? "Stop new actions once confirmed. Pending actions may finish; open positions stay open."
                : "Allow new actions within your current limits."}
          </p>
          <PressableButton
            variant={confirm === "resume" ? "primary" : "danger"}
            onClick={() => void run(confirm)}
          >
            {confirm === "revoke"
              ? "Delete agent key"
              : confirm === "pause"
                ? "Confirm pause"
                : "Confirm resume"}
          </PressableButton>
          <PressableButton variant="secondary" onClick={() => setConfirm(null)}>
            Cancel
          </PressableButton>
        </ManagementDialog>
      )}
      {busy && (
        <p role="status" style={{ fontSize: 11, marginTop: 12 }}>
          Confirming your change…
        </p>
      )}
      {hash && (
        <a
          className="la-link guard-receipt"
          href={txLink(hash)}
          target="_blank"
          rel="noreferrer"
        >
          Control transaction ↗
        </a>
      )}
      {error && <ErrorNotice error={error} />}
    </div>
  );
}
