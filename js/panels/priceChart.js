import {
  subscribe,
  getState,
  getReference,
  setTickIdx,
  setPrefs,
} from "../store.js";
import { lttb } from "../downsample.js";
import { createChart } from "../chart.js";

// Default toggle state lives in prefs so the user's choice persists.
// Keys: priceLevels (L2/L3), priceBuys, priceSells, priceBots.
export function mountPriceChart({
  canvasEl,
  emptyEl,
  titleEl,
  legendEl,
  levelsCheck,
  midCheck,
  microCheck,
  wallMidCheck,
  buysCheck,
  sellsCheck,
  botsCheck,
  resetZoomBtn,
}) {
  let chart = null;
  let lastKey = null;
  let currentLegend = [];

  levelsCheck.addEventListener("change", () =>
    setPrefs({ priceLevels: levelsCheck.checked })
  );
  midCheck.addEventListener("change", () =>
    setPrefs({ priceMid: midCheck.checked })
  );
  microCheck.addEventListener("change", () =>
    setPrefs({ priceMicro: microCheck.checked })
  );
  wallMidCheck.addEventListener("change", () =>
    setPrefs({ priceWallMid: wallMidCheck.checked })
  );
  buysCheck.addEventListener("change", () =>
    setPrefs({ priceBuys: buysCheck.checked })
  );
  sellsCheck.addEventListener("change", () =>
    setPrefs({ priceSells: sellsCheck.checked })
  );
  botsCheck.addEventListener("change", () =>
    setPrefs({ priceBots: botsCheck.checked })
  );
  resetZoomBtn.addEventListener("click", () => chart?.resetXView());

  function ensureChart() {
    if (chart) return;
    chart = createChart(canvasEl, {
      onSeek: (xValue) => {
        const state = getState();
        const ref = getReference(state);
        if (!ref) return;
        const ts = ref.timestamps;
        if (ts.length < 2) return;
        let lo = 0;
        let hi = ts.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (ts[mid] < xValue) lo = mid + 1;
          else hi = mid;
        }
        setTickIdx(lo);
      },
      onHover: renderLegend,
    });
  }

  function renderLegend(values) {
    if (!currentLegend.length) {
      legendEl.innerHTML = "";
      return;
    }
    legendEl.innerHTML = currentLegend
      .map((s, i) => {
        const v = values ? values[i] : null;
        const swatch = s.marker
          ? `<span class="legend-swatch marker-${s.marker}" style="background:${s.color};color:${s.color}"></span>`
          : s.dash
            ? `<span class="legend-swatch dash" style="color:${s.color}"></span>`
            : `<span class="legend-swatch" style="background:${s.color}"></span>`;
        const val =
          v == null
            ? s.marker
              ? ""
              : `<span class="legend-value muted">—</span>`
            : `<span class="legend-value">${v.toFixed(1)}</span>`;
        return `<span class="legend-row">${swatch}<span class="legend-name">${escapeHtml(s.name)}</span>${val}</span>`;
      })
      .join("");
  }

  function computeModel(state, ref, product) {
    const ps = ref.series[product];
    const xs = ps.timestamps;
    const targetPts = state.prefs.showSampled ? 1500 : xs.length;
    const sample = (ys) => lttb(xs, ys, targetPts);

    // Lines: best bid/ask are always on; L2/L3 and the three "mid"
    // flavours each toggle independently via prefs.
    const bb = sample(ps.bestBid);
    const aa = sample(ps.bestAsk);

    const series = [
      { name: "Best ask (L1)", color: "#f87171", width: 1.2, xs: aa.xs, ys: aa.ys },
      { name: "Best bid (L1)", color: "#34d399", width: 1.2, xs: bb.xs, ys: bb.ys },
    ];

    if (state.prefs.priceLevels !== false) {
      const b2 = sample(ps.bidPrices?.[1] ?? []);
      const b3 = sample(ps.bidPrices?.[2] ?? []);
      const a2 = sample(ps.askPrices?.[1] ?? []);
      const a3 = sample(ps.askPrices?.[2] ?? []);
      series.push(
        { name: "Ask L2", color: "#f8717199", width: 1, xs: a2.xs, ys: a2.ys },
        { name: "Ask L3", color: "#f8717166", width: 1, xs: a3.xs, ys: a3.ys },
        { name: "Bid L2", color: "#34d39999", width: 1, xs: b2.xs, ys: b2.ys },
        { name: "Bid L3", color: "#34d39966", width: 1, xs: b3.xs, ys: b3.ys }
      );
    }
    if (state.prefs.priceMid !== false) {
      const m = sample(ps.midPrice);
      series.push({ name: "Mid", color: "#a78bfa", width: 1.6, xs: m.xs, ys: m.ys });
    }
    if (state.prefs.priceMicro !== false) {
      const mp = sample(ps.microPrice);
      series.push({
        name: "Microprice",
        color: "#2dd4bf",
        width: 1.2,
        dash: [4, 3],
        xs: mp.xs,
        ys: mp.ys,
      });
    }
    if (state.prefs.priceWallMid !== false) {
      const wm = sample(ps.wallMid ?? []);
      series.push({
        name: "Wall mid",
        color: "#fbbf24",
        width: 1.2,
        dash: [2, 4],
        xs: wm.xs,
        ys: wm.ys,
      });
    }

    // Markers: SUBMISSION buys (^), SUBMISSION sells (v), bot trades (·).
    const markers = [];
    const ownBuysXs = [];
    const ownBuysYs = [];
    const ownSellsXs = [];
    const ownSellsYs = [];
    const botXs = [];
    const botYs = [];
    for (const t of ref.trades) {
      if (t.symbol !== product) continue;
      // Line series plot against tickKey (day * DAY_STRIDE + ts), so
      // trade markers must use the same axis or multi-day logs collapse
      // every marker into the first day's x range.
      const x = t.tickKey ?? t.timestamp;
      const isBuy = t.buyer === "SUBMISSION";
      const isSell = t.seller === "SUBMISSION";
      if (isBuy) {
        ownBuysXs.push(x);
        ownBuysYs.push(t.price);
      } else if (isSell) {
        ownSellsXs.push(x);
        ownSellsYs.push(t.price);
      } else {
        botXs.push(x);
        botYs.push(t.price);
      }
    }
    // Own trades get a fat, high-contrast style so they jump out of
    // the noisy line series: larger shape, dark outline, bright fill.
    if (state.prefs.priceBuys)
      markers.push({
        name: "Own buys",
        color: "#4ade80",
        outline: "#052e16",
        shape: "up",
        size: 11,
        xs: ownBuysXs,
        ys: ownBuysYs,
      });
    if (state.prefs.priceSells)
      markers.push({
        name: "Own sells",
        color: "#fb7185",
        outline: "#450a0a",
        shape: "down",
        size: 11,
        xs: ownSellsXs,
        ys: ownSellsYs,
      });
    if (state.prefs.priceBots)
      markers.push({
        name: "Bot trades",
        color: "#d4d4d8",
        outline: "#18181b",
        shape: "dot",
        size: 11,
        xs: botXs,
        ys: botYs,
      });

    currentLegend = series.map((s) => ({
      name: s.name,
      color: s.color,
      dash: !!s.dash,
    }));
    for (const mk of markers) {
      currentLegend.push({
        name: `${mk.name} (${mk.xs.length})`,
        color: mk.color,
        marker: mk.shape,
      });
    }

    return {
      xFormat: (v) => Math.round(v).toLocaleString(),
      yFormat: (v) => v.toFixed(1),
      series,
      markers,
    };
  }

  function render() {
    const state = getState();
    const ref = getReference(state);
    const product = state.selectedProduct ?? ref?.products[0] ?? null;
    titleEl.textContent = `Price & Liquidity ${product ? "· " + product : ""}`;

    levelsCheck.checked = state.prefs.priceLevels !== false;
    midCheck.checked = state.prefs.priceMid !== false;
    microCheck.checked = state.prefs.priceMicro !== false;
    wallMidCheck.checked = state.prefs.priceWallMid !== false;
    buysCheck.checked = !!state.prefs.priceBuys;
    sellsCheck.checked = !!state.prefs.priceSells;
    botsCheck.checked = !!state.prefs.priceBots;

    if (!ref || !product) {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      currentLegend = [];
      legendEl.innerHTML = "";
      emptyEl.textContent = ref ? "Select a product." : "Load a log to see prices.";
      emptyEl.classList.remove("hidden");
      canvasEl.classList.add("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    canvasEl.classList.remove("hidden");
    ensureChart();

    const key = [
      ref.id,
      product,
      state.prefs.showSampled,
      state.prefs.priceLevels !== false,
      state.prefs.priceMid !== false,
      state.prefs.priceMicro !== false,
      state.prefs.priceWallMid !== false,
      !!state.prefs.priceBuys,
      !!state.prefs.priceSells,
      !!state.prefs.priceBots,
    ].join("|");
    if (key !== lastKey) {
      chart.setData(computeModel(state, ref, product));
      lastKey = key;
      renderLegend(null);
    }
    chart.setCursorX(ref.timestamps[state.tickIdx] ?? 0);
  }

  subscribe(render);
  render();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
