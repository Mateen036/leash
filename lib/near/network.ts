/** Network selection is tab-local in the browser and request-local on the server. */
export type Network = "testnet" | "mainnet";
export const NETWORK_STORAGE_KEY = "leash:network:v1";
let browserNetwork: Network = "testnet";
let serverNetwork: () => Network | undefined = () => undefined;

export function setBrowserNetwork(network: Network) {
  browserNetwork = network;
}
/** Installed only by network-server.ts; never set a process-wide request value. */
export function registerNetworkReader(reader: () => Network | undefined) {
  serverNetwork = reader;
}
export function currentNetwork(): Network {
  return typeof window === "undefined"
    ? (serverNetwork() ?? "testnet")
    : browserNetwork;
}
export function networkKey(key: string) {
  // Keep existing testnet policies, daily spending and receipts across the upgrade.
  return currentNetwork() === "testnet" ? key : `${key}:mainnet`;
}
export class NetworkError extends Error {
  status = 403;
}
export function requireTestnet(feature: string) {
  if (currentNetwork() !== "testnet")
    throw new NetworkError(
      `${feature} is available only on testnet. Connect a funded mainnet wallet.`,
    );
}
/** Bind every app API request explicitly; external RPC and bridge URLs are unchanged. */
export function networkFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof input === "string" && input.startsWith("/api/")) {
    const headers = new Headers(init?.headers);
    headers.set("x-leash-network", currentNetwork());
    return fetch(input, { ...init, headers, cache: "no-store" });
  }
  return fetch(input, init);
}
