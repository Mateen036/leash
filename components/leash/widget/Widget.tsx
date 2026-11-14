"use client";
import { ErrorNotice } from "../ErrorNotice";
import { formatAmount, plainText } from "../display";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { ChainIcon, TokenIcon } from "../TokenIcon";
import { CHAIN_NAMES, chainCode } from "../token-display";

export type WidgetToken = {
  logo?: string;
  id: string;
  symbol: string;
  name?: string;
  chain?: string;
  balance?: string;
  color?: string;
};
export type WidgetTab = { value: string; label: string };
export function Tabs({
  tabs,
  value,
  onChange,
  label = "Action",
}: {
  tabs: WidgetTab[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const id = useId(),
    reduced = useReducedMotion();
  return (
    <div className="widget-tabs" role="group" aria-label={label}>
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.value}
          aria-pressed={value === tab.value}
          onClick={() => onChange(tab.value)}
        >
          {value === tab.value && (
            <motion.span
              className="widget-tab-active"
              layoutId={`${id}-tab`}
              transition={{
                type: "spring",
                bounce: 0.15,
                duration: reduced ? 0 : 0.35,
              }}
            />
          )}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
export function WidgetShell({
  children,
  title,
  tabs,
  value,
  onTabChange,
  actions,
  sidePanel,
  picker,
  className = "",
}: {
  children: ReactNode;
  title?: string;
  tabs?: WidgetTab[];
  value?: string;
  onTabChange?: (value: string) => void;
  actions?: ReactNode;
  sidePanel?: ReactNode;
  picker?: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      className={`widget-layout ${sidePanel ? "widget-has-side" : ""} ${className}`}
    >
      <section className="widget-shell" aria-label={title || "DeFi widget"}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={picker ? "picker" : "ticket"}
            initial={reduced ? false : { opacity: 0, x: picker ? 12 : -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduced ? 0 : -8 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          >
            {picker || (
              <>
                <header className="widget-header">
                  {tabs && onTabChange ? (
                    <Tabs
                      tabs={tabs}
                      value={value || tabs[0]?.value}
                      onChange={onTabChange}
                    />
                  ) : (
                    <h2>{title}</h2>
                  )}
                  <div className="widget-header-actions">{actions}</div>
                </header>
                {children}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
      <AnimatePresence initial={false}>
        {sidePanel && (
          <motion.aside
            className="widget-side"
            initial={reduced ? false : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduced ? 0 : 12 }}
            transition={{ duration: reduced ? 0 : 0.25 }}
          >
            {sidePanel}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
export function TokenGlyph({
  token,
  size = 32,
}: {
  token: WidgetToken;
  size?: number;
}) {
  return <TokenIcon token={token} size={size} chainBadge={!!token.chain} />;
}
export function TokenPill({
  token,
  onClick,
  disabled,
}: {
  token: WidgetToken;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="token-pill"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Select token, ${token.symbol}${token.chain ? ` on ${token.chain}` : ""}`}
    >
      <TokenGlyph token={token} size={28} />
      <span>
        {token.symbol}
        {token.chain && <small>{token.chain}</small>}
      </span>
      {onClick && <ChevronDown size={13} />}
    </button>
  );
}
export function AmountPanel({
  label,
  amount,
  onChange,
  token,
  onTokenClick,
  balance,
  onMax,
  balanceAction,
  subValue,
  readOnly = false,
  loading = false,
  placeholder = "0",
  disabled = false,
}: {
  label: string;
  amount: string;
  onChange?: (value: string) => void;
  token: WidgetToken;
  onTokenClick?: () => void;
  balance?: string;
  onMax?: () => void;
  balanceAction?: ReactNode;
  subValue?: ReactNode;
  readOnly?: boolean;
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`amount-panel ${readOnly ? "amount-output" : ""}`}>
      <div className="amount-top">
        <label htmlFor={id}>{label}</label>
        {balance !== undefined && (
          <span>
            Balance: {plainText(balance)}
            {/[A-Za-z]/.test(balance) ? "" : ` ${token.symbol}`}{" "}
            {balanceAction}
            {onMax && (
              <button
                type="button"
                className="max-chip"
                onClick={onMax}
                disabled={disabled}
              >
                MAX
              </button>
            )}
          </span>
        )}
      </div>
      <div className="amount-main">
        {loading ? (
          <Skeleton width="46%" height={38} />
        ) : (
          <input
            id={id}
            aria-label={`${label} amount`}
            value={readOnly && amount ? formatAmount(amount) : amount}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            disabled={disabled}
            required={!readOnly}
          />
        )}
        <TokenPill token={token} onClick={onTokenClick} disabled={disabled} />
      </div>
      <div className="amount-sub">
        {subValue || (readOnly ? "Preview for a live estimate" : "Exact input")}
      </div>
    </div>
  );
}
export function FlipButton({
  onClick,
  label = "Reverse direction",
  disabled,
}: {
  onClick?: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const [turn, setTurn] = useState(0),
    reduced = useReducedMotion();
  return (
    <div className="flip-seam">
      <motion.button
        type="button"
        className="flip-button"
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setTurn((t) => t + 180);
          onClick?.();
        }}
        animate={{ rotate: reduced ? 0 : turn }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <ArrowDown size={17} />
      </motion.button>
    </div>
  );
}
export function TokenPicker({
  tokens,
  onSelect,
  onClose,
  selected,
  title = "Select token",
  chains,
  chain,
  onChainChange,
  loading = false,
}: {
  tokens: WidgetToken[];
  onSelect: (token: WidgetToken) => void;
  onClose: () => void;
  selected?: string;
  title?: string;
  chains?: string[];
  chain?: string;
  onChainChange?: (chain: string) => void;
  loading?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [chainSearch, setChainSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  const filtered = tokens.filter(
    (t) =>
      (!chain || !t.chain || t.chain === chain) &&
      `${t.symbol} ${t.name || ""} ${t.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="token-picker">
      <header className="widget-header">
        <button
          type="button"
          className="widget-icon-button"
          aria-label="Back to widget"
          onClick={onClose}
        >
          <ArrowLeft size={18} />
        </button>
        <h2>{title}</h2>
        <span />
      </header>
      <label className="picker-search">
        <Search size={17} />
        <input
          ref={input}
          aria-label="Search tokens"
          placeholder="Search token or address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {chains && (
        <div className="chain-picker">
          <label className="picker-search">
            <Search size={14} />
            <input
              aria-label="Search networks"
              placeholder="Search networks"
              value={chainSearch}
              onChange={(e) => setChainSearch(e.target.value)}
            />
          </label>
          <div className="chain-chips">
            {chains
              .filter((c) =>
                `${c} ${CHAIN_NAMES[chainCode(c) || c] || ""}`
                  .toLowerCase()
                  .includes(chainSearch.toLowerCase()),
              )
              .map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={c === chain}
                  onClick={() => onChainChange?.(c)}
                >
                  <ChainIcon chain={c} size={18} />
                  {CHAIN_NAMES[chainCode(c) || c] || c}
                </button>
              ))}
          </div>
        </div>
      )}
      <div className="token-rows">
        {loading ? (
          <QuoteSkeleton />
        ) : filtered.length ? (
          filtered.map((t) => (
            <button
              type="button"
              className="token-row"
              key={t.id}
              aria-pressed={selected === t.id}
              onClick={() => onSelect(t)}
            >
              <TokenGlyph token={t} size={36} />
              <span>
                <strong>{t.symbol}</strong>
                <small>{plainText(t.name || t.chain || t.symbol)}</small>
              </span>
              <span className="token-row-balance">
                {t.balance ? `${plainText(t.balance)} ${t.symbol}` : ""}
                {selected === t.id && <Check size={16} />}
              </span>
            </button>
          ))
        ) : (
          <EmptyState
            title="No tokens found"
            description="Try a symbol, address or another network."
          />
        )}
      </div>
      <p className="widget-footnote">Only supported assets are listed.</p>
    </div>
  );
}
export type QuoteMetric = {
  label: string;
  value: ReactNode;
  warning?: boolean;
  icon?: ReactNode;
};
export function RefreshRing({
  remaining,
  total = 60,
}: {
  remaining: number;
  total?: number;
}) {
  const fraction = Math.max(0, Math.min(1, remaining / Math.max(1, total)));
  return (
    <span
      className="refresh-ring"
      title={`${Math.max(0, Math.ceil(remaining))}s until quote expires`}
      aria-label={`${Math.max(0, Math.ceil(remaining))} seconds until quote expires`}
    >
      <svg width="25" height="25" viewBox="0 0 28 28" aria-hidden="true">
        <circle
          cx="14"
          cy="14"
          r="10"
          fill="none"
          stroke="currentColor"
          opacity=".15"
          strokeWidth="2"
        />
        <circle
          cx="14"
          cy="14"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="62.83"
          strokeDashoffset={62.83 * (1 - fraction)}
          transform="rotate(-90 14 14)"
        />
      </svg>
      <Clock3 size={10} />
    </span>
  );
}
export function QuoteCard({
  title,
  output,
  subtitle,
  tag,
  badges,
  metrics = [],
  steps,
  children,
  selected = true,
  onSelect,
  remaining,
  quoteDuration = 60,
  className = "",
  ariaLabel,
}: {
  ariaLabel?: string;
  title: string;
  output?: ReactNode;
  subtitle?: ReactNode;
  tag?: "Best rate" | "Fastest" | "Only route";
  badges?: ReactNode;
  metrics?: QuoteMetric[];
  steps?: ReactNode;
  children?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  remaining?: number;
  quoteDuration?: number;
  className?: string;
}) {
  const id = useId(),
    reduced = useReducedMotion();
  return (
    <article
      className={`quote-card ${selected ? "quote-selected" : ""} ${className}`}
      aria-label={ariaLabel || title}
    >
      {selected && (
        <motion.div
          className="quote-selection"
          layoutId={`${id}-selection`}
          transition={{ duration: reduced ? 0 : 0.2 }}
        />
      )}
      <div className="quote-top">
        <span className="quote-protocol">
          <ShieldCheck size={14} />
          {title}
        </span>
        {remaining !== undefined && (
          <RefreshRing remaining={remaining} total={quoteDuration} />
        )}
      </div>
      {(tag || badges) && (
        <div className="quote-badges">
          {tag && <span className="quote-tag">{tag}</span>}
          {badges}
        </div>
      )}
      {output && <div className="quote-output">{output}</div>}
      {subtitle && <div className="quote-subtitle">{subtitle}</div>}
      {!!metrics.length && (
        <dl className="quote-metrics">
          {metrics.map((m) => (
            <div key={m.label}>
              <dt>
                {m.icon || <span className="metric-dot" />}
                {m.label}
              </dt>
              <dd className={m.warning ? "impact-warning" : ""}>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {steps && (
        <details className="quote-steps">
          <summary>
            Details <ChevronDown size={13} />
          </summary>
          <div>{steps}</div>
        </details>
      )}
      {onSelect && (
        <PressableButton
          variant={selected ? "secondary" : "primary"}
          onClick={onSelect}
        >
          {selected ? "Selected route" : "Select route"}
        </PressableButton>
      )}
      {children}
    </article>
  );
}
export function RouteList({
  children,
  title = "Your route",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="route-list">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export type ExecutionStep = {
  label: string;
  detail?: ReactNode;
  status: "idle" | "pending" | "success" | "error";
  href?: string;
};
export function ExecutionTimeline({
  steps,
  success = false,
}: {
  steps: ExecutionStep[];
  success?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="execution-timeline" aria-live="polite">
      {success && (
        <motion.div
          className="execution-success"
          initial={reduced ? false : { opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", bounce: reduced ? 0 : 0.35 }}
        >
          <span>
            <Check size={21} />
          </span>
          <strong>Request complete</strong>
        </motion.div>
      )}
      <ol>
        {steps.map((step, i) => (
          <li key={`${i}-${step.label}`} data-status={step.status}>
            <span
              className={`execution-icon ${step.status === "pending" ? "execution-pending" : ""}`}
            >
              {step.status === "success" ? (
                <Check size={14} />
              ) : step.status === "error" ? (
                <X size={14} />
              ) : (
                <span>{i + 1}</span>
              )}
            </span>
            <div>
              <strong>{plainText(step.label)}</strong>
              {step.detail &&
                (step.status === "error" && typeof step.detail === "string" ? (
                  <ErrorNotice error={step.detail} />
                ) : (
                  <p>
                    {typeof step.detail === "string"
                      ? plainText(step.detail)
                      : step.detail}
                  </p>
                ))}
              {step.href && (
                <a href={step.href} target="_blank" rel="noreferrer">
                  {step.status === "error"
                    ? "Inspect rejection"
                    : "View transaction"}
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
export function Skeleton({
  width = "100%",
  height = 12,
  className = "",
}: {
  width?: string | number;
  height?: number;
  className?: string;
}) {
  return (
    <span
      className={`widget-skeleton ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
export function QuoteSkeleton() {
  return (
    <div
      className="quote-skeleton"
      role="status"
      aria-label="Loading live data"
    >
      <Skeleton width="40%" />
      <Skeleton height={34} width="70%" />
      <Skeleton width="55%" />
      <div>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
      <span className="sr-only">Loading live protocol data…</span>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="widget-empty">
      <span>{icon || <ShieldCheck size={23} />}</span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function PressableButton({
  children,
  className = "",
  variant = "primary",
  ...props
}: Omit<ComponentProps<typeof motion.button>, "ref"> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      {...props}
      tabIndex={props.disabled ? -1 : (props.tabIndex ?? 0)}
      className={`widget-button widget-button-${variant} ${className}`}
      whileHover={reduced || props.disabled ? undefined : { y: -2 }}
      whileTap={reduced || props.disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.button>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  badges,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badges?: ReactNode;
}) {
  return (
    <header className="widget-page-header">
      <span className="leash-eyebrow">{eyebrow}</span>
      <div>
        <h1>{title}</h1>
        {badges && <span className="widget-page-badges">{badges}</span>}
      </div>
      <p>{description}</p>
    </header>
  );
}
