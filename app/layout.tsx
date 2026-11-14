import type { Metadata } from "next";
import { AccountProvider } from "@/components/account/AccountProvider";
import "./globals.css";
import "./leash-base.css";
import "./integrations.css";
import "./agent-map.css";
import "./routes.css";
import "./leash.css";
import "./widget.css";
import { ToastProvider } from "@/components/leash/widget/ToastProvider";
export const metadata: Metadata = {
  title: "Leash — An AI DeFi agent on an on-chain leash.",
  description:
    "An AI DeFi agent on an on-chain leash. Preview actions, inspect limits, and stay in control on NEAR.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <AccountProvider>
          <ToastProvider>{children}</ToastProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
