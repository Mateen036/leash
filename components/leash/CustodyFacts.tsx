import deployment from "@/lib/near/deployment.testnet.json";
import { txLink } from "@/lib/defi/client";
export function CustodyFacts() {
  return (
    <details className="custody-facts">
      <summary>Who holds the keys?</summary>
      <p>
        Your guest key stays in this browser. Keep its saved data to retain
        access. Connected wallets keep their own keys.
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
      <a
        href={txLink(deployment.leash.guardGlobalTx)}
        target="_blank"
        rel="noreferrer"
      >
        View verified guard ↗
      </a>
    </details>
  );
}
