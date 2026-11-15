import { networkEnv } from "@/lib/near/env";
import { Account, JsonRpcProvider, base64Decode } from "near-api-js";
import { near, isGuestAccount } from "@/lib/near/config";
import { NearError, verifyAccountSignature } from "@/lib/near/server";
import {
  agentExecuteTransaction,
  authorizePerpTransaction,
  getActivity,
  getPolicy,
  getSpent,
  getAgentKey,
  type GuardAction,
  type PerpAuthorization,
  type GuardPolicy,
  type GuardSpent,
} from "@/lib/near/guard";
import { failoverProvider, rpcCall, withRpcRetry } from "@/lib/near/rpc";
import { getSwapTokens, TOKENS, poolFor } from "./tokens";

const rpc = () => networkEnv("NEAR_RPC_URL") || near.rpcUrl;
const provider = () => failoverProvider();

/** Read-only contract call with RPC failover; contract errors are thrown as-is. */
export async function view<T>(
  contractId: string,
  method: string,
  args: object = {},
): Promise<T> {
  const d = await rpcCall(
    "query",
    {
      request_type: "call_function",
      finality: "optimistic",
      account_id: contractId,
      method_name: method,
      args_base64: btoa(JSON.stringify(args)),
    },
    15_000,
  );
  if (d.error || d.result?.error || !Array.isArray(d.result?.result))
    throw new Error(
      String(d.result?.error || d.error?.cause?.name || "view failed"),
    );
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(d.result.result)),
  ) as T;
}
async function viewAccount(accountId: string) {
  const d = await rpcCall("query", {
    request_type: "view_account",
    finality: "optimistic",
    account_id: accountId,
  });
  if (d.error || d.result?.error) return null;
  return d.result as {
    amount: string;
    locked: string;
    storage_usage: number;
    code_hash: string;
    global_contract_hash?: string;
  };
}

function failureOf(result: any): string | null {
  const all = [
    result?.status,
    ...(result?.receipts_outcome || []).map((o: any) => o.outcome?.status),
  ];
  for (const s of all)
    if (s && typeof s === "object" && "Failure" in s) {
      const text = JSON.stringify(s.Failure);
      const m =
        text.match(/Smart contract panicked: ([A-Z_]+[^"\\]*)/) ||
        text.match(/panicked: ([^"\\]+)/);
      return (m ? m[1] : text).slice(0, 300);
    }
  return null;
}
function agentAccount(accountId: string) {
  const key = networkEnv("AGENT_GUARD_PRIVATE_KEY");
  if (!key)
    throw new NearError("Server is missing AGENT_GUARD_PRIVATE_KEY", 503);
  return new Account(accountId, provider(), key as `ed25519:${string}`);
}
export type ExecResult = {
  ok: boolean;
  txHash: string;
  error: string | null;
  value?: unknown;
};

async function sendAsAgent(
  accountId: string,
  tx: { receiverId: string; actions: any[] },
): Promise<ExecResult> {
  if (!isGuestAccount(accountId))
    throw new NearError(
      "Autonomous mode is for Leash guest accounts; wallet users sign in their wallet",
      403,
    );
  try {
    const r: any = await withRpcRetry(() =>
      agentAccount(accountId).signAndSendTransaction({
        ...tx,
        waitUntil: "FINAL",
        throwOnFailure: false,
      } as any),
    );
    const error = failureOf(r);
    let value: unknown;
    const s = r?.status;
    if (
      !error &&
      s &&
      typeof s === "object" &&
      typeof s.SuccessValue === "string" &&
      s.SuccessValue
    ) {
      try {
        value = JSON.parse(
          new TextDecoder().decode(base64Decode(s.SuccessValue)),
        );
      } catch {
        /* ignore */
      }
    }
    return { ok: !error, txHash: r.transaction.hash, error, value };
  } catch (e: any) {
    const text = String(e?.message || e);
    const hash = text.match(/[1-9A-HJ-NP-Za-km-z]{43,44}/)?.[0] || "";
    if (/AccessKeyDoesNotExist|does not exist/i.test(text))
      return {
        ok: false,
        txHash: hash,
        error: "AGENT_REVOKED: the agent key is no longer on this account",
      };
    return { ok: false, txHash: hash, error: text.slice(0, 300) };
  }
}
export async function agentExecute(
  accountId: string,
  action: GuardAction,
): Promise<ExecResult> {
  const result = await sendAsAgent(
    accountId,
    agentExecuteTransaction(accountId, action),
  );
  if (result.ok && typeof result.value === "number") {
    const activity = await getActivity(accountId, rpc());
    const entry = activity.find((a) => a.id === result.value);
    if (!entry || !entry.ok)
      return {
        ...result,
        ok: false,
        error: entry?.reason || "SETTLEMENT_UNVERIFIED",
      };
  }
  return result;
}
export const agentAuthorizePerp = (
  accountId: string,
  auth: PerpAuthorization,
) => sendAsAgent(accountId, authorizePerpTransaction(accountId, auth));

/** Verifies a guest browser-key signature over `parts|timestamp`. */
export async function verifyGuestRequest(
  auth: {
    accountId: string;
    message: string;
    publicKey: string;
    signature: string;
  },
  expected: string[],
) {
  const parts = auth.message.split("|");
  if (parts.slice(0, -1).join("|") !== [near.network, ...expected].join("|"))
    throw new NearError("Signed request does not match this action", 401);
  await verifyAccountSignature(
    auth.accountId,
    auth.message,
    auth.publicKey,
    auth.signature,
  );
}

export async function swapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
) {
  const poolId = poolFor(tokenIn, tokenOut);
  const out = await view<string>(near.ref, "get_return", {
    pool_id: poolId,
    token_in: tokenIn,
    token_out: tokenOut,
    amount_in: amountIn,
  });
  const pool = await view<any>(near.ref, "get_pool", { pool_id: poolId });
  return { amountOut: out, pool, poolId, quotedAt: Date.now() };
}

/** Server-side policy pre-check so we explain refusals before spending gas. */
export function precheck(
  policy: GuardPolicy | null,
  asset: string,
  amount: string,
) {
  if (!policy) return null;
  if (policy.paused) return "PAUSED";
  if (Date.now() > policy.expires_at_ms) return "EXPIRED";
  const cap = policy.caps[asset];
  if (cap && BigInt(amount) > BigInt(cap.per_action)) return "CAP_PER_ACTION";
  return null;
}

export async function accountState(accountId: string) {
  const acc = await viewAccount(accountId);
  if (!acc) return { exists: false } as const;
  const guardInstalled =
    !!acc.global_contract_hash ||
    (acc.code_hash && acc.code_hash !== "11111111111111111111111111111111");
  const safe = async <T>(p: Promise<T>, d: T) => p.catch(() => d);
  const [
    policy,
    activity,
    spent,
    agentKey,
    wnear,
    tusdc,
    linear,
    burrow,
    linearPrice,
    linearAccount,
  ] = await Promise.all([
    guardInstalled ? safe(getPolicy(accountId, rpc()), null) : null,
    guardInstalled ? safe(getActivity(accountId, rpc()), []) : [],
    guardInstalled ? safe(getSpent(accountId, rpc()), {}) : {},
    guardInstalled ? safe(getAgentKey(accountId, rpc()), null) : null,
    safe(
      view<string>(TOKENS.wNEAR.id, "ft_balance_of", { account_id: accountId }),
      "0",
    ),
    safe(
      view<string>(TOKENS.tUSDC.id, "ft_balance_of", { account_id: accountId }),
      "0",
    ),
    safe(
      view<string>(near.linear, "ft_balance_of", { account_id: accountId }),
      "0",
    ),
    safe(
      view<any>(near.burrow, "get_account", { account_id: accountId }),
      null,
    ),
    safe(view<string>(near.linear, "ft_price", {}), "0"),
    safe(
      view<any>(near.linear, "get_account", { account_id: accountId }),
      null,
    ),
  ]);
  const extra: Record<string, string> = Object.fromEntries(
    await Promise.all(
      getSwapTokens()
        .filter((t) => t.id !== TOKENS.wNEAR.id && t.id !== TOKENS.tUSDC.id)
        .map(
          async (t) =>
            [
              t.symbol,
              await safe(
                view<string>(t.id, "ft_balance_of", { account_id: accountId }),
                "0",
              ),
            ] as const,
        ),
    ),
  );
  const locked = BigInt(acc.storage_usage) * 10n ** 19n;
  return {
    exists: true as const,
    accountId,
    guardInstalled: !!guardInstalled && !!policy,
    near: {
      total: acc.amount,
      available: (BigInt(acc.amount) > locked
        ? BigInt(acc.amount) - locked
        : 0n
      ).toString(),
      storageLocked: locked.toString(),
    },
    tokens: {
      wNEAR: wnear,
      [near.tokenSymbol]: tusdc,
      LiNEAR: linear,
      ...extra,
    },
    linearPrice,
    linearAccount,
    burrow,
    policy,
    activity,
    spent: spent as GuardSpent,
    agentKey,
  };
}
