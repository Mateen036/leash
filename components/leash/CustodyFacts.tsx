"use client";
import { near, getDeployment } from "@/lib/near/config";
import { txLink } from "@/lib/defi/client";
export function CustodyFacts() {
  return (
    <details className="custody-facts">
      <summary>Who holds the keys?</summary>
      <p>
        {near.network === "mainnet"
          ? "Your connected wallet holds your keys. You approve each protocol transaction; wallet spending limits are checked off-chain."
          : "Your guest key stays in this browser. Keep its saved data to retain access. Connected wallets keep their own keys."}
      </p>
      <p>
        The agent can trade within your limits and return supplied tokens to
        your account. Only you can send assets elsewhere, change limits, or
        replace the guard.
      </p>
      <p>
        Revoke removes the agent’s access. Close open positions separately.
        Spending limits do not limit trading losses.
      </p>
      {getDeployment().leash.guardGlobalTx && (
        <a
          href={txLink(getDeployment().leash.guardGlobalTx)}
          target="_blank"
          rel="noreferrer"
        >
          View verified guard ↗
        </a>
      )}
    </details>
  );
}
