"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createGuest,
  forgetGuest,
  loadGuest,
  saveGuest,
  type Guest,
} from "@/lib/near/client";
import {
  connectWallet,
  disconnectWallet,
  restoreWallet,
  type WalletSession,
} from "@/lib/near/wallet";

import { installGuard } from "@/lib/defi/client";
import { refreshDefiState } from "@/hooks/useDefiState";

function useAccountSession() {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [walletSession, setWalletSession] = useState<WalletSession | null>(
    null,
  );
  const [walletWelcome, setWalletWelcome] = useState(false);
  const [onboarding, setOnboarding] = useState("");
  const [onboardingError, setOnboardingError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [compact, setCompact] = useState(false);
  const [displayLoaded, setDisplayLoaded] = useState(false);
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem("leash:display") || "{}");
      setAdvanced(value.advanced === true);
      setTheme(value.theme === "light" ? "light" : "dark");
      setCompact(value.compact === true);
    } catch {
      /* defaults */
    }
    setDisplayLoaded(true);
  }, []);
  useEffect(() => {
    if (!displayLoaded) return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = compact
      ? "compact"
      : "comfortable";
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(
      "leash:display",
      JSON.stringify({ advanced, theme, compact }),
    );
  }, [advanced, theme, compact, displayLoaded]);
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    let active = true;
    setGuest(loadGuest());
    void restoreWallet().then((session) => {
      if (active) {
        setWalletSession(session);
        setRestoring(false);
      }
    });
    const syncGuest = () => setGuest(loadGuest());
    window.addEventListener("storage", syncGuest);
    // Synchronize account changes from other parts of the app.
    window.addEventListener("leash:account", syncGuest);
    return () => {
      active = false;
      window.removeEventListener("storage", syncGuest);
      window.removeEventListener("leash:account", syncGuest);
    };
  }, []);
  async function setupGuard(session: Guest) {
    setOnboardingError("");
    setOnboarding("Setting up your spending limits…");
    try {
      // A freshly created account can briefly be unknown to the RPC node
      // (missing access key / rate limit). Retry transport errors, never
      // on-chain failures.
      let result: Awaited<ReturnType<typeof installGuard>> | undefined;
      for (let attempt = 0; ; attempt++) {
        try {
          result = await installGuard(session);
          break;
        } catch (err) {
          if (attempt >= 3) throw err;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!result.ok) throw new Error(`${result.error} · tx ${result.txHash}`);
      const updated = { ...session, guardTx: result.txHash };
      saveGuest(updated);
      setGuest(updated);
      await refreshDefiState(session.accountId);
      setOnboarding("Guard installed. Your agent is ready.");
      return updated;
    } catch (e) {
      setOnboarding("");
      setOnboardingError(String((e as Error).message));
      throw e;
    }
  }
  return {
    walletWelcome,
    setWalletWelcome,
    onboarding,
    onboardingError,
    setupGuard,
    advanced,
    setAdvanced,
    theme,
    setTheme,
    compact,
    setCompact,
    guest,
    walletSession,
    restoring,
    accountId: walletSession?.accountId ?? guest?.accountId ?? "",
    async setupGuest() {
      setOnboardingError("");
      setOnboarding("Creating your NEAR testnet account…");
      try {
        const session = await createGuest();
        setGuest(session);
        return await setupGuard(session);
      } catch (e) {
        setOnboarding("");
        setOnboardingError(String((e as Error).message));
        throw e;
      }
    },
    async linkWallet() {
      const session = await connectWallet();
      setWalletSession(session);
      setWalletWelcome(true);
      return session;
    },
    async unlinkWallet() {
      await disconnectWallet();
      setWalletSession(null);
    },
    signOutGuest() {
      forgetGuest();
      setGuest(null);
    },
  };
}
const AccountContext = createContext<ReturnType<
  typeof useAccountSession
> | null>(null);
export function AccountProvider({ children }: { children: ReactNode }) {
  const account = useAccountSession();
  return (
    <AccountContext.Provider value={account}>
      {children}
    </AccountContext.Provider>
  );
}
export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount requires AccountProvider");
  return account;
}
