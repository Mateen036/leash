import deployment from "./deployment.testnet.json";

import mainnet from "./deployment.mainnet.json";
import { currentNetwork } from "./network";

export const getDeployment = () =>
  currentNetwork() === "mainnet" ? mainnet : deployment;
/** Lazy getters keep server configuration inside the current request's network scope. */
export const near = {
  get network() {
    return currentNetwork();
  },
  get rpcUrl() {
    return getDeployment().rpcUrl;
  },
  get explorer() {
    return getDeployment().explorer;
  },
  get root() {
    return getDeployment().root;
  },
  get token() {
    return getDeployment().tokenContract;
  },
  get tokenSymbol() {
    return getDeployment().tokenSymbol;
  },
  get tokenDecimals() {
    return getDeployment().tokenDecimals;
  },
  get relayer() {
    return getDeployment().relayerAccount;
  },
  get ref() {
    return getDeployment().refContract;
  },
  get wrap() {
    return getDeployment().wrapContract;
  },
  get pool() {
    return getDeployment().refPoolId;
  },
  get linear() {
    return currentNetwork() === "mainnet"
      ? "linear-protocol.near"
      : "linear-protocol.testnet";
  },
  get burrow() {
    return currentNetwork() === "mainnet"
      ? "contract.main.burrow.near"
      : "contract.burrow.testnet";
  },
  get orderlyVenue() {
    return currentNetwork() === "mainnet"
      ? "orderly-mainnet"
      : "orderly-testnet";
  },
  get orderlyApi() {
    return currentNetwork() === "mainnet"
      ? "https://api.orderly.org"
      : "https://testnet-api.orderly.org";
  },
  get chainId() {
    return currentNetwork() === "mainnet" ? 42161 : 421614;
  },
  get mpcContract() {
    return currentNetwork() === "mainnet"
      ? "v1.signer"
      : "v1.signer-prod.testnet";
  },
};

export const txUrl = (hash: string) => `${near.explorer}/txns/${hash}`;
export const accountUrl = (id: string) => `${near.explorer}/address/${id}`;

/** Token base units (6 decimals) <-> display strings, without floating point drift. */
export function toUnits(amount: string | number): string {
  const text = typeof amount === "number" ? amount.toFixed(6) : amount.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text))
    throw new Error("Use a positive amount with at most 6 decimals");
  const [whole, frac = ""] = text.split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, "0"))).toString();
}
export function fromUnits(units: string | bigint): string {
  const v = BigInt(units);
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${v / 1_000_000n}${frac ? "." + frac : ""}`;
}

/** Guest accounts are named sub-accounts of the relayer root, e.g. g-k3x9.leash-root.testnet. */
export function isGuestAccount(id: string) {
  return (
    near.network === "testnet" &&
    /^g-[a-z0-9]{4,20}\./.test(id) &&
    id.endsWith(`.${near.root}`)
  );
}
