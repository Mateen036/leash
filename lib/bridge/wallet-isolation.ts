import type { WalletManifest } from "@hot-labs/near-connect";
export const MAINNET_STORAGE_PREFIX = "leash-bridge-mainnet:";
/** NEAR Connect sandbox executors use manifest.id as their storage namespace (v0.12).
 * Scope that public manifest identifier as well as the connector's own storage keys.
 * Executor URLs, versions, permissions and features are preserved.
 */
export function isolateMainnetManifest(manifest: {
  wallets: WalletManifest[];
  version: string;
}) {
  return {
    ...manifest,
    wallets: manifest.wallets.map((w) => ({
      ...w,
      id: `leash-bridge-mainnet-${w.id}`,
    })),
  };
}
export async function loadMainnetManifest() {
  for (const url of [
    "https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json",
    "https://cdn.jsdelivr.net/gh/azbang/hot-connector/repository/manifest.json",
  ]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (Array.isArray(j.wallets) && typeof j.version === "string")
        return isolateMainnetManifest(j);
    } catch {
      /* try the package's alternate official source */
    }
  }
  throw new Error("NEAR Connect wallet manifest unavailable; reconnect later");
}
