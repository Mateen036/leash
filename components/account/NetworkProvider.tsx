"use client";
import { useEffect, useState, type ReactNode } from "react";
import { NETWORK_STORAGE_KEY, setBrowserNetwork } from "@/lib/near/network";

/** Hydrate before mounting wallets or fetching balances. Switching reloads to discard old quotes. */
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setBrowserNetwork(
        localStorage.getItem(NETWORK_STORAGE_KEY) === "mainnet"
          ? "mainnet"
          : "testnet",
      );
    } catch {
      setBrowserNetwork("testnet");
    }
    setReady(true);
  }, []);
  if (!ready)
    return (
      <p className="la-fineprint" role="status">
        Loading Leash…
      </p>
    );
  return children;
}
