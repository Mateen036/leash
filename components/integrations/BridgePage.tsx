"use client";
import { ErrorNotice } from "@/components/leash/ErrorNotice";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Globe2, ShieldCheck } from "lucide-react";
import { IntegrationProposal } from "../IntegrationProposal";
import type { BridgeQuote, IntentsToken } from "@/lib/near/intents";
import { integrationPost } from "@/lib/integration-client";
import { AccountControls } from "../account/AccountControls";
import { MainnetBridgePanel } from "../leash/MainnetBridgePanel";
import { Badge } from "../leash/Badge";
import { PageFrame } from "../PageFrame";
import {
  AmountPanel,
  FlipButton,
  PageHeader,
  PressableButton,
  QuoteSkeleton,
  RouteList,
  Tabs,
  TokenPicker,
  WidgetShell,
  type WidgetToken,
} from "../leash/widget";

export default function BridgePage() {
  const [mode, setMode] = useState("preview"),
    [source, setSource] = useState<"USDC" | "NEAR">("USDC");
  const [bridgeAmount, setBridgeAmount] = useState("20"),
    [tokens, setTokens] = useState<IntentsToken[]>([]);
  const [destination, setDestination] = useState(""),
    [chain, setChain] = useState("base");
  const [bridge, setBridge] = useState<BridgeQuote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [picker, setPicker] = useState<"source" | "destination" | null>(null);
  const revision = useRef(0);
  const closePicker = useCallback(() => {
    setPicker(null);
    setTimeout(
      () =>
        document
          .querySelector<HTMLButtonElement>(
            ".bridge-preview-widget .token-pill",
          )
          ?.focus(),
      180,
    );
  }, []);
  useEffect(() => {
    revision.current++;
    setBridge(null);
    setBusy(false);
  }, [source, bridgeAmount, destination]);
  useEffect(() => {
    try {
      if (localStorage.getItem("leash:mainnet-bridge:attempt:v1"))
        setMode("mainnet");
    } catch {
      /* Mainnet panel reports storage failures. */
    }
    let active = true;
    void fetch("/api/integrations/tokens")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        if (active) {
          setTokens(j.destinations);
          setDestination(
            j.destinations.find(
              (t: IntentsToken) =>
                t.blockchain === "base" && t.symbol === "USDC",
            )?.assetId ||
              j.destinations[0]?.assetId ||
              "",
          );
        }
      })
      .catch((e) => {
        if (active) setError(`Token catalog unavailable: ${e.message}`);
      });
    return () => {
      active = false;
    };
  }, []);
  async function quoteBridge() {
    const current = ++revision.current;
    setBusy(true);
    setError("");
    setBridge(null);
    try {
      const quote = await integrationPost<BridgeQuote>(
        "/api/integrations/bridge-quote",
        { source, amount: bridgeAmount, destinationAsset: destination },
      );
      if (current === revision.current) setBridge(quote);
    } catch (e) {
      if (current === revision.current) setError((e as Error).message);
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }
  const selected = tokens.find((t) => t.assetId === destination);
  const widgetToken = (t: IntentsToken): WidgetToken => ({
    id: t.assetId,
    symbol: t.symbol,
    name: `${t.symbol} on ${t.blockchain}`,
    chain: t.blockchain,
    logo: `/tokens/${t.symbol.toLowerCase()}.png`,
  });
  return (
    <PageFrame>
      <PageHeader
        eyebrow="LEASH / BRIDGE"
        title="Bridge tokens"
        description="Get a cross-chain quote or connect a mainnet wallet."
        badges={
          <Badge variant={mode === "preview" ? "quote-only" : "real-mainnet"} />
        }
      />
      <div className="bridge-mode">
        <Tabs
          tabs={[
            { value: "preview", label: "Preview route" },
            { value: "mainnet", label: "Mainnet wallet" },
          ]}
          value={mode}
          onChange={setMode}
          label="Bridge mode"
        />
      </div>
      <div hidden={mode !== "preview"} className="bridge-preview-widget">
        <WidgetShell
          title="Bridge preview"
          actions={<Globe2 size={17} color="var(--violet)" />}
          picker={
            picker && (
              <TokenPicker
                title={
                  picker === "source" ? "Send from NEAR" : "Select destination"
                }
                tokens={
                  picker === "source"
                    ? ["USDC", "NEAR"].map((symbol) => ({
                        id: symbol,
                        symbol,
                        chain: "near",
                      }))
                    : tokens.map(widgetToken)
                }
                selected={picker === "source" ? source : destination}
                chains={
                  picker === "destination"
                    ? [...new Set(tokens.map((t) => t.blockchain))]
                    : undefined
                }
                chain={picker === "destination" ? chain : undefined}
                onChainChange={setChain}
                onSelect={(t) => {
                  if (picker === "source") setSource(t.symbol as typeof source);
                  else {
                    setDestination(t.id);
                    setChain(t.chain || chain);
                  }
                  closePicker();
                }}
                onClose={closePicker}
                loading={picker === "destination" && !tokens.length && !error}
              />
            )
          }
          sidePanel={
            busy ? (
              <RouteList title="Finding your route">
                <QuoteSkeleton />
              </RouteList>
            ) : bridge ? (
              <RouteList title="Your Intents quote">
                <IntegrationProposal key={bridge.quotedAt} quote={bridge} />
              </RouteList>
            ) : undefined
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void quoteBridge();
            }}
          >
            <AmountPanel
              label="You send · NEAR mainnet"
              amount={bridgeAmount}
              onChange={setBridgeAmount}
              token={{ id: source, symbol: source, chain: "near" }}
              onTokenClick={() => setPicker("source")}
              subValue="Preview only · no funds move"
            />
            <FlipButton disabled label="Bridge preview is from NEAR only" />
            <AmountPanel
              label="Estimated receive"
              amount={bridge?.amountOut || ""}
              readOnly
              loading={busy}
              token={
                selected
                  ? widgetToken(selected)
                  : { id: "select", symbol: "Select", chain }
              }
              onTokenClick={() => setPicker("destination")}
              subValue={
                bridge?.amountOutUsd
                  ? `≈$${bridge.amountOutUsd} · live estimate`
                  : "Choose your destination chain and token"
              }
            />
            <PressableButton
              type="submit"
              disabled={busy || !destination || !Number(bridgeAmount)}
            >
              {busy ? "Requesting live quote…" : "Get quote"}
              <ArrowRight size={15} />
            </PressableButton>
          </form>
          <p className="widget-inline-note">
            <ShieldCheck size={13} />
            No funds move in preview mode.
          </p>
          <details className="widget-info">
            <summary>About this preview</summary>
            <p>
              Quotes use mainnet prices. To transfer real funds, switch to
              Mainnet wallet.
            </p>
          </details>
          {error && <ErrorNotice error={error} />}
        </WidgetShell>
      </div>
      <div hidden={mode !== "mainnet"}>
        <MainnetBridgePanel />
      </div>
      <div className="widget-support">
        <AccountControls />
      </div>
    </PageFrame>
  );
}
