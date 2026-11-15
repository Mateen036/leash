import { near } from "../near/config";
/** Public testnet token metadata used by Leash (no secrets). */
export const TOKENS = {
  NEAR: { id: "near", symbol: "NEAR", decimals: 24 },
  get wNEAR() {
    return { id: near.wrap, symbol: "wNEAR", decimals: 24 };
  },
  get tUSDC() {
    return { id: near.token, symbol: near.tokenSymbol, decimals: 6 };
  },
  get LiNEAR() {
    return { id: near.linear, symbol: "LiNEAR", decimals: 24 };
  },
} as const;
export const REF = "ref-finance-101.testnet";
export const BURROW = "contract.burrow.testnet";
export const LINEAR = "linear-protocol.testnet";
export const SWAP_POOL = 2973;

export type SwapToken = {
  /** NEP-141 contract (wrap.testnet for NEAR). */
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Local logo under /public/tokens (copied from on-chain ft_metadata icons or official brand assets). */
  logo: string;
  /** Ref pool that pairs this token with wNEAR (null for NEAR itself). */
  pool: number | null;
  /** Default guard caps in base units. */
  cap: { per_action: string; daily: string };
  /** Leash can send this token from its faucet. */
  faucet?: string;
};
const units = (n: number, d: number) =>
  (BigInt(n) * 10n ** BigInt(d)).toString();
/**
 * Every token here was verified on 14 Nov 2026 to have a live Ref testnet pool with real wNEAR
 * liquidity (get_return round-trip) and to execute through the guard contract. All pairs route
 * through NEAR (single-hop pools only), so any listed token can be swapped to or from NEAR.
 */
export const SWAP_TOKENS: SwapToken[] = [
  {
    id: "wrap.testnet",
    symbol: "NEAR",
    name: "NEAR",
    decimals: 24,
    logo: "/tokens/near.png",
    pool: null,
    cap: {
      per_action: "500000000000000000000000",
      daily: "1500000000000000000000000",
    },
  },
  {
    id: "usdc.lapdemo-11140542.testnet",
    symbol: "tUSDC",
    name: "Leash test USDC",
    decimals: 6,
    logo: "/tokens/tusdc.svg",
    pool: 2973,
    cap: { per_action: units(50, 6), daily: units(150, 6) },
    faucet: units(25, 6),
  },
  {
    id: "usdt.itachicara.testnet",
    symbol: "USDT",
    name: "Tether USD (testnet)",
    decimals: 24,
    logo: "/tokens/usdt.png",
    pool: 1084,
    cap: { per_action: units(50, 24), daily: units(150, 24) },
    faucet: "100000000000000000000000",
  },
  {
    id: "usdc.itachicara.testnet",
    symbol: "USDC",
    name: "USD Coin (testnet)",
    decimals: 24,
    logo: "/tokens/usdc.png",
    pool: 1103,
    cap: { per_action: units(50, 24), daily: units(150, 24) },
    faucet: "200000000000000000000000",
  },
  {
    id: "token.pembrock.testnet",
    symbol: "PEM",
    name: "PembRock (testnet)",
    decimals: 18,
    logo: "/tokens/pem.svg",
    pool: 461,
    cap: { per_action: units(200, 18), daily: units(600, 18) },
    faucet: units(2, 18),
  },
  {
    id: "lnc.factory.tokenhub.testnet",
    symbol: "LNC",
    name: "Learn NEAR Club (testnet)",
    decimals: 18,
    logo: "/tokens/lnc.jpg",
    pool: 395,
    cap: { per_action: units(20, 18), daily: units(60, 18) },
    faucet: "200000000000000000",
  },
  {
    id: "nst.deganstable.testnet",
    symbol: "NST",
    name: "nStable (testnet)",
    decimals: 6,
    logo: "/tokens/nst.svg",
    pool: 602,
    cap: { per_action: units(200, 6), daily: units(600, 6) },
    faucet: units(2, 6),
  },
];
/** Mainnet pools and NEP-141 metadata verified against RPC; demo-only tokens stay on testnet. */
const MAINNET_SWAP_TOKENS: SwapToken[] = [
  {
    id: "wrap.near",
    symbol: "NEAR",
    name: "NEAR",
    decimals: 24,
    logo: "/tokens/near.png",
    pool: null,
    cap: {
      per_action: "500000000000000000000000",
      daily: "1500000000000000000000000",
    },
  },
  {
    id: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "/tokens/usdc.png",
    pool: 4512,
    cap: { per_action: units(50, 6), daily: units(150, 6) },
  },
  {
    id: "usdt.tether-token.near",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logo: "/tokens/usdt.png",
    pool: 3879,
    cap: { per_action: units(50, 6), daily: units(150, 6) },
  },
];
export const getSwapTokens = (): SwapToken[] =>
  near.network === "mainnet" ? MAINNET_SWAP_TOKENS : SWAP_TOKENS;
export const getSwapPools = () =>
  getSwapTokens().flatMap((t) => (t.pool == null ? [] : [t.pool]));
export const LINEAR_TOKEN = {
  get id() {
    return near.linear;
  },
  symbol: "LiNEAR",
  name: "LiNEAR staked NEAR",
  decimals: 24,
  logo: "/tokens/linear.svg",
};
export const swapToken = (idOrSymbol: string) =>
  getSwapTokens().find(
    (t) =>
      t.id === idOrSymbol ||
      t.symbol.toLowerCase() === idOrSymbol.toLowerCase(),
  );
/** Ref pool for a NEAR-paired swap; throws if the pair isn't listed. */
export function poolFor(tokenIn: string, tokenOut: string): number {
  if (tokenIn === tokenOut) throw new Error("Pick two different tokens");
  const other =
    tokenIn === TOKENS.wNEAR.id
      ? tokenOut
      : tokenOut === TOKENS.wNEAR.id
        ? tokenIn
        : null;
  const t = other ? swapToken(other) : undefined;
  if (!t || t.pool == null) throw new Error("Swaps go to or from NEAR");
  return t.pool;
}
export const SWAP_POOLS = SWAP_TOKENS.filter((t) => t.pool != null).map(
  (t) => t.pool as number,
);

export function toBase(amount: string | number, decimals: number): string {
  const text =
    typeof amount === "number"
      ? amount.toFixed(Math.min(decimals, 8))
      : amount.trim();
  if (!/^\d+(\.\d+)?$/.test(text))
    throw new Error("Use a positive decimal amount");
  const [w, f = ""] = text.split(".");
  if (f.length > decimals) throw new Error(`At most ${decimals} decimals`);
  return (
    BigInt(w) * 10n ** BigInt(decimals) +
    BigInt((f || "0").padEnd(decimals, "0"))
  ).toString();
}
export function fromBase(
  units: string | bigint,
  decimals: number,
  maxFrac = 6,
): string {
  const v = BigInt(units);
  const base = 10n ** BigInt(decimals);
  const frac = (v % base)
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFrac)
    .replace(/0+$/, "");
  return `${v / base}${frac ? "." + frac : ""}`;
}

/** Canonical string a browser key signs for a guard action (key-order stable). */
export function actionDigest(a: object) {
  return JSON.stringify(
    Object.keys(a)
      .sort()
      .reduce((o: any, k) => ((o[k] = (a as any)[k]), o), {}),
  );
}
