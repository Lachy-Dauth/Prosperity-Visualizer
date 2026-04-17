import { subscribe, getState, getReference } from "../store.js";
import { lttb } from "../downsample.js";
import { createChart } from "../chart.js";

export function mountPriceChart({ canvasEl, emptyEl, titleEl }) {
  let chart = null;
  let legendEl = null;
  let lastKey = null;

  const parent = canvasEl.parentElement;
  legendEl = document.createElement("div");
  legendEl.className = "chart-legend hidden";
  parent.appendChild(legendEl);

  function computeModel(state, ref, product) {
    const ps = ref.series[product];
    const xs = ps.timestamps;
    const targetPts = state.prefs.showSampled ? 1500 : xs.length;
    const project = (ys) => lttb(xs, ys, targetPts);
    const a = project(ps.bestAsk);
    const b = project(ps.bestBid);
    const m = project(ps.midPrice);
    const mp = project(ps.microPrice);
    const series = [
      { name: "Best ask", color: "#f87171", width: 1, xs: a.xs, ys: a.ys },
      { name: "Best bid", color: "#34d399", width: 1, xs: b.xs, ys: b.ys },
      { name: "Mid", color: "#a78bfa", width: 1.6, xs: m.xs, ys: m.ys },
      {
        name: "Microprice",
        color: "#2dd4bf",
        width: 1.2,
        dash: [4, 3],
        xs: mp.xs,
        ys: mp.ys,
      },
    ];
    return {
      xFormat: (v) => Math.round(v).toLocaleString(),
      yFormat: (v) => v.toFixed(1),
      series,
      onRender: (values) => {
        legendEl.classList.remove("hidden");
        legendEl.innerHTML = series
          .map(
            (s, i) => `<div class="legend-row">
          <span class="legend-name"><span class="legend-swatch" style="background:${s.color}"></span>${s.name}</span>
          <span class="legend-value">${values[i] == null ? "—" : values[i].toFixed(1)}</span>
        </div>`
          )
          .join("");
      },
    };
  }

  function render() {
    const state = getState();
    const ref = getReference(state);
    const product = state.selectedProduct ?? ref?.products[0] ?? null;
    titleEl.textContent = `Price & Liquidity ${product ? "· " + product : ""}`;

    if (!ref || !product) {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      emptyEl.textContent = ref ? "Select a product." : "Load a log to see prices.";
      emptyEl.classList.remove("hidden");
      canvasEl.classList.add("hidden");
      legendEl.classList.add("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    canvasEl.classList.remove("hidden");
    if (!chart) chart = createChart(canvasEl);

    const key = `${ref.id}|${product}|${state.prefs.showSampled}`;
    if (key !== lastKey) {
      chart.setData(computeModel(state, ref, product));
      lastKey = key;
    }
    chart.setCursorX(ref.timestamps[state.tickIdx] ?? 0);
  }

  subscribe(render);
  render();
}
