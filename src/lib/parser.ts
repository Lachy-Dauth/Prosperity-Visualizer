import {
  DAY_STRIDE,
  type DecodedLambdaLog,
  type OwnFill,
  type ParsedStrategy,
  type ProductSeries,
  type ProductTickRow,
  type RawLogFile,
  type SummaryMetrics,
} from "../types";
import { buildLimits } from "./positionLimits";

/** day * DAY_STRIDE + ts — the unique tick identity. */
function tickKeyOf(day: number, ts: number): number {
  return (Number.isFinite(day) ? day : 0) * DAY_STRIDE + ts;
}

/**
 * Parse the activitiesLog CSV (semicolon-delimited, well-defined header).
 * We avoid PapaParse here because the schema is fixed and a hand-rolled loop
 * is significantly faster on 20k+ rows. Empty cells (consecutive `;;`) become
 * NaN. This runs inside the parse worker.
 */
export function parseActivitiesCsv(csv: string): ProductTickRow[] {
  const rows: ProductTickRow[] = [];
  // Header check
  const newlineIdx = csv.indexOf("\n");
  if (newlineIdx === -1) return rows;
  const body = csv.slice(newlineIdx + 1);
  let line = "";
  let i = 0;
  const len = body.length;

  while (i <= len) {
    const ch = i < len ? body.charCodeAt(i) : 10; // EOF acts as newline
    if (ch === 10 /* \n */ || i === len) {
      const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
      if (trimmed.length > 0) {
        const parts = trimmed.split(";");
        // 17 columns expected
        const num = (s: string) => (s === "" ? NaN : Number(s));
        const day = num(parts[0]);
        const ts = num(parts[1]);
        const product = parts[2];
        const bids: { price: number; volume: number }[] = [];
        const asks: { price: number; volume: number }[] = [];
        for (let lvl = 0; lvl < 3; lvl++) {
          const bp = num(parts[3 + lvl * 2]);
          const bv = num(parts[4 + lvl * 2]);
          if (Number.isFinite(bp) && Number.isFinite(bv)) bids.push({ price: bp, volume: bv });
        }
        for (let lvl = 0; lvl < 3; lvl++) {
          const ap = num(parts[9 + lvl * 2]);
          const av = num(parts[10 + lvl * 2]);
          if (Number.isFinite(ap) && Number.isFinite(av)) asks.push({ price: ap, volume: av });
        }
        const mid = num(parts[15]);
        const pnl = num(parts[16]);
        rows.push({
          day,
          timestamp: ts,
          product,
          bids,
          asks,
          midPrice: mid,
          pnl,
        });
      }
      line = "";
      i++;
      continue;
    }
    line += body[i];
    i++;
  }
  return rows;
}

function microPriceOf(
  bids: { price: number; volume: number }[],
  asks: { price: number; volume: number }[]
): number {
  const bb = bids[0];
  const ba = asks[0];
  if (!bb || !ba) return NaN;
  const denom = bb.volume + ba.volume;
  if (denom <= 0) return (bb.price + ba.price) / 2;
  return (bb.price * ba.volume + ba.price * bb.volume) / denom;
}

function totalVol(levels: { price: number; volume: number }[]): number {
  let s = 0;
  for (const l of levels) s += l.volume;
  return s;
}

/**
 * Build per-product time series, position trace, and summary metrics from
 * the raw rows + trades.
 *
 * Supports multi-day logs where raw timestamps reset to 0 at each day
 * boundary by keying ticks on `day * DAY_STRIDE + timestamp` internally.
 */
export function buildStrategy(
  rawFile: RawLogFile,
  rows: ProductTickRow[],
  meta: { id: string; name: string; color: string; filename?: string }
): ParsedStrategy {
  // Preserve row order within a (day, ts) so products from the same tick
  // land on the same index. Sort by composite key, then product.
  rows.sort(
    (a, b) =>
      tickKeyOf(a.day, a.timestamp) - tickKeyOf(b.day, b.timestamp) ||
      a.product.localeCompare(b.product)
  );

  // Build sorted unique tick-key list and parallel day/rawTs arrays.
  const tIndex = new Map<number, number>();
  const timestamps: number[] = []; // composite tick keys
  const rawTimestamps: number[] = [];
  const days: number[] = [];
  const productSet = new Set<string>();
  for (const r of rows) {
    if (r.product) productSet.add(r.product);
    if (!Number.isFinite(r.timestamp)) continue;
    const key = tickKeyOf(r.day, r.timestamp);
    if (!tIndex.has(key)) {
      tIndex.set(key, timestamps.length);
      timestamps.push(key);
      rawTimestamps.push(r.timestamp);
      days.push(Number.isFinite(r.day) ? r.day : 0);
    }
  }
  const products = Array.from(productSet).sort();

  // Initialize per-product series
  const series: Record<string, ProductSeries> = {};
  for (const p of products) {
    series[p] = {
      product: p,
      timestamps,
      midPrice: new Array(timestamps.length).fill(NaN),
      microPrice: new Array(timestamps.length).fill(NaN),
      spread: new Array(timestamps.length).fill(NaN),
      bestBid: new Array(timestamps.length).fill(NaN),
      bestAsk: new Array(timestamps.length).fill(NaN),
      bidVol: new Array(timestamps.length).fill(NaN),
      askVol: new Array(timestamps.length).fill(NaN),
      imbalance: new Array(timestamps.length).fill(NaN),
      pnl: new Array(timestamps.length).fill(NaN),
      position: new Array(timestamps.length).fill(0),
      cumOwnVolume: new Array(timestamps.length).fill(0),
      books: timestamps.map(() => ({ bids: [], asks: [] })),
      ownFillIndices: timestamps.map(() => [] as number[]),
    };
  }

  // Fill in raw row data
  for (const r of rows) {
    const s = series[r.product];
    if (!s) continue;
    const i = tIndex.get(tickKeyOf(r.day, r.timestamp));
    if (i === undefined) continue;
    s.bestBid[i] = r.bids[0]?.price ?? NaN;
    s.bestAsk[i] = r.asks[0]?.price ?? NaN;
    s.bidVol[i] = totalVol(r.bids);
    s.askVol[i] = totalVol(r.asks);
    const totalBA = (s.bidVol[i] || 0) + (s.askVol[i] || 0);
    s.imbalance[i] = totalBA > 0 ? (s.bidVol[i] || 0) / totalBA : NaN;
    // mid_price column is 0 when book empty; treat as NaN to avoid skewing charts
    s.midPrice[i] = r.midPrice && r.midPrice !== 0 ? r.midPrice : NaN;
    s.microPrice[i] = microPriceOf(r.bids, r.asks);
    s.spread[i] =
      Number.isFinite(s.bestBid[i]) && Number.isFinite(s.bestAsk[i])
        ? s.bestAsk[i] - s.bestBid[i]
        : NaN;
    s.pnl[i] = r.pnl;
    s.books[i] = { bids: r.bids, asks: r.asks };
  }

  // Forward-fill mid price within each product (but leave initial NaNs)
  for (const p of products) {
    const s = series[p];
    let last = NaN;
    for (let i = 0; i < s.midPrice.length; i++) {
      if (Number.isFinite(s.midPrice[i])) last = s.midPrice[i];
      else if (Number.isFinite(last)) s.midPrice[i] = last;
    }
  }

  // Trades in rawFile.tradeHistory only carry raw `timestamp` (no day),
  // so we infer the day by walking them in file order. As long as trade
  // timestamps are non-decreasing, we're on the same day; when we see a
  // strict drop we cross into the next available day in the tick axis.
  // Trades with timestamps that don't correspond to any tick still get
  // a plausible day from the last known position.
  const uniqueDays: number[] = [];
  for (let i = 0; i < days.length; i++) {
    if (i === 0 || days[i] !== days[i - 1]) uniqueDays.push(days[i]);
  }
  const rawTrades = rawFile.tradeHistory ?? [];
  const tradeDays: number[] = new Array(rawTrades.length).fill(
    uniqueDays[0] ?? 0
  );
  let currentDayIdx = 0;
  let prevTs = -Infinity;
  for (let i = 0; i < rawTrades.length; i++) {
    const t = rawTrades[i];
    if (
      t.timestamp < prevTs &&
      currentDayIdx + 1 < uniqueDays.length
    ) {
      currentDayIdx++;
    }
    tradeDays[i] = uniqueDays[currentDayIdx] ?? 0;
    prevTs = t.timestamp;
  }
  // Now produce a stable chronological order (composite key), preserving
  // the original order on ties.
  const tradeOrder = rawTrades
    .map((_, i) => i)
    .sort((a, b) => {
      const ka = tickKeyOf(tradeDays[a], rawTrades[a].timestamp);
      const kb = tickKeyOf(tradeDays[b], rawTrades[b].timestamp);
      return ka - kb || a - b;
    });
  const tradesSorted = tradeOrder.map((i) => rawTrades[i]);
  const tradeDaysSorted = tradeOrder.map((i) => tradeDays[i]);

  // Walk trades to collect own fills with composite keys
  const ownFills: OwnFill[] = [];
  const fillsByTickIdxPerProduct: Record<string, Record<number, number[]>> = {};

  for (let k = 0; k < tradesSorted.length; k++) {
    const t = tradesSorted[k];
    const day = tradeDaysSorted[k];
    const isBuy = t.buyer === "SUBMISSION";
    const isSell = t.seller === "SUBMISSION";
    if (!isBuy && !isSell) continue;
    const sym = t.symbol;
    if (!series[sym]) continue;
    const sign = isBuy ? 1 : -1;
    const cashFlow = -sign * t.price * t.quantity;
    const fill: OwnFill = {
      timestamp: t.timestamp,
      product: sym,
      side: isBuy ? "buy" : "sell",
      price: t.price,
      quantity: t.quantity,
      cashFlow,
    };
    const idx = ownFills.length;
    ownFills.push(fill);
    const key = tickKeyOf(day, t.timestamp);
    let ti = tIndex.get(key);
    if (ti === undefined) {
      ti = lowerBound(timestamps, key);
      if (ti >= timestamps.length) ti = timestamps.length - 1;
    }
    if (!fillsByTickIdxPerProduct[sym]) fillsByTickIdxPerProduct[sym] = {};
    const map = fillsByTickIdxPerProduct[sym];
    if (!map[ti]) map[ti] = [];
    map[ti].push(idx);
  }

  // Now walk every tick and snapshot running position and cumulative vol.
  const tickPos: Record<string, number> = {};
  const tickCumVol: Record<string, number> = {};
  let walkPtr = 0;
  for (let i = 0; i < timestamps.length; i++) {
    const upper = timestamps[i];
    while (walkPtr < tradesSorted.length) {
      const tr = tradesSorted[walkPtr];
      const trKey = tickKeyOf(tradeDaysSorted[walkPtr], tr.timestamp);
      if (trKey > upper) break;
      const isBuy = tr.buyer === "SUBMISSION";
      const isSell = tr.seller === "SUBMISSION";
      if ((isBuy || isSell) && series[tr.symbol]) {
        const sign = isBuy ? 1 : -1;
        tickPos[tr.symbol] = (tickPos[tr.symbol] ?? 0) + sign * tr.quantity;
        tickCumVol[tr.symbol] = (tickCumVol[tr.symbol] ?? 0) + tr.quantity;
      }
      walkPtr++;
    }
    for (const p of products) {
      series[p].position[i] = tickPos[p] ?? 0;
      series[p].cumOwnVolume[i] = tickCumVol[p] ?? 0;
    }
  }

  // Attach explicit index lists per (product, tick). Fills for a single
  // (product, tick) are NOT guaranteed to be contiguous in ownFills
  // because multiple products can trade at the same timestamp, so we
  // store the full list of indices rather than a start/count range.
  for (const [prod, map] of Object.entries(fillsByTickIdxPerProduct)) {
    const s = series[prod];
    if (!s) continue;
    for (const [tiStr, idxs] of Object.entries(map)) {
      s.ownFillIndices[Number(tiStr)] = idxs;
    }
  }

  // Total PnL is sum of per-product cumulative PnL at each tick (forward-fill NaNs as 0 for sum)
  const totalPnl: number[] = new Array(timestamps.length).fill(0);
  for (const p of products) {
    const arr = series[p].pnl;
    let last = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (Number.isFinite(v)) last = v;
      totalPnl[i] += last;
    }
  }

  // Build per-tick-key log index. rawFile.logs entries only carry a raw
  // `timestamp` (no day), so we align them to ticks by file order under
  // the assumption logs are emitted one-per-tick chronologically — which
  // is how IMC's sandbox emits them. If the lengths disagree, extra logs
  // are ignored and missing logs leave the bucket empty.
  const logIndexByTick: Record<number, { start: number; count: number }> = {};
  const logCount = Math.min(rawFile.logs.length, timestamps.length);
  for (let i = 0; i < logCount; i++) {
    const key = timestamps[i];
    if (!logIndexByTick[key]) logIndexByTick[key] = { start: i, count: 0 };
    logIndexByTick[key].count++;
  }

  const summary = computeSummary(totalPnl, series, ownFills, products);

  return {
    id: meta.id,
    submissionId: rawFile.submissionId,
    name: meta.name,
    color: meta.color,
    filename: meta.filename,
    timestamps,
    rawTimestamps,
    days,
    products,
    series,
    totalPnl,
    rawLogs: rawFile.logs,
    ownFills,
    trades: tradesSorted,
    logIndexByTick,
    positionLimits: buildLimits(products),
    summary,
    loadedAt: new Date().toISOString(),
  };
}

function lowerBound(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function computeSummary(
  totalPnl: number[],
  series: Record<string, ProductSeries>,
  ownFills: OwnFill[],
  products: string[]
): SummaryMetrics {
  const finalPnl = totalPnl.length ? totalPnl[totalPnl.length - 1] : 0;

  // Max drawdown on cumulative PnL
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of totalPnl) {
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxDd) maxDd = dd;
  }

  // Per-product PnL (final)
  const perProductPnl: Record<string, number> = {};
  const finalPositions: Record<string, number> = {};
  let maxAbsPosition = 0;
  for (const p of products) {
    const arr = series[p].pnl;
    let lastPnl = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (Number.isFinite(arr[i])) {
        lastPnl = arr[i];
        break;
      }
    }
    perProductPnl[p] = lastPnl;
    const positions = series[p].position;
    let maxAbs = 0;
    for (const v of positions) if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    if (maxAbs > maxAbsPosition) maxAbsPosition = maxAbs;
    finalPositions[p] = positions.length ? positions[positions.length - 1] : 0;
  }

  // Win rate from closed round-trips per product (FIFO)
  let wins = 0;
  let closes = 0;
  const fillsByProduct: Record<string, OwnFill[]> = {};
  for (const f of ownFills) {
    if (!fillsByProduct[f.product]) fillsByProduct[f.product] = [];
    fillsByProduct[f.product].push(f);
  }
  for (const fs of Object.values(fillsByProduct)) {
    // FIFO inventory of [side, remaining qty, price]
    const inv: { side: "buy" | "sell"; qty: number; price: number }[] = [];
    for (const f of fs) {
      let qty = f.quantity;
      while (qty > 0 && inv.length > 0 && inv[0].side !== f.side) {
        const head = inv[0];
        const matched = Math.min(qty, head.qty);
        const pnl =
          head.side === "buy"
            ? (f.price - head.price) * matched
            : (head.price - f.price) * matched;
        if (pnl > 0) wins++;
        closes++;
        head.qty -= matched;
        qty -= matched;
        if (head.qty === 0) inv.shift();
      }
      if (qty > 0) inv.push({ side: f.side, qty, price: f.price });
    }
  }
  const winRate = closes > 0 ? wins / closes : 0;

  // Sharpe-ish: mean / std of per-tick PnL change
  let mean = 0;
  let m2 = 0;
  let n = 0;
  for (let i = 1; i < totalPnl.length; i++) {
    const d = totalPnl[i] - totalPnl[i - 1];
    n++;
    const delta = d - mean;
    mean += delta / n;
    m2 += delta * (d - mean);
  }
  const std = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(n) : 0;

  return {
    totalPnl: finalPnl,
    perProductPnl,
    maxDrawdown: maxDd,
    maxAbsPosition,
    tradeCount: ownFills.length,
    winRate,
    sharpe,
    finalPositions,
  };
}

/**
 * Decode the jmerle-style base64-encoded lambdaLog into a structured object.
 * Returns ok=false (with the original text) if decoding fails — common case
 * for algos that just print() debug info.
 */
export function decodeLambdaLog(s: string): DecodedLambdaLog {
  if (!s) return { ok: false, error: "empty" };
  // jmerle's logger prints multiple lines: a JSON object + a base64 blob.
  // Try to decode the LAST whitespace-separated token as base64-JSON.
  const tokens = s.trim().split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (tok.length < 8) continue;
    if (!/^[A-Za-z0-9+/=]+$/.test(tok)) continue;
    try {
      const decoded = atob(tok);
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) {
        const [state, orders, conversions, traderData, log] = parsed;
        return {
          ok: true,
          state,
          orders,
          conversions,
          traderData,
          pretty: JSON.stringify(
            { state, orders, conversions, traderData, log },
            null,
            2
          ),
        };
      }
      return { ok: true, state: parsed, pretty: JSON.stringify(parsed, null, 2) };
    } catch {
      // try previous token
    }
  }
  return { ok: false, error: "no-base64" };
}
