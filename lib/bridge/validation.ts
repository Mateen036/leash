import { sha256 } from "@noble/hashes/sha256";
import { z } from "zod";
import { NEAR_USDC, bridgeDestinations, type IntentsToken } from "../near/intents";
export const MAX_USD = 25;
export const DESTINATION_CHAINS = [
  "base",
  "arb",
  "eth",
  "op",
  "pol",
  "sol",
  "btc",
  "bsc",
  "avax",
];
export function isMainnetAccount(value: string) {
  return (
    /^(?=.{2,64}$)[a-z0-9]+(?:[-_.][a-z0-9]+)*$/.test(value) &&
    !value.endsWith(".testnet") &&
    value !== "testnet"
  );
}
export const transferSchema = z.object({
  mode: z.literal("mainnet-wallet"),
  source: z.enum(["USDC", "NEAR"]),
  amount: z
    .string()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
    .max(80),
  destinationAsset: z.string().min(1).max(200),
  recipient: z.string().min(1).max(100),
  refundTo: z
    .string()
    .refine(isMainnetAccount, "Use your own NEAR mainnet wallet"),
  realMoneyConfirmed: z.literal(true),
});
export type BridgeTransfer = z.infer<typeof transferSchema>;
export const quoteInputSchema = transferSchema
  .extend({ dry: z.boolean() })
  .strict();
export const trackingSchema = z
  .object({
    depositAddress: z.string().refine(isMainnetAccount),
    depositMemo: z.string().max(200).optional(),
  })
  .strict();
export const depositSchema = transferSchema
  .extend({
    depositAddress: z.string().refine(isMainnetAccount),
    depositMemo: z.string().max(200).optional(),
  })
  .strict();
export const submitSchema = z
  .object({
    depositAddress: z.string().refine(isMainnetAccount),
    memo: z.string().max(200).optional(),
    txHash: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,50}$/),
    nearSenderAccount: z.string().refine(isMainnetAccount),
  })
  .strict();
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Length(s: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) return 0;
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  let bytes = 0;
  while (n) {
    bytes++;
    n >>= 8n;
  }
  return bytes + (s.match(/^1*/)?.[0].length || 0);
}
function base58Bytes(s: string) {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const bytes: number[] = [];
  while (n) {
    bytes.unshift(Number(n & 255n));
    n >>= 8n;
  }
  return Uint8Array.from([
    ...Array(s.match(/^1*/)?.[0].length || 0).fill(0),
    ...bytes,
  ]);
}
/** Format checks, not proof of ownership. Bitcoin bech32/bech32m checksum is checked. */
export function validAddress(chain: string, address: string): boolean {
  if (chain === "sol")
    return (
      address.length >= 32 &&
      address.length <= 44 &&
      base58Length(address) === 32
    );
  if (chain === "btc") {
    if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)) {
      const b = base58Bytes(address);
      return (
        b.length === 25 &&
        [0, 5].includes(b[0]) &&
        sha256(sha256(b.slice(0, 21)))
          .slice(0, 4)
          .every((v, i) => v === b[21 + i])
      );
    }
    if (address !== address.toLowerCase() && address !== address.toUpperCase())
      return false;
    const a = address.toLowerCase();
    if (!/^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{11,87}$/.test(a)) return false;
    const chars = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const data = [...a.slice(3)].map((c) => chars.indexOf(c));
    if (data[0] > 16) return false;
    let chk = 1;
    for (const v of [3, 3, 0, 2, 3, ...data]) {
      const top = chk >>> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].forEach(
        (g, i) => {
          if ((top >>> i) & 1) chk ^= g;
        },
      );
    }
    const payload = data.slice(1, -6);
    let acc = 0,
      bits = 0;
    const program: number[] = [];
    for (const v of payload) {
      acc = (acc << 5) | v;
      bits += 5;
      while (bits >= 8) {
        bits -= 8;
        program.push((acc >>> bits) & 255);
      }
    }
    if (
      bits >= 5 ||
      ((acc << (8 - bits)) & 255) !== 0 ||
      program.length < 2 ||
      program.length > 40
    )
      return false;
    if (data[0] === 0 && ![20, 32].includes(program.length)) return false;
    return chk >>> 0 === (data[0] === 0 ? 1 : 0x2bc830a3);
  }
  return (
    ["base", "eth", "pol", "arb", "op", "bsc", "avax"].includes(chain) &&
    /^0x[0-9a-fA-F]{40}$/.test(address) &&
    !/^0x0{40}$/.test(address)
  );
}
export function decimalUnits(amount: string, decimals: number) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount))
    throw new Error("Enter an exact positive decimal amount");
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals)
    throw new Error(`Asset allows at most ${decimals} decimal places`);
  const n =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");
  if (n <= 0n) throw new Error("Source amount must be positive");
  return n.toString();
}

export function assertDeadline(deadline: string, now = Date.now()) {
  if (
    !Number.isFinite(Date.parse(deadline)) ||
    Date.parse(deadline) <= now + 30000
  )
    throw new Error("Quote expired; prepare a fresh quote");
}
export function assertCap(value: unknown, label = "Bridge total") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_USD)
    throw new Error(`${label} must be positive and at most $25 including fees`);
}
export function tokenUsd(
  amount: string,
  token: IntentsToken,
  now = Date.now(),
) {
  const timestamp = Date.parse(token.priceUpdatedAt || "");
  if (
    !token.price ||
    !Number.isFinite(token.price) ||
    token.price <= 0 ||
    !Number.isFinite(timestamp) ||
    Math.abs(now - timestamp) > 600000
  )
    throw new Error("Fresh USD price unavailable; bridge disabled");
  return (
    Number(amount) * Math.max(token.price, token.symbol === "USDC" ? 1 : 0)
  );
}
export function destinationTokens(tokens: IntentsToken[]) {
  return bridgeDestinations(tokens);
}
export function validateTransfer(
  input: unknown,
  tokens: IntentsToken[],
  now = Date.now(),
) {
  const transfer = transferSchema.parse(input);
  const origin = tokens.find(
    (t) =>
      t.assetId ===
        (transfer.source === "USDC" ? NEAR_USDC : "nep141:wrap.near") &&
      t.blockchain === "near",
  );
  const destination = destinationTokens(tokens).find(
    (t) => t.assetId === transfer.destinationAsset,
  );
  if (!origin || !destination)
    throw new Error("Unsupported source or destination in live catalog");
  if (!validAddress(destination.blockchain, transfer.recipient))
    throw new Error("Destination address does not match the selected chain");
  const amount = decimalUnits(transfer.amount, origin.decimals);
  const usd = tokenUsd(transfer.amount, origin, now);
  assertCap(usd, "Source value");
  return { transfer, origin, destination, amount, usd };
}
export function buildMainnetQuote(
  input: unknown,
  tokens: IntentsToken[],
  dry: boolean,
  now = Date.now(),
) {
  const v = validateTransfer(input, tokens, now);
  return {
    dry,
    swapType: "EXACT_INPUT" as const,
    slippageTolerance: 100,
    originAsset: v.origin.assetId,
    destinationAsset: v.destination.assetId,
    amount: v.amount,
    depositType: "ORIGIN_CHAIN" as const,
    refundTo: v.transfer.refundTo,
    refundType: "ORIGIN_CHAIN" as const,
    recipient: v.transfer.recipient,
    recipientType: "DESTINATION_CHAIN" as const,
    deadline: new Date(now + 600000).toISOString(),
  };
}
export type MainnetQuoteRequest = ReturnType<typeof buildMainnetQuote> & {
  appFees?: { recipient: string; fee: number }[];
};
export type OneClickQuote = {
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  deadline?: string;
  depositAddress?: string;
  depositMemo?: string;
  timeEstimate: number;
  withdrawFee?: string;
  refundFee?: string;
};
export type PreparedQuote = {
  quote: OneClickQuote;
  quoteRequest: MainnetQuoteRequest;
  correlationId: string;
  signature: string;
  timestamp: string;
  transfer: BridgeTransfer;
  originToken: IntentsToken;
  destinationToken: IntentsToken;
  totalUsd: number;
  walletReserveNear: string;
};
export function validateQuote(
  q: OneClickQuote,
  request: MainnetQuoteRequest,
  transfer: BridgeTransfer,
  origin: IntentsToken,
  now = Date.now(),
) {
  if (
    !/^\d+$/.test(q.amountIn) ||
    q.amountIn !== request.amount ||
    q.amountIn !== decimalUnits(transfer.amount, origin.decimals)
  )
    throw new Error("1Click did not quote the exact source input");
  if (
    !/^\d+$/.test(q.amountOut) ||
    !/^\d+$/.test(q.minAmountOut) ||
    BigInt(q.minAmountOut) <= 0n ||
    BigInt(q.minAmountOut) > BigInt(q.amountOut)
  )
    throw new Error("Invalid minimum destination output");
  assertCap(q.amountInUsd, "Quoted source value");
  assertCap(tokenUsd(transfer.amount, origin, now), "Source token value");
  assertDeadline(request.deadline, now);
  if (q.deadline) assertDeadline(q.deadline, now);
  if (
    !Number.isFinite(q.timeEstimate) ||
    q.timeEstimate < 0 ||
    now + (q.timeEstimate + 60) * 1000 >=
      Math.min(
        Date.parse(request.deadline),
        Date.parse(q.deadline || request.deadline),
      )
  )
    throw new Error("Insufficient time to complete the quoted route");
  if (
    !request.dry &&
    (!q.depositAddress || !isMainnetAccount(q.depositAddress))
  )
    throw new Error("Invalid mainnet deposit address");
  if (transfer.source === "NEAR" && q.depositMemo)
    throw new Error("Native NEAR deposits requiring a memo are unsupported");
}
/** Route fees are included in exact input. Additional wallet gas/storage count too. */
export function totalWithFees(
  sourceUsd: number,
  quotedUsd: unknown,
  reserveYocto: bigint,
  nearToken: IntentsToken,
  now = Date.now(),
) {
  const quoted = Number(quotedUsd);
  assertCap(quoted, "Quoted input");
  // Round each contribution upward to a micro-dollar; never round a positive fee away at the cap.
  const reserveUsd = tokenUsd(
    String(Number(reserveYocto) / 1e24),
    nearToken,
    now,
  );
  const total =
    (Math.ceil(Math.max(sourceUsd, quoted) * 1e6) +
      Math.max(1, Math.ceil(reserveUsd * 1e6))) /
    1e6;
  assertCap(total, "Total including route fees, gas and storage reserve");
  return total;
}
