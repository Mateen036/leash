"use client";
import { near } from "@/lib/near/config";
import { NETWORK_STORAGE_KEY } from "@/lib/near/network";

export function NetworkToggle() {
  const mainnet = near.network === "mainnet";
  return (
    <div className="network-selector">
      <button
        type="button"
        role="switch"
        aria-checked={mainnet}
        aria-label="Use mainnet"
        className={`network-toggle ${mainnet ? "is-mainnet" : ""}`}
        onClick={() => {
          localStorage.setItem(
            NETWORK_STORAGE_KEY,
            mainnet ? "testnet" : "mainnet",
          );
          window.location.reload();
        }}
      >
        <span aria-hidden="true" className="network-toggle-track">
          <span />
        </span>
        {mainnet ? "Mainnet" : "Testnet"}
      </button>
      {mainnet && <span className="network-real-money">Real funds</span>}
    </div>
  );
}
