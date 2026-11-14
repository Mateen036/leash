import type { Metadata } from "next";
import PerpsPage from "@/components/perps/PerpsPage";
export const metadata: Metadata = { title: "Perps — Leash" };
export default function Page() {
  return <PerpsPage />;
}
