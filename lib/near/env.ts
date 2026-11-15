import { currentNetwork } from "./network";
export function networkEnv(name: string): string | undefined {
  const network = currentNetwork();
  return (
    process.env[`${network.toUpperCase()}_${name}`] ??
    (network === "testnet" ? process.env[name] : undefined)
  );
}
