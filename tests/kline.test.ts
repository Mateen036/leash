import { test } from "node:test";
import assert from "node:assert/strict";
import { NearError } from "../lib/near/server";
import {
  cachedKlines,
  KLINE_CACHE_TTL_MS,
  loadKlines,
  parseKlineType,
  parsePerpSymbol,
  parseTvHistory,
  rangeFor,
  resetKlineCache,
} from "../lib/defi/kline";

test("accepts perpetual symbols and the documented timeframes", () => {
  assert.equal(parsePerpSymbol("perp_eth_usdc"), "PERP_ETH_USDC");
  assert.equal(parsePerpSymbol("PERP_BTC_USDC"), "PERP_BTC_USDC");
  assert.equal(parseKlineType("15m"), "15m");
  assert.equal(parseKlineType("1d"), "1D");
  assert.equal(parseKlineType("1D"), "1D");
  assert.throws(() => parsePerpSymbol("ETH_USDC"), NearError);
  assert.throws(() => parsePerpSymbol("PERP_ETH"), NearError);
  assert.throws(() => parseKlineType("2h"), NearError);
  assert.throws(() => parseKlineType(null), NearError);
});

test("kline windows stay large enough for a useful chart", () => {
  const now = 1_794_688_800;
  const hour = rangeFor("1h", now);
  assert.equal(hour.resolution, "1h");
  assert.equal(hour.to, now);
  assert.ok(hour.to - hour.from >= 3600 * 200);
  assert.equal(rangeFor("1D", now).resolution, "1d");
  assert.equal(rangeFor("5m", now).resolution, "5m");
});

test("TradingView history is sorted, de-duplicated and normalized to seconds", () => {
  const candles = parseTvHistory({
    s: "ok",
    t: [1_794_688_800, 1_794_688_440, 1_794_688_800_000],
    o: [10, 9, 11],
    h: [12, 10, 12],
    l: [9, 8, 10],
    c: [11, 10, 11.5],
    v: [1, 2, 3],
  });
  assert.equal(candles.length, 2);
  assert.deepEqual(
    candles.map((c) => c.time),
    [1_794_688_440, 1_794_688_800],
  );
  assert.equal(candles[1].close, 11.5);
  assert.equal(candles[1].volume, 3);
  assert.throws(() => parseTvHistory({ s: "error" }), NearError);
  assert.equal(parseTvHistory({ s: "ok", t: [0], o: [1], h: [1], l: [1], c: [1] }).length, 0);
});

test("cached kline reads coalesce in-flight requests and reuse a short TTL", async () => {
  resetKlineCache();
  let calls = 0;
  const fetchImpl: typeof fetch = async (input) => {
    calls += 1;
    const url = String(input);
    assert.match(url, /\/v1\/tv\/kline_history\?/);
    assert.match(url, /symbol=PERP_ETH_USDC/);
    assert.match(url, /resolution=15m/);
    return Response.json({
      s: "ok",
      t: [1_794_688_000],
      o: [1800],
      h: [1810],
      l: [1790],
      c: [1805],
      v: [2],
    });
  };
  const first = cachedKlines("PERP_ETH_USDC", "15m", fetchImpl, 1_000);
  const second = cachedKlines("PERP_ETH_USDC", "15m", fetchImpl, 1_000);
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a.last, 1805);
  assert.equal(b.candles[0].open, 1800);
  await cachedKlines("PERP_ETH_USDC", "15m", fetchImpl, 1_000 + KLINE_CACHE_TTL_MS - 1);
  assert.equal(calls, 1);
  await cachedKlines("PERP_ETH_USDC", "15m", fetchImpl, 1_000 + KLINE_CACHE_TTL_MS + 20);
  assert.equal(calls, 2);
});

test("upstream failures become a friendly error and never leak raw payloads", async () => {
  resetKlineCache();
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ success: false, message: "internal boom 0xdead" }), {
      status: 500,
    });
  await assert.rejects(
    loadKlines("PERP_SOL_USDC", "1h", fetchImpl, Date.now()),
    (error) => {
      assert.ok(error instanceof NearError);
      assert.equal(error.message, "Price history is unavailable right now.");
      assert.equal(error.status, 502);
      return true;
    },
  );
});
