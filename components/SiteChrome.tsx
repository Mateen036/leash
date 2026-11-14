"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Hexagon, ShieldCheck, Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { GuardControls } from "./leash/GuardControls";
import { GuardrailRing } from "./leash/GuardrailRing";

export function Brand() {
  return (
    <Link className="site-brand" href="/" aria-label="Leash home">
      <span className="brand-symbol">
        <Hexagon size={23} strokeWidth={1.7} />
        <span />
      </span>
      <span>Leash</span>
    </Link>
  );
}

const navigation = [
  ["/agent", "Agent"],
  ["/portfolio", "Portfolio"],
  ["/swap", "Swap"],
  ["/perps", "Perps"],
  ["/lend", "Lend"],
  ["/stake", "Stake"],
  ["/bridge", "Bridge"],
  ["/guardrails", "Guardrails"],
  ["/protocols", "Protocols"],
] as const;
export function SiteNav({ actions }: { actions?: ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  const links = (mobile = false) =>
    navigation.map(([href, label]) => (
      <Link
        key={href}
        href={href}
        aria-current={pathname === href ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        {pathname === href && (
          <motion.span
            className="nav-active-pill"
            layoutId={mobile ? "mobile-nav-pill" : "desktop-nav-pill"}
            transition={{
              type: "spring",
              bounce: 0.12,
              duration: reduced ? 0 : 0.35,
            }}
          />
        )}
        {label}
      </Link>
    ));
  return (
    <header ref={header} className="site-nav">
      <div className="nav-identity">
        <Brand />
      </div>
      <div className="nav-safety">
        <GuardrailRing />
        <GuardControls compact />
      </div>
      <nav className="desktop-nav" aria-label="Main navigation">
        {links()}
        {actions}
      </nav>
      <button
        ref={toggle}
        className="mobile-menu-toggle"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.nav
            id="mobile-navigation"
            className="mobile-nav"
            aria-label="Mobile navigation"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
          >
            {links(true)}
            {actions}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Brand />
        <p>An AI DeFi agent on an on-chain leash.</p>
      </div>
      <div className="footer-notes">
        <span>
          <ShieldCheck size={14} /> NEAR Hackathon · agents + realworld
        </span>
        <p>Testnet by default. Mainnet bridge uses real funds.</p>
        <Link href="/protocols">Supported apps ↗</Link>
      </div>
    </footer>
  );
}
