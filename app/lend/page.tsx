import type { Metadata } from "next";
import { DefiWorkspace } from "@/components/leash/DefiWorkspace";
export const metadata: Metadata = { title: "Lend — Leash" };
export default function Page() {
  return <DefiWorkspace kind="lend" />;
}
