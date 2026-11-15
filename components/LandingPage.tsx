"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowRightLeft,
  ChartNoAxesCombined,
  Landmark,
  Sprout,
  Globe2,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { LeashMascot } from "./leash/LeashMascot";
import { SiteNav, SiteFooter } from "./SiteChrome";
import { CardSpotlight } from "./ui/card-spotlight";
import { ShimmerButton } from "./ui/shimmer-button";
import { Badge, type BadgeVariant } from "./leash/Badge";
import { LeashSteps } from "./leash/LeashSteps";
const features: {
  href: string;
  title: string;
  icon: typeof Layers;
  copy: string;
  badge: BadgeVariant;
}[] = [
  {
    href: "/swap",
    title: "Swap",
    icon: ArrowRightLeft,
    copy: "Trade tokens with a live quote.",
    badge: "testnet",
  },
  {
    href: "/perps",
    title: "Perps",
    icon: ChartNoAxesCombined,
    copy: "Go long or short within your limits.",
    badge: "testnet",
  },
  {
    href: "/lend",
    title: "Lend",
    icon: Landmark,
    copy: "Supply tokens and earn a variable rate.",
    badge: "testnet",
  },
  {
    href: "/stake",
    title: "Stake",
    icon: Sprout,
    copy: "Stake NEAR and receive LiNEAR.",
    badge: "testnet",
  },
  {
    href: "/bridge",
    title: "Bridge",
    icon: Globe2,
    copy: "Preview a route. Mainnet transfers have a $25 cap.",
    badge: "real-mainnet",
  },
  {
    href: "/portfolio",
    title: "Portfolio",
    icon: Layers,
    copy: "See your balances and positions.",
    badge: "testnet",
  },
];
export default function LandingPage() {
  const router = useRouter();
  return (
    <MotionConfig reducedMotion="user">
      <div className="site-shell">
        <SiteNav />
        <main>
          <section className="hero leash-hero">
            <div className="hero-grid" />
            <div className="hero-copy">
              <span className="hero-eyebrow">
                <span /> LEASH / NEAR DEFI
              </span>
              <motion.h1 initial={false} animate={{ opacity: 1, y: 0 }}>
                Let your agent act.
                <br />
                <em>Keep the leash.</em>
              </motion.h1>
              <p className="hero-description">
                Trade, stake, and lend with an AI agent that follows your
                limits.
              </p>
              <div className="hero-actions">
                <ShimmerButton
                  onClick={() => router.push("/agent")}
                  background="#00ec97"
                  shimmerColor="#bba6ff"
                  className="leash-open"
                >
                  Open the agent <ArrowRight size={17} />
                </ShimmerButton>
                <Link className="hero-secondary" href="/guardrails">
                  See the guardrails <ArrowUpRight size={16} />
                </Link>
              </div>
              <div className="hero-disclosure">
                <Badge variant="testnet" />
                <span>Stake · lend · swap · on-chain limits</span>
              </div>
            </div>
            <LeashMascot />
          </section>
          <section className="leash-section" id="how">
            <span className="leash-eyebrow">AUTHORITY WITH AN EXPIRY DATE</span>
            <h2>How the leash works</h2>
            <p className="section-intro">
              Set limits. Preview each action. Stop the agent at any time.
            </p>
            <LeashSteps />
          </section>
          <section className="leash-section">
            <span className="leash-eyebrow">ONE WORKSPACE, CLEAR NETWORKS</span>
            <h2>What it can do</h2>
            <div className="leash-feature-grid">
              {features.map((feature) => (
                <CardSpotlight className="leash-feature" key={feature.title}>
                  <feature.icon size={25} />
                  <Badge variant={feature.badge} />
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                  <Link href={feature.href}>
                    Open {feature.title.toLowerCase()}{" "}
                    <ArrowUpRight size={15} />
                  </Link>
                </CardSpotlight>
              ))}
            </div>
          </section>
          <section className="leash-section leash-trust">
            <div>
              <span className="leash-eyebrow">TRUST NEEDS RECEIPTS</span>
              <h2>
                Know who holds
                <br />
                which key.
              </h2>
              <ShieldCheck size={44} />
            </div>
            <div className="trust-facts">
              <article>
                <h3>Your owner key stays yours</h3>
                <p>
                  Guest keys stay in your browser. Wallet keys stay in your
                  wallet.
                </p>
              </article>
              <article>
                <h3>Permission to act is bounded</h3>
                <p>
                  The agent trades within your limits. Only you can send funds
                  to another account.
                </p>
              </article>
              <article>
                <h3>See the cost. Keep an exit.</h3>
                <p>
                  Preview costs before confirming. Pause or revoke access any
                  time. Close open positions separately.
                </p>
              </article>
            </div>
          </section>
          <section className="leash-section">
            <span className="leash-eyebrow">COMPOSABLE BY DESIGN</span>
            <h2>Built on</h2>
            <div className="protocol-strip">
              {[
                "Ref / Rhea DEX",
                "Rhea Lending",
                "LiNEAR",
                "Orderly perps",
                "Chain Signatures",
                "NEAR Intents 1Click",
                "NEAR AI Cloud",
                "NEAR Connect",
              ].map((name) => (
                <Link href="/protocols" key={name}>
                  {name} <ArrowUpRight size={12} />
                </Link>
              ))}
            </div>
            <p className="section-intro">
              See supported networks and apps on the Protocols page.
            </p>
          </section>
          <section className="leash-section">
            <details className="widget-info">
              <summary>Networks and funds</summary>
              <p>
                Swap, stake, lend, and perps use test tokens with no cash value.
                Guest limits are enforced on-chain; connected wallets use
                off-chain limits and approve every action.
              </p>
              <p>
                Bridge previews are quote only. Mainnet transfers use real funds
                and your own wallet, with a $25 total cap.
              </p>
              <p>
                Spending limits do not cap losses on open positions. Perps test
                funds can take about 20 minutes to arrive.
              </p>
            </details>
          </section>
          <section className="leash-section leash-final">
            <h2>Start with a small action.</h2>
            <p>Try it free with test tokens.</p>
            <Link className="la-btn" href="/agent">
              Open the agent <ArrowRight size={16} />
            </Link>
          </section>
        </main>
        <SiteFooter />
      </div>
    </MotionConfig>
  );
}
