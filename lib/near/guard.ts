import { rpcCall } from "./rpc";
import { actions, PublicKey, type Action as NearAction } from "near-api-js";
import { near, getDeployment } from "./config";
import { getSwapTokens } from "../defi/tokens";

export type GuardCap = { per_action: string; daily: string };
export type GuardPolicy = {
  allowed_protocols: string[];
  caps: Record<string, GuardCap>;
  max_slippage_bps: number;
  max_leverage_x100: number;
  max_perp_notional_usd: number;
  expires_at_ms: number;
  paused: boolean;
};
export type GuardAction =
  | {
      kind: "RefSwap";
      pool_id: number;
      token_in: string;
      token_out: string;
      amount_in: string;
      min_amount_out: string;
    }
  | {
      kind: "BurrowSupply";
      token: string;
      amount: string;
      as_collateral: boolean;
    }
  | { kind: "BurrowWithdraw"; token: string; amount: string }
  | { kind: "LinearStake"; amount: string }
  | { kind: "LinearUnstake"; amount: string };
export type PerpAuthorization = {
  venue: string;
  symbol: string;
  side: string;
  notional_usd: number;
  leverage_x100: number;
};
export type GuardActivity = {
  id: number;
  ts: number;
  kind: string;
  protocol: string;
  asset: string;
  amount: string;
  ok: boolean;
  reason: string;
  detail: string;
};
export type GuardSpent = Record<string, { day_index: number; amount: string }>;
export type GuardTransaction = { receiverId: string; actions: NearAction[] };
export const GUARD_AGENT_METHODS = ["agent_execute", "authorize_perp"] as const;
export const GUARD_GAS = 300_000_000_000_000n;
export const GUARD_ACTION_GAS = {
  RefSwap: GUARD_GAS,
  BurrowSupply: 220_000_000_000_000n,
  BurrowWithdraw: 150_000_000_000_000n,
  LinearStake: 80_000_000_000_000n,
  LinearUnstake: 80_000_000_000_000n,
} as const;
export const GUARD_KEY_ALLOWANCE = 500_000_000_000_000_000_000_000n;

/** Testnet base units: NEAR/wNEAR/LiNEAR 24 decimals; both fake USD tokens 6. */
export function defaultPolicy(nowMs = Date.now()): GuardPolicy {
  const nearCap = {
    per_action: "500000000000000000000000",
    daily: "1500000000000000000000000",
  };
  const usdCap = { per_action: "50000000", daily: "150000000" };
  return {
    allowed_protocols: [
      near.ref,
      near.burrow,
      near.linear,
      near.wrap,
      near.orderlyVenue,
    ],
    caps: {
      near: { ...nearCap },
      [near.wrap]: { ...nearCap },
      [near.linear]: { ...nearCap },
      ...(near.network === "testnet"
        ? {
            "usdtt.fakes.testnet": { ...usdCap },
            "usdc.fakes.testnet": { ...usdCap },
          }
        : {}),
      [near.token]: { ...usdCap },
      ...Object.fromEntries(
        getSwapTokens()
          .filter((t) => t.pool != null)
          .map((t) => [t.id, { ...t.cap }]),
      ),
      perp_usd: { per_action: "500", daily: "1500" },
    },
    max_slippage_bps: 100,
    max_leverage_x100: 500,
    max_perp_notional_usd: 500,
    expires_at_ms: nowMs + 7 * 86_400_000,
    paused: false,
  };
}

/** accountId is mandatory: an access-key receiver cannot be encoded as a relative "self".
 * Supply fallbackWasm only after a failed global installation, in an owner-signed retry.
 * The full-access owner signs this batch to receiverId=accountId. No secret is needed here.
 */
export function installGuardActions(
  agentPublicKey: string,
  policy: GuardPolicy,
  accountId: string,
  options: { codeHash?: string; fallbackWasm?: Uint8Array } = {},
): NearAction[] {
  if (!accountId) throw new Error("Guard accountId is required");
  const hash = options.codeHash ?? getDeployment().leash.guardCodeHash;
  if (!hash && !options.fallbackWasm)
    throw new Error("Publish a guard code hash first");
  const pk = PublicKey.fromString(agentPublicKey);
  return [
    options.fallbackWasm
      ? actions.deployContract(options.fallbackWasm)
      : actions.useGlobalContract({ codeHash: hash }),
    actions.functionCall(
      "init",
      { agent_pk: agentPublicKey, policy },
      30_000_000_000_000n,
      0n,
    ),
    actions.addFunctionCallAccessKey(
      pk,
      accountId,
      [...GUARD_AGENT_METHODS],
      GUARD_KEY_ALLOWANCE,
    ),
  ];
}
export function agentExecuteArgs(action: GuardAction): { action: GuardAction } {
  return { action };
}
export function authorizePerpArgs(
  authorization: PerpAuthorization,
): PerpAuthorization {
  return { ...authorization };
}
export function agentExecuteTransaction(
  accountId: string,
  action: GuardAction,
): GuardTransaction {
  return {
    receiverId: accountId,
    actions: [
      actions.functionCall(
        "agent_execute",
        agentExecuteArgs(action),
        GUARD_ACTION_GAS[action.kind],
        0n,
      ),
    ],
  };
}
export function authorizePerpTransaction(
  accountId: string,
  authorization: PerpAuthorization,
): GuardTransaction {
  return {
    receiverId: accountId,
    actions: [
      actions.functionCall(
        "authorize_perp",
        authorizePerpArgs(authorization),
        30_000_000_000_000n,
        0n,
      ),
    ],
  };
}
export function setPolicyTransaction(
  accountId: string,
  policy: GuardPolicy,
): GuardTransaction {
  return ownerTransaction(accountId, "set_policy", { policy });
}
export function pauseTransaction(accountId: string): GuardTransaction {
  return ownerTransaction(accountId, "pause");
}
export function unpauseTransaction(accountId: string): GuardTransaction {
  return ownerTransaction(accountId, "unpause");
}
export function revokeAgentTransaction(accountId: string): GuardTransaction {
  return ownerTransaction(accountId, "revoke_agent");
}
function ownerTransaction(
  accountId: string,
  method: string,
  args: object = {},
): GuardTransaction {
  return {
    receiverId: accountId,
    actions: [actions.functionCall(method, args, 30_000_000_000_000n, 0n)],
  };
}
async function guardView<T>(
  accountId: string,
  method: string,
  rpcUrl = near.rpcUrl,
): Promise<T> {
  const params = {
    request_type: "call_function",
    finality: "optimistic",
    account_id: accountId,
    method_name: method,
    args_base64: "e30=",
  };
  const data =
    rpcUrl === near.rpcUrl
      ? await rpcCall("query", params, 15_000)
      : await (async () => {
          const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "leash-guard",
              method: "query",
              params,
            }),
          });
          if (!response.ok)
            throw new Error(`Guard RPC HTTP ${response.status}`);
          return response.json();
        })();
  if (data.error || data.result?.error || !Array.isArray(data.result?.result))
    throw new Error(
      JSON.stringify(
        data.error ?? data.result?.error ?? "Invalid guard response",
      ),
    );
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(data.result.result)),
  ) as T;
}
export const getPolicy = (accountId: string, rpcUrl?: string) =>
  guardView<GuardPolicy>(accountId, "get_policy", rpcUrl);
export const getActivity = (accountId: string, rpcUrl?: string) =>
  guardView<GuardActivity[]>(accountId, "get_activity", rpcUrl);
export const getSpent = (accountId: string, rpcUrl?: string) =>
  guardView<GuardSpent>(accountId, "get_spent", rpcUrl);
export const getAgentKey = (accountId: string, rpcUrl?: string) =>
  guardView<string | null>(accountId, "get_agent_key", rpcUrl);
