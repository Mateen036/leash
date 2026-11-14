"use client";
import { TokenGlyph, PageHeader } from "./widget";

import styles from "./management.module.css";
import { PageFrame } from "../PageFrame";
import { Badge, type BadgeVariant } from "./Badge";
const protocols: {
  name: string;
  endpoint: string;
  network: string;
  badge: BadgeVariant;
  copy: string;
  url: string;
}[] = [
  {
    name: "Ref / Rhea DEX",
    endpoint: "Swaps and live quotes on Ref Finance",
    network: "NEAR testnet",
    badge: "testnet",
    copy: "Swap tokens with live quotes.",
    url: "https://guide.rhea.finance",
  },
  {
    name: "Rhea Lending (Burrow)",
    endpoint: "Supply and withdraw through Rhea Lending",
    network: "NEAR testnet",
    badge: "testnet",
    copy: "Supply tokens and withdraw to your account.",
    url: "https://guide.rhea.finance",
  },
  {
    name: "LiNEAR",
    endpoint: "Liquid staking through LiNEAR",
    network: "NEAR testnet",
    badge: "testnet",
    copy: "Stake NEAR and receive LiNEAR.",
    url: "https://linearprotocol.org",
  },
  {
    name: "Orderly testnet",
    endpoint: "Perpetual markets on Orderly",
    network: "Arbitrum Sepolia / Orderly EVM testnet",
    badge: "testnet",
    copy: "Trade testnet perps within your limits.",
    url: "https://orderly.network/docs",
  },
  {
    name: "NEAR Chain Signatures",
    endpoint: "NEAR signs for your trading account",
    network: "NEAR testnet",
    badge: "testnet",
    copy: "Connect your NEAR account to perps trading.",
    url: "https://docs.near.org/chain-abstraction/chain-signatures",
  },
  {
    name: "NEAR Intents 1Click",
    endpoint: "Cross-chain routes through NEAR Intents",
    network: "Mainnet API; no testnet execution",
    badge: "real-mainnet",
    copy: "Preview routes or bridge up to $25 with your wallet.",
    url: "https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api",
  },
  {
    name: "NEAR AI Cloud",
    endpoint: "AI planning with a backup planner",
    network: "NEAR AI Cloud API",
    badge: "read-only",
    copy: "Turns your request into an action to review.",
    url: "https://cloud.near.ai",
  },
  {
    name: "NEAR Connect",
    endpoint: "Wallet connection and transaction approval",
    network: "NEAR testnet + explicit mainnet bridge",
    badge: "testnet",
    copy: "Connect a wallet and approve your actions.",
    url: "https://github.com/azbang/near-connect",
  },
];
export function ProtocolsPage() {
  return (
    <PageFrame>
      <div className={styles.page}>
        <PageHeader
          eyebrow="LEASH / PROTOCOLS"
          title="Supported apps"
          description="The apps behind your trades, staking, and lending."
          badges={<Badge variant="testnet" />}
        />
        <div className={styles.protocolGrid}>
          {protocols.map((protocol) => (
            <article key={protocol.name} className={styles.protocolCard}>
              <div className={styles.protocolTop}>
                <TokenGlyph
                  token={{
                    id: protocol.name,
                    symbol: ["RF", "RH", "LN", "OR", "CS", "IN", "AI", "NC"][
                      protocols.indexOf(protocol)
                    ],
                  }}
                  size={40}
                />
                <Badge variant={protocol.badge}>
                  {protocol.badge === "testnet" ? "Testnet" : undefined}
                </Badge>
              </div>
              {protocol.network.includes("testnet") &&
                protocol.badge === "read-only" && <Badge variant="testnet" />}
              <h2>{protocol.name}</h2>
              <p>{protocol.copy}</p>
              <details className="widget-info">
                <summary>Details</summary>
                <dl>
                  <dt>How it works</dt>
                  <dd>
                    <span>{protocol.endpoint}</span>
                  </dd>
                  <dt>Network</dt>
                  <dd>{protocol.network}</dd>
                </dl>
              </details>
              <div className={styles.protocolFoot}>
                {protocol.name === "NEAR Intents 1Click" && (
                  <Badge variant="quote-only" />
                )}
                <a
                  className={styles.link}
                  href={protocol.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View app ↗
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
