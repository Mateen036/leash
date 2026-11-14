import type { ReactNode } from "react";
export type BadgeVariant =
  | "testnet"
  | "real-mainnet"
  | "quote-only"
  | "read-only"
  | "off-chain-limit";
const labels: Record<BadgeVariant, string> = {
  testnet: "Testnet",
  "real-mainnet": "Real money · mainnet",
  "quote-only": "Quote only",
  "read-only": "Read only",
  "off-chain-limit": "Off-chain limit",
};
export function Badge({
  variant,
  children,
}: {
  variant: BadgeVariant;
  children?: ReactNode;
}) {
  return (
    <span className={`leash-badge badge-${variant}`}>
      {children || labels[variant]}
    </span>
  );
}
