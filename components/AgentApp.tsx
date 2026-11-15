"use client";
import { ErrorNotice } from "@/components/leash/ErrorNotice";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUp,
  ArrowUpRight,
  Bot,
  Check,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PageFrame } from "./PageFrame";
import { useAccount } from "./account/AccountProvider";
import { AccountControls } from "./account/AccountControls";
import { ActionPreview } from "./leash/ActionPreview";
import { ActivityFeed } from "./leash/ActivityFeed";
import { GuardrailRing } from "./leash/GuardrailRing";
import { Badge } from "./leash/Badge";
import { PageHeader, PressableButton, QuoteSkeleton } from "./leash/widget";
import { postJson } from "@/lib/defi/execution";
import { plainText } from "./leash/display";
import type { Plan } from "@/lib/agent/planner";
export const QUICK_ACTIONS = [
  "Stake 0.2 NEAR",
  "Supply 0.2 NEAR to Rhea",
  "Swap 0.05 NEAR to USDC",
  "Long ETH $30 at 3x",
  "Show my portfolio",
  "Prove the leash works",
];
export default function AgentApp({ initialAsk = "" }: { initialAsk?: string }) {
  const a = useAccount(),
    reduced = useReducedMotion();
  const [message, setMessage] = useState(initialAsk),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [chat, setChat] = useState<
    { prompt: string; plan: Plan; id: number }[]
  >([]);
  const end = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null),
    revision = useRef(0);
  useEffect(() => {
    setMessage(initialAsk);
  }, [initialAsk]);
  useEffect(() => {
    revision.current++;
    setChat([]);
    setBusy(false);
    setError("");
    setPendingPrompt("");
  }, [a.accountId, a.walletSession]);
  useEffect(() => {
    if (chat.length || busy)
      end.current?.scrollIntoView({
        behavior: reduced ? "instant" : "smooth",
        block: "nearest",
      });
  }, [chat, busy, reduced]);
  async function ask(text = message) {
    if (busy || text.trim().length < 2) return;
    const current = ++revision.current;
    setMessage("");
    setPendingPrompt(text);
    setBusy(true);
    setError("");
    try {
      const plan: Plan = await postJson("/api/agent", {
        message: text,
        accountId: a.accountId || undefined,
        walletMode: !!a.walletSession,
      });
      if (current === revision.current) {
        setChat((items) =>
          [...items, { prompt: text, plan, id: Date.now() }].slice(-8),
        );
        setPendingPrompt("");
      }
    } catch (e) {
      if (current === revision.current) {
        setError((e as Error).message);
        setMessage(text);
        setPendingPrompt("");
      }
    } finally {
      if (current === revision.current) {
        setBusy(false);
        input.current?.focus({ preventScroll: true });
      }
    }
  }
  return (
    <PageFrame>
      <PageHeader
        eyebrow="LEASH / AGENT"
        title="Your DeFi agent"
        description="Ask for a trade, then review and confirm."
        badges={<Badge variant="testnet" />}
      />
      <div className="agent-v2-layout">
        <section className="agent-glass" aria-label="Agent conversation">
          <header className="agent-glass-header">
            <span className="agent-avatar">
              <Bot size={20} />
            </span>
            <div>
              <strong>
                Leash agent <span className="agent-live-dot" />
              </strong>
              <small>Live quotes · your limits</small>
            </div>
            <GuardrailRing />
          </header>
          <div
            className="agent-conversation"
            role="log"
            aria-label="Conversation"
            aria-live="polite"
          >
            {!chat.length && !busy && (
              <div className="agent-welcome">
                <span className="welcome-spark">
                  <Sparkles size={25} />
                </span>
                <span className="leash-eyebrow">START HERE</span>
                <h2>What’s your next move?</h2>
                <p>Choose a suggestion or ask in your own words.</p>
                <div className="agent-suggestions">
                  {QUICK_ACTIONS.map((text, i) => (
                    <motion.button
                      key={text}
                      type="button"
                      tabIndex={0}
                      onClick={() => void ask(text)}
                      whileHover={reduced ? undefined : { y: -2 }}
                      whileTap={reduced ? undefined : { scale: 0.97 }}
                    >
                      <span>
                        {
                          [
                            "Stake",
                            "Lend",
                            "Swap",
                            "Perps",
                            "Portfolio",
                            "Guardrails",
                          ][i]
                        }
                      </span>
                      <strong>{text}</strong>
                      <ArrowUpRight size={14} />
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {chat.map((c) => (
                <motion.section
                  key={`${a.accountId}-${c.id}`}
                  className="agent-chat-turn"
                  initial={reduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : 0.25 }}
                >
                  <div className="agent-user-message">
                    <span>You</span>
                    <p>{c.prompt}</p>
                  </div>
                  <div className="agent-assistant-message">
                    <span className="agent-message-label">
                      <Bot size={14} /> Leash
                    </span>
                    <p>
                      {c.plan.proposals?.length
                        ? "Review your action below."
                        : plainText(c.plan.reply)}
                    </p>
                    {c.plan.proposals?.map((p, index) => (
                      <ActionPreview key={`${c.id}-${index}`} proposal={p} />
                    ))}
                    <details className="agent-source">
                      <summary>Details</summary>
                      <small>
                        <Check size={11} />
                        {c.plan.source === "near-ai"
                          ? "NEAR AI"
                          : "Built-in planner"}
                        {c.plan.fallback && " · Backup planner used"}
                      </small>
                    </details>
                  </div>
                </motion.section>
              ))}
            </AnimatePresence>
            {busy && (
              <div className="agent-chat-turn">
                <div className="agent-user-message">
                  <span>You</span>
                  <p>{pendingPrompt}</p>
                </div>
                <div className="agent-assistant-message">
                  <span className="agent-message-label">
                    <Bot size={14} />
                    Leash
                  </span>
                  <div className="agent-typing" role="status">
                    <span />
                    <span />
                    <span />
                    <small>Checking live quotes…</small>
                  </div>
                  <QuoteSkeleton />
                </div>
              </div>
            )}
            {error && <ErrorNotice error={error} />}
            <div ref={end} />
          </div>
          <form
            className="agent-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="sr-only" htmlFor="agent-message">
              Your request
            </label>
            <div>
              <textarea
                ref={input}
                id="agent-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                placeholder="Ask Leash to stake, swap, lend…"
                required
                rows={2}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void ask();
                  }
                }}
              />
              <PressableButton
                type="submit"
                aria-label="Ask the agent"
                disabled={busy || message.trim().length < 2}
              >
                <ArrowUp size={18} />
              </PressableButton>
            </div>
            <p>
              <ShieldCheck size={11} />
              {a.walletSession
                ? "Your wallet signs · off-chain limit"
                : "You confirm · your limits apply"}
              <span>{message.length}/500</span>
            </p>
          </form>
        </section>
        <aside className="agent-v2-side">
          <AccountControls />
          <div className="agent-small-step">
            <MessageSquare size={17} />
            <h3>Try one small step</h3>
            <p>Try “Stake 0.2 NEAR” to see a preview.</p>
            <details>
              <summary>What can the agent do?</summary>
              <p>
                Swap, stake, lend, or trade perps on your selected network.
                Bridge requests show quotes only.
              </p>
            </details>
          </div>
          <ActivityFeed />
        </aside>
      </div>
    </PageFrame>
  );
}
