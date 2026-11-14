import { findSession, placeMarket, positions } from "./orderly";
export async function closePositions(nearAccountId: string, symbol?: string) {
  const s = await findSession(nearAccountId);
  if (!s) return { ok: true, closed: [], orderIds: [] };
  const p = await positions(s);
  const open = ((p?.rows as any[]) || []).filter((r) => Number(r.position_qty) !== 0 && (!symbol || r.symbol === symbol));
  const orderIds: number[] = []; const closed: string[] = [];
  for (const r of open) {
    const qty = Math.abs(Number(r.position_qty));
    const o = await placeMarket(s, { symbol: r.symbol, side: Number(r.position_qty) > 0 ? "SELL" : "BUY", quantity: qty, reduceOnly: true });
    orderIds.push(o.order_id); closed.push(r.symbol);
  }
  return { ok: true, closed, orderIds };
}
