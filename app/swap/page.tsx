import type { Metadata } from "next";
import { DefiWorkspace } from "@/components/leash/DefiWorkspace";
export const metadata: Metadata = { title: "Swap — Leash" };
export default function Page() {
  return <DefiWorkspace kind="swap" />;
}
