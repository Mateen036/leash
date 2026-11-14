"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useAccount } from "../account/AccountProvider";
import { useDefiState } from "@/hooks/useDefiState";
import { walletPolicy, walletSpent } from "@/lib/defi/execution";
import type { GuardPolicy, GuardSpent } from "@/lib/near/guard";
import { defaultPolicy } from "@/lib/near/guard";
export function GuardrailRing() {
  const reduced = useReducedMotion();
  const a = useAccount(),
    d = useDefiState(a.accountId);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const [walletData, setWalletData] = useState<{
    policy: GuardPolicy;
    spent: GuardSpent;
  } | null>(null);
  useEffect(() => {
    if (!a.walletSession) {
      setWalletData(null);
      return;
    }
    const sync = () => {
      try {
        setWalletData({
          policy: walletPolicy(a.accountId),
          spent: walletSpent(a.accountId),
        });
      } catch {
        setWalletData({ policy: defaultPolicy(), spent: {} });
      }
    };
    sync();
    window.addEventListener("leash:activity", sync);
    return () => window.removeEventListener("leash:activity", sync);
  }, [a.accountId, a.walletSession, d.state]);
  const p = a.walletSession ? walletData?.policy : d.policy;
  const spending = a.walletSession ? walletData?.spent : d.spent;
  const cap = Number(p?.caps.near?.daily || 0) / 1e24;
  const per = Number(p?.caps.near?.per_action || 0) / 1e24;
  const spent =
    spending?.near?.day_index === Math.floor(now / 86400000)
      ? Number(spending.near.amount) / 1e24
      : 0;
  const ratio = cap ? Math.min(1, Math.max(0, (cap - spent) / cap)) : 0;
  return (
    <Link
      href="/guardrails"
      className="guardrail-ring"
      aria-label="NEAR daily spending and limits"
    >
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <circle
          cx="16"
          cy="16"
          r="12"
          fill="none"
          stroke="#30433f"
          strokeWidth="3"
        />
        <motion.circle
          initial={false}
          animate={{ strokeDasharray: `${ratio * 75.4} 75.4` }}
          transition={{ duration: reduced ? 0 : 0.5 }}
          cx="16"
          cy="16"
          r="12"
          fill="none"
          stroke="#00ec97"
          strokeWidth="3"
          transform="rotate(-90 16 16)"
        />
      </svg>
      <span>
        {p
          ? a.walletSession
            ? "Wallet · off-chain limit"
            : `${spent.toFixed(2)} / ${cap} NEAR today`
          : "Set up limits"}
        {p && (
          <small>
            {per} / action ·{" "}
            {!a.walletSession && d.guardInstalled && !d.agentKey
              ? "Revoked"
              : p.paused
                ? "Paused"
                : now && p.expires_at_ms <= now
                  ? "Expired"
                  : `expires in ${Math.max(0, Math.ceil((p.expires_at_ms - now) / 3600000))}h`}
          </small>
        )}
      </span>
    </Link>
  );
}
