import type { Metadata } from "next";
import { ProtocolsPage } from "@/components/leash/ProtocolsPage";
export const metadata: Metadata = { title: "Protocols — Leash" };
export default function Page() {
  return <ProtocolsPage />;
}
