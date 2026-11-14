import { z } from "zod";
import { NearError } from "../near/server";
import { intentsTokens, type IntentsToken } from "../near/intents";
import { body, fail, limit } from "../near/api";
import {
  quoteInputSchema,
  transferSchema,
  depositSchema,
  validateTransfer,
  buildMainnetQuote,
  validateQuote,
  totalWithFees,
  assertDeadline,
  type PreparedQuote,
  type MainnetQuoteRequest,
  type OneClickQuote,
} from "./validation";
const API = "https://1click.chaindefuser.com";
export async function oneClick(path: string, data?: unknown) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (process.env.ONECLICK_JWT)
    headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  const r = await fetch(API + path, {
    method: data === undefined ? "GET" : "POST",
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new NearError(
      typeof j.message === "string"
        ? j.message.slice(0, 250)
        : `1Click returned HTTP ${r.status}`,
      502,
    );
  return j;
}
export async function bridgeApi(
  request: Request,
  bucket: string,
  max: number,
  fn: () => Promise<unknown>,
) {
  try {
    limit(request, `bridge-${bucket}`, max);
    return Response.json(await fn(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    return fail(
      error instanceof NearError
        ? error
        : new NearError(
            error instanceof Error ? error.message : "Bridge request failed",
            400,
          ),
    );
  }
}
export type DepositAction =
  | {
      type: "FunctionCall";
      params: {
        methodName: string;
        args: Record<string, unknown>;
        gas: string;
        deposit: string;
      };
    }
  | { type: "Transfer"; params: { deposit: string } };
export type DepositPlan = {
  receiverId: string;
  actions: DepositAction[];
  storageDeposit: string;
  sourceAccount: string;
  depositAddress: string;
  amountIn: string;
  deadline: string;
  totalUsd: number;
  walletReserveNear: string;
};
async function view(contract: string, method: string, args: unknown) {
  const r = await fetch("https://rpc.mainnet.near.org", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "bridge-view",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contract,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json();
  if (!r.ok || j.error || j.result?.error || !Array.isArray(j.result?.result))
    throw new Error(
      `Mainnet ${method} view failed; cannot safely prepare deposit`,
    );
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(j.result.result)));
}

async function feeReserve(
  tokens: IntentsToken[],
  sourceUsd: number,
  quoteUsd: unknown,
  storage: bigint,
) {
  const response = await fetch("https://rpc.mainnet.near.org", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "gas",
      method: "gas_price",
      params: [null],
    }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await response.json();
  const price = json.result?.gas_price;
  if (!response.ok || !/^\d+$/.test(price || ""))
    throw new Error("Mainnet gas price unavailable");
  // Reserve twice the full 300 Tgas transaction allowance, plus storage and 1 yocto.
  const reserve = BigInt(price) * 600000000000000n + storage + 1n;
  const nearToken = tokens.find((t) => t.assetId === "nep141:wrap.near");
  if (!nearToken) throw new Error("NEAR price unavailable");
  const totalUsd = totalWithFees(sourceUsd, quoteUsd, reserve, nearToken);
  return { totalUsd, walletReserveNear: String(Number(reserve) / 1e24) };
}
export async function requestBridgeQuote(
  input: unknown,
): Promise<PreparedQuote> {
  const parsed = quoteInputSchema.parse(input),
    tokens = await intentsTokens();
  const transfer = transferSchema.parse(parsed),
    v = validateTransfer(transfer, tokens);
  const request = buildMainnetQuote(transfer, tokens, parsed.dry);
  await feeReserve(
    tokens,
    v.usd,
    v.usd,
    transfer.source === "USDC" ? 10n ** 22n : 0n,
  );
  const result = await oneClick("/v0/quote", request);
  if (!result.quote) throw new Error("1Click returned no quote");
  validateQuote(result.quote, request, transfer, v.origin);
  if (
    !result.quoteRequest ||
    Object.entries(request).some(
      ([key, value]) => result.quoteRequest[key] !== value,
    )
  )
    throw new Error("1Click returned a different quote request");
  const fees = await feeReserve(
    tokens,
    v.usd,
    result.quote.amountInUsd,
    transfer.source === "USDC" ? 10n ** 22n : 0n,
  );
  return {
    ...result,
    transfer,
    originToken: v.origin,
    destinationToken: v.destination,
    ...fees,
  };
}
/** Re-read authoritative status before building unsigned actions; never accept browser-supplied amounts. */
export async function prepareDeposit(input: unknown): Promise<DepositPlan> {
  const parsed = depositSchema.parse(input),
    transfer = transferSchema.parse(parsed);
  const tokens = await intentsTokens(),
    v = validateTransfer(transfer, tokens);
  const params = new URLSearchParams({ depositAddress: parsed.depositAddress });
  if (parsed.depositMemo) params.set("depositMemo", parsed.depositMemo);
  const status = await oneClick(`/v0/status?${params}`);
  if (status.status !== "PENDING_DEPOSIT")
    throw new Error(
      "Deposit already in progress or complete; do not send it again",
    );
  const request = status.quoteResponse?.quoteRequest as MainnetQuoteRequest;
  const quote = status.quoteResponse?.quote as OneClickQuote;
  const expected = buildMainnetQuote(transfer, tokens, false);
  if (
    !request ||
    !quote ||
    Object.entries(expected).some(
      ([key, value]) =>
        key !== "deadline" &&
        request[key as keyof MainnetQuoteRequest] !== value,
    ) ||
    quote.depositAddress !== parsed.depositAddress ||
    quote.depositMemo !== parsed.depositMemo
  )
    throw new Error("Transfer does not match the original 1Click quote");
  validateQuote(quote, request, transfer, v.origin);
  const deadline = new Date(
    Math.min(
      Date.parse(request.deadline),
      Date.parse(quote.deadline || request.deadline),
    ),
  ).toISOString();
  assertDeadline(deadline);
  let storageDeposit = "0";
  const actions: DepositAction[] = [];
  let receiverId = parsed.depositAddress;
  if (transfer.source === "NEAR")
    actions.push({ type: "Transfer", params: { deposit: quote.amountIn } });
  else {
    const contract = v.origin.contractAddress;
    if (!contract || contract !== v.origin.assetId.slice(7))
      throw new Error("Source USDC contract unavailable");
    receiverId = contract;
    const balance = await view(contract, "storage_balance_of", {
      account_id: parsed.depositAddress,
    });
    storageDeposit = balance
      ? "0"
      : String((await view(contract, "storage_balance_bounds", {})).min);
    if (!/^\d+$/.test(storageDeposit) || BigInt(storageDeposit) > 10n ** 22n)
      throw new Error("Unexpected token storage cost above 0.01 NEAR");
    if (storageDeposit !== "0")
      actions.push({
        type: "FunctionCall",
        params: {
          methodName: "storage_deposit",
          args: { account_id: parsed.depositAddress, registration_only: true },
          gas: "30000000000000",
          deposit: storageDeposit,
        },
      });
    actions.push({
      type: "FunctionCall",
      params: {
        methodName: "ft_transfer",
        args: {
          receiver_id: parsed.depositAddress,
          amount: quote.amountIn,
          ...(parsed.depositMemo ? { memo: parsed.depositMemo } : {}),
        },
        gas: "50000000000000",
        deposit: "1",
      },
    });
  }
  const fees = await feeReserve(
    tokens,
    v.usd,
    quote.amountInUsd,
    BigInt(storageDeposit),
  );
  return {
    receiverId,
    actions,
    storageDeposit,
    sourceAccount: transfer.refundTo,
    depositAddress: parsed.depositAddress,
    amountIn: quote.amountIn,
    deadline,
    ...fees,
  };
}
export { body };
