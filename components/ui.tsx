"use client";
import { txUrl, accountUrl } from "@/lib/near/config";

export function Card({
  title,
  step,
  children,
}: {
  title: string;
  step?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card">
      <h2>
        {step && <span className="card-step">{step}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}
export function Btn({
  children,
  onClick,
  disabled,
  kind = "primary",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`la-btn ${kind === "primary" ? "" : kind}`}
    >
      {children}
    </button>
  );
}
export function Tx({ hash, label }: { hash?: string; label?: string }) {
  if (!hash) return null;
  return (
    <a
      className="text-xs text-[var(--green)]! underline"
      href={txUrl(hash)}
      target="_blank"
      rel="noreferrer"
    >
      {label || `tx ${hash.slice(0, 8)}…`} ↗
    </a>
  );
}
export function Acct({ id }: { id: string }) {
  return (
    <a
      className="font-mono text-xs underline break-all"
      href={accountUrl(id)}
      target="_blank"
      rel="noreferrer"
    >
      {id}
    </a>
  );
}
export function Status({ s }: { s: string }) {
  return <span className={`la-status ${s.toLowerCase()}`}>{s}</span>;
}
export const usd = (units: string | bigint) =>
  `$${(Number(units) / 1e6).toFixed(2)}`;
