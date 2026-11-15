"use client";
import { near } from "@/lib/near/config";
import { protocolName, formatAmount, assetLabel } from "./display";
import { ErrorNotice } from "@/components/leash/ErrorNotice";
import { useState } from "react";
import { PageFrame } from "../PageFrame";
import { AccountControls } from "../account/AccountControls";
import { useAccount } from "../account/AccountProvider";
import { useDefiState } from "@/hooks/useDefiState";
import { defaultPolicy, type GuardPolicy } from "@/lib/near/guard";
import { updatePolicy, txLink } from "@/lib/defi/client";
import { assetInfo, type Proposal } from "@/lib/defi/preview";
import { fromBase, toBase } from "@/lib/defi/tokens";
import { postJson } from "@/lib/defi/execution";
import { saveReceipt } from "@/lib/defi/history";
import { GuardrailRing } from "./GuardrailRing";
import { GuardControls } from "./GuardControls";
import { CustodyFacts } from "./CustodyFacts";
import { ActionPreview } from "./ActionPreview";
import { ActivityFeed } from "./ActivityFeed";
import { Badge } from "./Badge";
import { motion, useReducedMotion } from "motion/react";
import { ShieldCheck, OctagonAlert, Timer } from "lucide-react";
import {
  PageHeader,
  PressableButton,
  TokenGlyph,
  QuoteSkeleton,
  NumberTicker,
  useToast,
} from "./widget";
import { ManagementDialog } from "./ManagementDialog";
import styles from "./management.module.css";

function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  inputStep = step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  step?: number;
  inputStep?: number;
}) {
  const change = (v: number) =>
    onChange(Math.min(max, Math.max(min, Number(v.toFixed(4)))));
  return (
    <label>
      {label}
      <span className={styles.stepper}>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => change(value - step)}
          disabled={value <= min}
        >
          −
        </button>
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={inputStep}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => change(value + step)}
          disabled={value >= max}
        >
          +
        </button>
      </span>
    </label>
  );
}
function PolicyEditor({ initial }: { initial: GuardPolicy }) {
  const a = useAccount(),
    d = useDefiState(a.accountId);
  const toast = useToast();
  const [policy, setPolicy] = useState<GuardPolicy>(() =>
    structuredClone(initial),
  );
  const [error, setError] = useState(""),
    [hash, setHash] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Proposal | null>(null);
  const [caps, setCaps] = useState(() =>
    Object.fromEntries(
      Object.entries(initial.caps).map(([asset, c]) => [
        asset,
        {
          per_action: fromBase(c.per_action, assetInfo(asset).decimals, 24),
          daily: fromBase(c.daily, assetInfo(asset).decimals, 24),
        },
      ]),
    ),
  );
  function prepare() {
    setError("");
    try {
      const parsed = Object.fromEntries(
        Object.entries(caps).map(([asset, c]) => {
          const per_action = toBase(c.per_action, assetInfo(asset).decimals),
            daily = toBase(c.daily, assetInfo(asset).decimals);
          if (BigInt(per_action) <= 0n || BigInt(daily) < BigInt(per_action))
            throw new Error(
              `Daily cap must cover a positive per-action cap: ${asset}`,
            );
          return [asset, { per_action, daily }];
        }),
      );
      if (
        policy.expires_at_ms <= Date.now() ||
        !Number.isFinite(policy.expires_at_ms)
      )
        throw new Error("Choose a future expiry");
      const next = {
        ...policy,
        caps: parsed,
        paused: d.policy?.paused ?? policy.paused,
      };
      setPolicy(next);
      setPreview({
        action: { kind: "explain", topic: "set_policy" },
        raw: { method: "set_policy", args: { policy: next } },
        headline: "Update your agent's on-chain limits",
        deltas: ["You approve the new limits"],
        protocol: "Leash guard",
        contract: a.accountId,
        because: "Because only your owner key can change these boundaries.",
        network: near.network,
        quotedAt: Date.now(),
        sources: [{ name: "Current on-chain limits", at: Date.now() }],
        limit: "Owner authorization required",
        facts: [
          {
            label: "NEAR caps",
            value: `${caps.near.per_action} per action / ${caps.near.daily} per day`,
          },
          {
            label: "Slippage / leverage / perp size",
            value: `${next.max_slippage_bps / 100}% / ${next.max_leverage_x100 / 100}x / $${next.max_perp_notional_usd}`,
          },
          {
            label: "Expiry",
            value: new Date(next.expires_at_ms).toLocaleString(),
          },
        ],
      });
    } catch (e) {
      setError(String((e as Error).message));
    }
  }
  async function save() {
    if (!a.guest || a.walletSession) return;
    setBusy(true);
    setError("");
    try {
      const r = await updatePolicy(a.guest, policy);
      setHash(r.txHash);
      saveReceipt(a.accountId, {
        id: r.txHash,
        at: Date.now(),
        headline: "Update on-chain policy",
        ...r,
      });
      if (!r.ok) throw new Error(r.error || "Policy update failed");
      setPreview(null);
      toast({
        title: "Guard limits updated",
        variant: "success",
        href: txLink(r.txHash),
      });
      await d.refresh();
    } catch (e) {
      setError(String((e as Error).message));
      toast({
        title: "Policy update stopped",
        description: (e as Error).message,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="leash-panel policy-editor">
      <h2>{a.walletSession ? "Wallet limits" : "Edit your limits"}</h2>
      {a.walletSession && (
        <Badge variant="off-chain-limit">Off-chain limit (wallet mode)</Badge>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          prepare();
        }}
        onChange={() => setPreview(null)}
      >
        <fieldset disabled={!!a.walletSession || busy}>
          <p className={styles.fineprint}>Only you can change these limits.</p>
          <div className={styles.capGrid}>
            {Object.entries(caps).map(([asset, c]) => (
              <div className={styles.capCard} key={asset}>
                <strong title={asset}>
                  <TokenGlyph
                    token={{ id: asset, symbol: assetInfo(asset).symbol }}
                    size={26}
                  />
                  {assetLabel(
                    asset === "perp_usd" ? asset : assetInfo(asset).symbol,
                  )}
                </strong>
                <div>
                  {(["per_action", "daily"] as const).map((k) => (
                    <label key={k}>
                      {k === "per_action" ? "Per action" : "Daily cap"}
                      <input
                        aria-label={`${asset} ${k}`}
                        inputMode="decimal"
                        required
                        value={c[k]}
                        onChange={(e) =>
                          setCaps((old) => ({
                            ...old,
                            [asset]: { ...old[asset], [k]: e.target.value },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.policyFields}>
            <Stepper
              label="Max slippage (%)"
              value={policy.max_slippage_bps / 100}
              min={0}
              max={100}
              step={0.1}
              inputStep={0.01}
              onChange={(v) => {
                setPreview(null);
                setPolicy({ ...policy, max_slippage_bps: Math.round(v * 100) });
              }}
            />
            <Stepper
              label="Max leverage"
              value={policy.max_leverage_x100 / 100}
              min={1}
              max={50}
              step={1}
              inputStep={0.01}
              onChange={(v) => {
                setPreview(null);
                setPolicy({
                  ...policy,
                  max_leverage_x100: Math.round(v * 100),
                });
              }}
            />
            <Stepper
              label="Max position size ($)"
              value={policy.max_perp_notional_usd}
              min={1}
              max={100000}
              step={50}
              inputStep={1}
              onChange={(v) => {
                setPreview(null);
                setPolicy({ ...policy, max_perp_notional_usd: v });
              }}
            />
            <label>
              Expiry (UTC)
              <input
                type="datetime-local"
                required
                value={
                  Number.isFinite(policy.expires_at_ms)
                    ? new Date(policy.expires_at_ms).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    expires_at_ms: new Date(e.target.value + "Z").getTime(),
                  })
                }
              />
            </label>
          </div>
          <details>
            <summary>Allowed protocols</summary>
            {defaultPolicy().allowed_protocols.map((id) => (
              <label className="checkbox-label" key={id}>
                <input
                  type="checkbox"
                  checked={policy.allowed_protocols.includes(id)}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      allowed_protocols: e.target.checked
                        ? [...policy.allowed_protocols, id]
                        : policy.allowed_protocols.filter((v) => v !== id),
                    })
                  }
                />
                {protocolName(id)}
              </label>
            ))}
          </details>
          <PressableButton type="submit">
            Review policy changes <ShieldCheck size={15} />
          </PressableButton>
        </fieldset>
      </form>
      {preview && (
        <ActionPreview proposal={preview}>
          <button
            className="find-route-button"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Signing with owner key…" : "Confirm policy · owner signs"}
          </button>
        </ActionPreview>
      )}
      {hash && (
        <p>
          <a href={txLink(hash)} target="_blank" rel="noreferrer">
            Policy transaction ↗
          </a>
        </p>
      )}
      {error && <ErrorNotice error={error} />}
    </section>
  );
}
export function GuardrailsPage() {
  const a = useAccount(),
    d = useDefiState(a.accountId);
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function propose(kind: "stake" | "close_all") {
    setBusy(true);
    setError("");
    try {
      const r = await postJson("/api/agent", {
        action: kind === "stake" ? { kind, amount: "0.9" } : { kind },
        accountId: a.accountId,
        walletMode: !!a.walletSession,
      });
      setProposal(r.proposals[0]);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const p = a.walletSession ? defaultPolicy() : d.policy;
  const reduced = useReducedMotion();
  const [confirmClose, setConfirmClose] = useState(false);
  const nearPer = Number(p?.caps.near?.per_action || 0) / 1e24;
  const nearDaily = Number(p?.caps.near?.daily || 0) / 1e24;
  return (
    <PageFrame>
      <div className={styles.page}>
        <PageHeader
          eyebrow="LEASH / GUARDRAILS"
          title="Your guardrails"
          description="Set spending limits and control your agent’s access."
          badges={
            <>
              <Badge variant="testnet" />
              {a.walletSession && <Badge variant="off-chain-limit" />}
            </>
          }
        />
        <div className={styles.guardOverview}>
          <section className="leash-panel">
            <div className={styles.sectionHead}>
              <h2>
                <ShieldCheck size={17} /> Your leash
              </h2>
              <Badge variant={p?.paused ? "read-only" : "testnet"}>
                {p
                  ? !a.walletSession && d.guardInstalled && !d.agentKey
                    ? "Revoked"
                    : p.paused
                      ? "Paused"
                      : d.agentKey
                        ? "Active"
                        : a.walletSession
                          ? "Wallet signs"
                          : "Revoked"
                  : "Setup required"}
              </Badge>
            </div>
            <div className={styles.guardHero}>
              <GuardrailRing />
            </div>
            <div className={styles.limitGrid}>
              {[
                {
                  label: "NEAR per action",
                  value: nearPer,
                  detail: "Maximum for one action",
                  ratio: nearDaily ? Math.min(1, nearPer / nearDaily) : 0,
                },
                {
                  label: "NEAR daily cap",
                  value: nearDaily,
                  detail: "Resets at 00:00 UTC",
                  ratio: p ? 1 : 0,
                },
              ].map((c) => (
                <div className={styles.limitCard} key={c.label}>
                  <span>{c.label}</span>
                  <strong>
                    {p ? (
                      <NumberTicker
                        className={styles.ticker}
                        value={c.value}
                        decimalPlaces={2}
                      />
                    ) : (
                      "—"
                    )}
                  </strong>
                  <div className={styles.meter}>
                    <motion.div
                      initial={false}
                      animate={{ width: `${c.ratio * 100}%` }}
                      transition={{ duration: reduced ? 0 : 0.5 }}
                    />
                  </div>
                  <small>{c.detail}</small>
                </div>
              ))}
            </div>
            <p className={styles.fineprint}>
              <Timer size={12} style={{ display: "inline", marginRight: 6 }} />
              {p
                ? `Policy expires ${new Date(p.expires_at_ms).toLocaleString()}`
                : "Start free below to set your limits."}
            </p>
            {p && (
              <p className={styles.fineprint}>
                Slippage ≤ {p.max_slippage_bps / 100}% · Leverage ≤{" "}
                {p.max_leverage_x100 / 100}x · Perp exposure ≤ $
                {formatAmount(p.max_perp_notional_usd)}
              </p>
            )}
          </section>
          <section className={`leash-panel ${styles.dangerZone}`}>
            <div className={styles.sectionHead}>
              <h2>
                <OctagonAlert size={17} /> Agent controls
              </h2>
              <span>OWNER AUTHORITY</span>
            </div>
            <p>
              Pause stops new actions. Revoke removes access. Positions stay
              open.
            </p>
            <GuardControls />
            {!d.guardInstalled && !a.walletSession && (
              <p>Install a guard to enable Pause and Revoke.</p>
            )}
            {a.walletSession && <p>You approve each action in your wallet.</p>}
            <div
              style={{
                borderTop: "1px solid #d08d9929",
                paddingTop: 12,
                marginTop: 18,
              }}
            >
              <h3 style={{ fontSize: 13 }}>Close positions</h3>
              <p>Close all open perps at the available market price.</p>
              <PressableButton
                variant="danger"
                disabled={!a.accountId || busy}
                onClick={() => setConfirmClose(true)}
              >
                {busy ? "Preparing preview…" : "Close all perps"}
              </PressableButton>
            </div>
          </section>
        </div>
        {a.accountId && <CustodyFacts />}
        <AccountControls />
        {!!a.accountId && !d.state && !d.error && <QuoteSkeleton />}
        {confirmClose && (
          <ManagementDialog
            title="Review closing all positions?"
            onClose={() => setConfirmClose(false)}
          >
            <p>
              Review the open positions before closing. Final prices and fees
              depend on the market.
            </p>
            <PressableButton
              variant="danger"
              onClick={() => {
                setConfirmClose(false);
                void propose("close_all");
              }}
            >
              Prepare close-all preview
            </PressableButton>
            <PressableButton
              variant="secondary"
              onClick={() => setConfirmClose(false)}
            >
              Keep positions open
            </PressableButton>
          </ManagementDialog>
        )}
        {p && (
          <PolicyEditor
            key={a.accountId + (a.walletSession ? "wallet" : "guest")}
            initial={p}
          />
        )}
        <section className={`leash-panel ${styles.proof}`}>
          <span className="leash-eyebrow">TRY YOUR LIMITS</span>
          <h2>Prove the leash works.</h2>
          <p>
            Try staking 0.9 NEAR above the default 0.5 NEAR limit. The guard
            blocks it; a network fee applies.
          </p>
          <button
            className="revoke-link"
            disabled={
              !d.agentKey ||
              !!a.walletSession ||
              busy ||
              Number(p?.caps.near?.per_action || 0) >= 9e23
            }
            onClick={() => void propose("stake")}
          >
            Prove it
          </button>
          {!d.agentKey && (
            <p className="la-fineprint">An active guarded guest is required.</p>
          )}
          {Number(p?.caps.near?.per_action || 0) >= 9e23 && (
            <p>
              Set a per-action cap below 0.9 NEAR to demonstrate a rejection.
            </p>
          )}
        </section>
        {error && <ErrorNotice error={error} />}
        {proposal && (
          <ActionPreview
            key={`${a.accountId}-${proposal.quotedAt}`}
            proposal={proposal}
          />
        )}
        <ActivityFeed />
      </div>
    </PageFrame>
  );
}
