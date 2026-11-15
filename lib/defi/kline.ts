import { near } from "@/lib/near/config";
import { NearError } from "@/lib/near/server";
import {} from "./orderly";

export const KLINE_TYPES = ["5m", "15m", "1h", "4h", "1D"] as const;
export type KlineType = (typeof KLINE_TYPES)[number];

export const KLINE_WINDOWS: Record<
  KlineType,
  { resolution: string; periodSec: number; limit: number }
> = {
  "5m": { resolution: "5m", periodSec: 300, limit: 300 },
  "15m": { resolution: "15m", periodSec: 900, limit: 300 },
  "1h": { resolution: "1h", periodSec: 3600, limit: 300 },
  "4h": { resolution: "4h", periodSec: 14_400, limit: 250 },
  "1D": { resolution: "1d", periodSec: 86_400, limit: 180 },
};

export const KLINE_CACHE_TTL_MS = 8_000;
export const PERP_SYMBOL = /^PERP_[A-Z0-9]+_USDC$/;

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type KlinePayload = {
  symbol: string;
  type: KlineType;
  candles: Candle[];
  last: number | null;
  fetchedAt: number;
  source: "orderly-testnet" | "orderly-mainnet";
};

type TvHistory = {
  s?: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
};

type CacheEntry = {
  at: number;
  value?: KlinePayload;
  inflight?: Promise<KlinePayload>;
};

const cache = new Map<string, CacheEntry>();

export function resetKlineCache() {
  cache.clear();
}

export function isPerpSymbol(symbol: string) {
  return PERP_SYMBOL.test(symbol);
}

export function parseKlineType(value: string | null): KlineType {
  if (value === "1d") return "1D";
  const type = KLINE_TYPES.find((item) => item === value);
  if (!type)
    throw new NearError("Choose a timeframe of 5m, 15m, 1h, 4h or 1D.", 400);
  return type;
}

export function parsePerpSymbol(value: string | null) {
  const symbol = (value || "").trim().toUpperCase();
  if (!isPerpSymbol(symbol))
    throw new NearError("Choose a perpetual market like PERP_ETH_USDC.", 400);
  return symbol;
}

export function rangeFor(
  type: KlineType,
  nowSec = Math.floor(Date.now() / 1000),
) {
  const window = KLINE_WINDOWS[type];
  return {
    from: nowSec - window.periodSec * window.limit,
    to: nowSec,
    resolution: window.resolution,
    limit: window.limit,
  };
}

function asUnixSeconds(time: number) {
  return time > 10_000_000_000 ? Math.floor(time / 1000) : time;
}

export function parseTvHistory(data: TvHistory): Candle[] {
  if (data.s && data.s !== "ok")
    throw new NearError("Price history is unavailable for this market.", 502);
  const times = data.t ?? [];
  const candles: Candle[] = [];
  for (let i = 0; i < times.length; i++) {
    const time = asUnixSeconds(Number(times[i]));
    const open = Number(data.o?.[i]);
    const high = Number(data.h?.[i]);
    const low = Number(data.l?.[i]);
    const close = Number(data.c?.[i]);
    const volume = Number(data.v?.[i] ?? 0);
    if (![time, open, high, low, close].every(Number.isFinite) || time <= 0)
      continue;
    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  candles.sort((a, b) => a.time - b.time);
  const unique: Candle[] = [];
  for (const candle of candles) {
    const previous = unique[unique.length - 1];
    if (previous && previous.time === candle.time)
      unique[unique.length - 1] = candle;
    else unique.push(candle);
  }
  return unique;
}

export async function loadKlines(
  symbol: string,
  type: KlineType,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<KlinePayload> {
  const range = rangeFor(type, Math.floor(now / 1000));
  const path =
    `/v1/tv/kline_history?symbol=${encodeURIComponent(symbol)}` +
    `&resolution=${encodeURIComponent(range.resolution)}` +
    `&from=${range.from}&to=${range.to}&limit=${range.limit}`;
  let data: TvHistory = {};
  try {
    const response = await fetchImpl(`${near.orderlyApi}${path}`, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json" },
    });
    data = (await response.json().catch(() => ({}))) as TvHistory;
    if (!response.ok)
      throw new NearError("Price history is unavailable right now.", 502);
  } catch (error) {
    if (error instanceof NearError) throw error;
    throw new NearError("Price history is unavailable right now.", 502);
  }
  const candles = parseTvHistory(data);
  return {
    symbol,
    type,
    candles,
    last: candles.at(-1)?.close ?? null,
    fetchedAt: now,
    source: near.orderlyVenue as "orderly-testnet" | "orderly-mainnet",
  };
}

/** Short shared cache with coalesced in-flight requests, like the other public market reads. */
export async function cachedKlines(
  symbol: string,
  type: KlineType,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<KlinePayload> {
  const key = `${near.network}:${symbol}:${type}`;
  const hit = cache.get(key);
  if (hit?.value && now - hit.at < KLINE_CACHE_TTL_MS) return hit.value;
  if (hit?.inflight) return hit.inflight;
  const inflight = loadKlines(symbol, type, fetchImpl, now)
    .then((value) => {
      cache.set(key, { at: now, value });
      return value;
    })
    .catch((error) => {
      const current = cache.get(key);
      if (current?.inflight === inflight)
        cache.set(key, {
          at: current.value ? current.at : 0,
          value: current.value,
        });
      throw error;
    });
  cache.set(key, { at: hit?.at ?? 0, value: hit?.value, inflight });
  return inflight;
}
