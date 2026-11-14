import type { Metadata, Viewport } from "next";
import PageContent from "@/components/LandingPage";
export const metadata: Metadata = {
  title: "Leash — An AI DeFi agent on an on-chain leash.",
};
// Give the browser the hero's dark palette before the stylesheets arrive.
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#060a10",
};
export default function Page() {
  return <PageContent />;
}
