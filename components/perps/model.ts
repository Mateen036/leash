import { friendlyError } from "../leash/friendly-error";
export type SignerMode = "chain-signatures" | "server-derived";
export type Market = {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  change24h: number;
  maxLeverage: number;
};
export type Position = {
  symbol: string;
  qty: number;
  avgOpen: number;
  markPrice: number;
  unrealizedPnl: number;
  estLiqPrice: number;
  leverage: number;
};
export type PerpsAccount = {
  registered?: boolean;
  address?: string;
  signerMode?: SignerMode;
  accountId?: string;
  orderlyAccountId?: string;
  usdcBalance?: number;
  faucetRequested?: boolean;
  starterUsdc?: number;
  positions?: Position[];
};
export type TradeResult = {
  ok?: boolean;
  authTx?: string | null;
  authId?: number | null;
  rejectedTx?: string | null;
  orderId?: number;
  orderIds?: number[];
  closed?: string[];
  error?: string;
};
export const marketName = (symbol: string) =>
  symbol.replace(/^PERP_/, "").replace(/_USDC$/, "");
export const shortId = (id: string) =>
  id.length > 22 ? `${id.slice(0, 10)}…${id.slice(-8)}` : id;
export const number = (value: number | undefined, digits = 2) =>
  value !== undefined && Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        maximumFractionDigits: Math.min(4, digits),
        minimumFractionDigits: digits === 2 ? 2 : 0,
      })
    : "—";
export const usd = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) ? `$${number(value)}` : "—";
export const percent = (value: number) =>
  `${value > 0 ? "+" : ""}${number(value * 100, 4)}%`;

/** Same isolated-style formula as perps-policy.ts. Orderly itself uses cross margin. */
export function previewRisk(
  side: "BUY" | "SELL",
  mark: number,
  notional: number,
  leverage: number,
) {
  if (
    ![mark, notional, leverage].every(Number.isFinite) ||
    mark <= 0 ||
    notional <= 0 ||
    leverage < 1
  )
    return null;
  const move = 1 / leverage - 0.025;
  const liquidation = side === "BUY" ? mark * (1 - move) : mark * (1 + move);
  return {
    quantity: notional / mark,
    margin: notional / leverage,
    liquidation,
    distancePct: Math.abs(move) * 100,
    fee: notional * 0.001,
  };
}

export function rejectionReason(error: string) {
  return friendlyError(error).title;
}

/** Keep the JSON body on non-2xx responses: a 409 contains the failed NEAR receipt. */
export async function perpsRequest<T>(
  path: string,
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal,
    ...(body
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false || data?.error) {
    throw new PerpsRequestError(
      data?.error ||
        `Request failed (${response.status}). Refresh your account before retrying.`,
      data || {},
    );
  }
  if (!data)
    throw new Error(
      "The server returned an unreadable response. Refresh before retrying.",
    );
  return data as T;
}
export class PerpsRequestError extends Error {
  constructor(
    message: string,
    public result: TradeResult,
  ) {
    super(message);
  }
}
