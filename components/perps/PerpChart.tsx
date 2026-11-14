"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorNotice } from "../leash/ErrorNotice";
import {
  type Candle,
  type KlinePayload,
  type KlineType,
  KLINE_TYPES,
} from "@/lib/defi/kline";
import { marketName, percent, usd, type Position } from "./model";
import styles from "./perps.module.css";

type ChartStyle = "candles" | "line";
type Lib = typeof import("lightweight-charts");

type Props = {
  symbol: string;
  markPrice?: number;
  change24h?: number;
  position?: Position | null;
};

const UP = "#00ec97";
const DOWN = "#ff6b7a";
const MUTED = "#9db1a9";
const GRID = "#2c403b";

export function PerpChart({ symbol, markPrice, change24h, position }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<Lib["createChart"]> | null>(null);
  const seriesRef = useRef<ReturnType<
    ReturnType<Lib["createChart"]>["addSeries"]
  > | null>(null);
  const linesRef = useRef<ReturnType<
    NonNullable<typeof seriesRef.current>["createPriceLine"]
  >[]>([]);
  const libRef = useRef<Lib | null>(null);
  const typeRef = useRef<KlineType>("15m");
  const styleRef = useRef<ChartStyle>("candles");
  const fitted = useRef("");
  const [libReady, setLibReady] = useState(false);
  const [type, setType] = useState<KlineType>("15m");
  const [style, setStyle] = useState<ChartStyle>("candles");
  const [payload, setPayload] = useState<KlinePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  typeRef.current = type;
  styleRef.current = style;

  const clearLines = () => {
    const series = seriesRef.current;
    if (!series) {
      linesRef.current = [];
      return;
    }
    for (const line of linesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        /* already removed */
      }
    }
    linesRef.current = [];
  };

  useEffect(() => {
    let cancelled = false;
    import("lightweight-charts")
      .then((lib) => {
        if (cancelled) return;
        libRef.current = lib;
        setLibReady(true);
      })
      .catch(() => {
        if (!cancelled)
          setError("The price chart could not be loaded. Refresh the page.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const id = ++request.current;
    setLoading(true);
    setError("");
    const refresh = async (initial: boolean) => {
      if (running || controller.signal.aborted) return;
      running = true;
      try {
        const response = await fetch(
          `/api/perps/kline?symbol=${encodeURIComponent(symbol)}&type=${type}`,
          { signal: controller.signal },
        );
        const data = await response.json().catch(() => null);
        if (controller.signal.aborted || request.current !== id) return;
        if (
          !response.ok ||
          !data ||
          data.error ||
          !Array.isArray(data.candles)
        ) {
          throw new Error(
            "Price history is unavailable right now. Try again in a moment.",
          );
        }
        setPayload(data as KlinePayload);
        setError("");
      } catch (e) {
        if (controller.signal.aborted || request.current !== id) return;
        if (initial)
          setError(
            "Price history is unavailable right now. Try again in a moment.",
          );
      } finally {
        running = false;
        if (!controller.signal.aborted && request.current === id)
          setLoading(false);
      }
    };
    void refresh(true);
    const timer = setInterval(() => void refresh(false), 10_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [symbol, type, retry]);

  useEffect(() => {
    const lib = libRef.current;
    const node = host.current;
    if (!lib || !node || !libReady) return;
    const chart = lib.createChart(node, {
      autoSize: true,
      layout: {
        background: { type: lib.ColorType.Solid, color: "transparent" },
        textColor: MUTED,
        fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#2c403b40" },
        horzLines: { color: "#2c403b40" },
      },
      crosshair: {
        mode: lib.CrosshairMode.Normal,
        vertLine: { color: "#b5e8cf66", labelBackgroundColor: "#16332b" },
        horzLine: { color: "#b5e8cf66", labelBackgroundColor: "#16332b" },
      },
      rightPriceScale: {
        borderColor: GRID,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderColor: GRID,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true },
    });
    chart.subscribeCrosshairMove((param) => {
      const tip = tooltip.current;
      if (!tip) return;
      const series = seriesRef.current;
      const data = series
        ? (param.seriesData.get(series) as
            | {
                open?: number;
                high?: number;
                low?: number;
                close?: number;
                value?: number;
              }
            | undefined)
        : undefined;
      if (
        !param.time ||
        !param.point ||
        !data ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        tip.hidden = true;
        return;
      }
      const close = data.close ?? data.value;
      const open = data.open ?? close;
      const high = data.high ?? close;
      const low = data.low ?? close;
      const when =
        typeof param.time === "number" ? new Date(param.time * 1000) : new Date();
      const daily = typeRef.current === "1D";
      const up = (close ?? 0) >= (open ?? 0);
      tip.hidden = false;
      tip.style.left = `${Math.min(param.point.x + 14, node.clientWidth - 170)}px`;
      tip.style.top = `${Math.max(8, param.point.y - 12)}px`;
      tip.innerHTML = `<time>${when.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: daily ? undefined : "2-digit",
        minute: daily ? undefined : "2-digit",
      })}</time>${
        data.open != null
          ? `<dl><div><dt>O</dt><dd>${fmt(open)}</dd></div><div><dt>H</dt><dd>${fmt(high)}</dd></div><div><dt>L</dt><dd>${fmt(low)}</dd></div><div><dt>C</dt><dd class="${up ? "up" : "down"}">${fmt(close)}</dd></div></dl>`
          : `<dl><div><dt>Price</dt><dd>${fmt(close)}</dd></div></dl>`
      }`;
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
      fitted.current = "";
    };
  }, [libReady]);

  useEffect(() => {
    const lib = libRef.current;
    const chart = chartRef.current;
    if (!lib || !chart) return;
    chart.applyOptions({
      timeScale: { timeVisible: type !== "1D", secondsVisible: false },
    });
    if (seriesRef.current) {
      clearLines();
      try {
        chart.removeSeries(seriesRef.current);
      } catch {
        /* already removed */
      }
      seriesRef.current = null;
    }
    seriesRef.current =
      style === "line"
        ? chart.addSeries(lib.LineSeries, {
            color: UP,
            lineWidth: 2,
            priceLineVisible: true,
            lastValueVisible: true,
          })
        : chart.addSeries(lib.CandlestickSeries, {
            upColor: UP,
            downColor: DOWN,
            borderUpColor: UP,
            borderDownColor: DOWN,
            wickUpColor: UP,
            wickDownColor: DOWN,
            priceLineVisible: true,
            lastValueVisible: true,
          });
    fitted.current = "";
  }, [libReady, style, type, symbol]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const candles = payload?.candles ?? [];
    if (!chart || !series || !candles.length) return;
    if (styleRef.current === "line") {
      series.setData(candles.map((c: Candle) => ({ time: c.time as never, value: c.close })));
    } else {
      series.setData(
        candles.map((c: Candle) => ({
          time: c.time as never,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
    }
    const key = `${symbol}:${type}:${style}`;
    if (fitted.current !== key) {
      chart.timeScale().fitContent();
      fitted.current = key;
    }
  }, [payload, libReady, style, type, symbol]);

  useEffect(() => {
    const lib = libRef.current;
    const series = seriesRef.current;
    if (!lib || !series) return;
    clearLines();
    if (!position || position.symbol !== symbol) return;
    if (Number.isFinite(position.avgOpen) && position.avgOpen > 0) {
      linesRef.current.push(
        series.createPriceLine({
          price: position.avgOpen,
          color: "#7cffc6",
          lineWidth: 1,
          lineStyle: lib.LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Entry",
        }),
      );
    }
    if (Number.isFinite(position.estLiqPrice) && position.estLiqPrice > 0) {
      linesRef.current.push(
        series.createPriceLine({
          price: position.estLiqPrice,
          color: DOWN,
          lineWidth: 1,
          lineStyle: lib.LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Liq",
        }),
      );
    }
  }, [position, payload, libReady, style, symbol]);

  const last = markPrice ?? payload?.last ?? null;
  const ready = !error && (payload?.candles.length ?? 0) > 0 && libReady;
  const showSkeleton = (loading || !libReady) && !ready && !error;
  const empty = !loading && !error && payload && payload.candles.length === 0;

  return (
    <section
      className={styles.chartCard}
      aria-label={`${marketName(symbol)} price chart`}
      data-testid="perp-chart"
      data-symbol={symbol}
      data-timeframe={type}
      data-style={style}
      data-chart-ready={ready ? "true" : "false"}
      data-candle-count={payload?.candles.length ?? 0}
    >
      <header className={styles.chartHeader}>
        <div className={styles.chartPrice}>
          <span className={styles.label}>
            {marketName(symbol)} / USDC · last price
          </span>
          <strong>{usd(last ?? undefined)}</strong>
          <span
            className={
              change24h == null
                ? undefined
                : change24h >= 0
                  ? styles.positive
                  : styles.negative
            }
          >
            {change24h == null
              ? "24h change pending"
              : `${percent(change24h)} · 24h`}
          </span>
        </div>
        <div className={styles.chartMeta}>
          <div
            className={styles.chartTabs}
            role="tablist"
            aria-label="Chart timeframe"
          >
            {KLINE_TYPES.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={type === item}
                onClick={() => setType(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className={styles.chartTabs} role="group" aria-label="Chart style">
            <button
              type="button"
              aria-pressed={style === "candles"}
              onClick={() => setStyle("candles")}
            >
              Candles
            </button>
            <button
              type="button"
              aria-pressed={style === "line"}
              onClick={() => setStyle("line")}
            >
              Line
            </button>
          </div>
        </div>
      </header>
      <div className={styles.chartFrame}>
        <div ref={host} className={styles.chartCanvas} />
        <div ref={tooltip} className={styles.chartTooltip} hidden />
        {showSkeleton && (
          <div className={styles.chartSkeleton} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
        {error && (
          <div className={styles.chartState}>
            <ErrorNotice error={error} className={styles.warning} />
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setRetry((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        )}
        {empty && (
          <div className={styles.chartState}>
            <p>No price history for this market yet.</p>
          </div>
        )}
      </div>
      <p className={styles.fineprint}>
        Orderly testnet klines · updates every 10 seconds
        {position && position.symbol === symbol && position.avgOpen > 0
          ? " · entry and liquidation lines from your open position"
          : ""}
      </p>
    </section>
  );
}

function fmt(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
