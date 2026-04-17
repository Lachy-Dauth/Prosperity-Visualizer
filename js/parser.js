import { buildLimits } from "./positionLimits.js";

/** Composite tick key stride — wider than any single-day max timestamp. */
export const DAY_STRIDE = 1_000_000;

function tickKeyOf(day, ts) {
  return (Number.isFinite(day) ? day : 0) * DAY_STRIDE + ts;
}

/**
 * Parse the activitiesLog CSV (semicolon-delimited; 17 fixed columns).
 * Missing/empty cells become NaN.
 */
export function parseActivitiesCsv(csv) {
  const rows = [];
  const newlineIdx = csv.indexOf("\n");
  if (newlineIdx === -1) return rows;
  const body = csv.slice(newlineIdx + 1);
  let line = "";
  let i = 0;
  const len = body.length;

  while (i <= len) {
    const ch = i < len ? body.charCodeAt(i) : 10;
    if (ch === 10 || i === len) {
      const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
      if (trimmed.length > 0) {
        const parts = trimmed.split(";");
        const num = (s) => (s === "" ? NaN : Number(s));
        const day = num(parts[0]);
        const ts = num(parts[1]);
        const product = parts[2];
        const bids = [];
        const asks = [];
        for (let lvl = 0; lvl < 3; lvl++) {
          const bp = num(parts[3 + lvl * 2]);
          const bv = num(parts[4 + lvl * 2]);
          if (Number.isFinite(bp) && Number.isFinite(bv))
            bids.push({ price: bp, volume: bv });
        }
        for (let lvl = 0; lvl < 3; lvl++) {
          const ap = num(parts[9 + lvl * 2]);
          const av = num(parts[10 + lvl * 2]);
          if (Number.isFinite(ap) && Number.isFinite(av))
            asks.push({ price: ap, volume: av });
        }
        rows.push({
          day,
          timestamp: ts,
          product,
          bids,
          asks,
          midPrice: num(parts[15]),
          pnl: num(parts[16]),
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

function microPriceOf(bids, asks) {
  const bb = bids[0];
  const ba = asks[0];
  if (!bb || !ba) return NaN;
  const denom = bb.volume + ba.volume;
  if (denom <= 0) return (bb.price + ba.price) / 2;
  return (bb.price * ba.volume + ba.price * bb.volume) / denom;
}

/**
 * Wall mid: midpoint between the largest-volume visible level on each
 * side — the "walls" the market is leaning against. Falls back to NaN
 * if either side is empty.
 */
function wallMidOf(bids, asks) {
  if (!bids.length || !asks.length) return NaN;
  let bWall = bids[0];
  for (const l of bids) if (l.volume > bWall.volume) bWall = l;
  let aWall = asks[0];
  for (const l of asks) if (l.volume > aWall.volume) aWall = l;
  return (bWall.price + aWall.price) / 2;
}

function totalVol(levels) {
  let s = 0;
  for (const l of levels) s += l.volume;
  return s;
}

function lowerBound(arr, target) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function buildStrategy(rawFile, rows, meta) {
  rows.sort(
    (a, b) =>
      tickKeyOf(a.day, a.timestamp) - tickKeyOf(b.day, b.timestamp) ||
      (a.product || "").localeCompare(b.product || "")
  );

  const tIndex = new Map();
  const timestamps = [];
  const rawTimestamps = [];
  const days = [];
  const productSet = new Set();
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

  const series = {};
  for (const p of products) {
    series[p] = {
      product: p,
      timestamps,
      midPrice: new Array(timestamps.length).fill(NaN),
      microPrice: new Array(timestamps.length).fill(NaN),
      wallMid: new Array(timestamps.length).fill(NaN),
      spread: new Array(timestamps.length).fill(NaN),
      bidPrices: [
        new Array(timestamps.length).fill(NaN),
        new Array(timestamps.length).fill(NaN),
        new Array(timestamps.length).fill(NaN),
      ],
      askPrices: [
        new Array(timestamps.length).fill(NaN),
        new Array(timestamps.length).fill(NaN),
        new Array(timestamps.length).fill(NaN),
      ],
      bestBid: new Array(timestamps.length).fill(NaN),
      bestAsk: new Array(timestamps.length).fill(NaN),
      bidVol: new Array(timestamps.length).fill(NaN),
      askVol: new Array(timestamps.length).fill(NaN),
      imbalance: new Array(timestamps.length).fill(NaN),
      pnl: new Array(timestamps.length).fill(NaN),
      position: new Array(timestamps.length).fill(0),
      cumOwnVolume: new Array(timestamps.length).fill(0),
      books: timestamps.map(() => ({ bids: [], asks: [] })),
      ownFillIndices: timestamps.map(() => []),
    };
  }

  for (const r of rows) {
    const s = series[r.product];
    if (!s) continue;
    const i = tIndex.get(tickKeyOf(r.day, r.timestamp));
    if (i === undefined) continue;
    s.bestBid[i] = r.bids[0]?.price ?? NaN;
    s.bestAsk[i] = r.asks[0]?.price ?? NaN;
    for (let lvl = 0; lvl < 3; lvl++) {
      s.bidPrices[lvl][i] = r.bids[lvl]?.price ?? NaN;
      s.askPrices[lvl][i] = r.asks[lvl]?.price ?? NaN;
    }
    s.bidVol[i] = totalVol(r.bids);
    s.askVol[i] = totalVol(r.asks);
    const totalBA = (s.bidVol[i] || 0) + (s.askVol[i] || 0);
    s.imbalance[i] = totalBA > 0 ? (s.bidVol[i] || 0) / totalBA : NaN;
    // Mid is only meaningful with both sides present; IMC's CSV mid is
    // 0 when one side is empty, so we collapse those to NaN and do not
    // forward-fill (leaves a visible gap in the chart).
    s.midPrice[i] =
      r.bids.length > 0 && r.asks.length > 0 && Number.isFinite(r.midPrice) && r.midPrice !== 0
        ? r.midPrice
        : NaN;
    s.microPrice[i] = microPriceOf(r.bids, r.asks);
    s.wallMid[i] = wallMidOf(r.bids, r.asks);
    s.spread[i] =
      Number.isFinite(s.bestBid[i]) && Number.isFinite(s.bestAsk[i])
        ? s.bestAsk[i] - s.bestBid[i]
        : NaN;
    s.pnl[i] = r.pnl;
    s.books[i] = { bids: r.bids, asks: r.asks };
  }

  // Align each trade to the activity tick with the matching raw
  // timestamp by walking forward through the tick array. This works
  // for logs whose first activity day contains no trades (where the
  // old "advance-on-timestamp-drop" heuristic anchored every trade to
  // the wrong day) and for logs that don't start on day 0.
  const rawTrades = rawFile.tradeHistory ?? [];
  const tradeDays = new Array(rawTrades.length).fill(days[0] ?? 0);
  const tradeTickKeys = new Array(rawTrades.length).fill(0);
  const ticksByRawTs = new Map();
  for (let i = 0; i < rawTimestamps.length; i++) {
    const rt = rawTimestamps[i];
    const list = ticksByRawTs.get(rt);
    if (list) list.push(i);
    else ticksByRawTs.set(rt, [i]);
  }
  {
    let pos = 0;
    for (let i = 0; i < rawTrades.length; i++) {
      const t = rawTrades[i];
      const candidates = ticksByRawTs.get(t.timestamp);
      let found = -1;
      if (candidates) {
        // Pick the first candidate tick at or after the running cursor;
        // falls back to the latest earlier candidate if we're already past
        // the last matching tick for this timestamp.
        for (const ti of candidates) {
          if (ti >= pos) {
            found = ti;
            break;
          }
        }
        if (found < 0) found = candidates[candidates.length - 1];
      }
      if (found < 0) {
        found = Math.max(0, Math.min(pos, timestamps.length - 1));
      }
      tradeDays[i] = days[found] ?? 0;
      tradeTickKeys[i] = timestamps[found] ?? tickKeyOf(tradeDays[i], t.timestamp);
      pos = found;
    }
  }
  const tradeOrder = rawTrades
    .map((_, i) => i)
    .sort((a, b) => tradeTickKeys[a] - tradeTickKeys[b] || a - b);
  const tradesSorted = tradeOrder.map((i) => ({
    ...rawTrades[i],
    day: tradeDays[i],
    tickKey: tradeTickKeys[i],
  }));
  const tradeDaysSorted = tradeOrder.map((i) => tradeDays[i]);

  const ownFills = [];
  const fillsByProductTick = {};
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
    const fill = {
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
    if (!fillsByProductTick[sym]) fillsByProductTick[sym] = {};
    if (!fillsByProductTick[sym][ti]) fillsByProductTick[sym][ti] = [];
    fillsByProductTick[sym][ti].push(idx);
  }

  // Running position + cumulative volume per tick.
  const tickPos = {};
  const tickCumVol = {};
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

  for (const [prod, map] of Object.entries(fillsByProductTick)) {
    const s = series[prod];
    if (!s) continue;
    for (const [tiStr, idxs] of Object.entries(map)) {
      s.ownFillIndices[Number(tiStr)] = idxs;
    }
  }

  const totalPnl = new Array(timestamps.length).fill(0);
  for (const p of products) {
    const arr = series[p].pnl;
    let last = 0;
    for (let i = 0; i < arr.length; i++) {
      if (Number.isFinite(arr[i])) last = arr[i];
      totalPnl[i] += last;
    }
  }

  // Per-tick log index: align rawFile.logs by file order to tick index.
  const logIndexByTick = {};
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

function computeSummary(totalPnl, series, ownFills, products) {
  const finalPnl = totalPnl.length ? totalPnl[totalPnl.length - 1] : 0;

  let peak = -Infinity;
  let maxDd = 0;
  for (const v of totalPnl) {
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxDd) maxDd = dd;
  }

  const perProductPnl = {};
  const finalPositions = {};
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

  let wins = 0;
  let closes = 0;
  const fillsByProduct = {};
  for (const f of ownFills) {
    if (!fillsByProduct[f.product]) fillsByProduct[f.product] = [];
    fillsByProduct[f.product].push(f);
  }
  for (const fs of Object.values(fillsByProduct)) {
    const inv = [];
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

export function decodeLambdaLog(s) {
  if (!s) return { ok: false, error: "empty" };
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
      /* try previous token */
    }
  }
  return { ok: false, error: "no-base64" };
}
