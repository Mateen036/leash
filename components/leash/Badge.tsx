"use client";
import { near } from "@/lib/near/config";
import type { ReactNode } from "react";
export type BadgeVariant =
  "testnet" | "real-mainnet" | "quote-only" | "read-only" | "off-chain-limit";
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
  if (variant === "testnet" && near.network === "mainnet") {
    variant = "real-mainnet";
    if (typeof children === "string")
      children = children.replace(/testnet/gi, "Mainnet");
  }
  return (
    <span className={`leash-badge badge-${variant}`}>
      {children || labels[variant]}
    </span>
  );
}
