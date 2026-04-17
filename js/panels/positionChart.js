import {
  subscribe,
  getState,
  getReference,
  setPositionLimit,
} from "../store.js";
import { lttb } from "../downsample.js";
import { createChart } from "../chart.js";

export function mountPositionChart({
  canvasEl,
  emptyEl,
  titleEl,
  limitInput,
}) {
  let chart = null;
  let legendEl = null;
  let lastKey = null;

  const parent = canvasEl.parentElement;
  legendEl = document.createElement("div");
  legendEl.className = "chart-legend hidden";
  parent.appendChild(legendEl);

  limitInput.addEventListener("change", (e) => {
    const state = getState();
    const ref = getReference(state);
    const product = state.selectedProduct ?? ref?.products[0] ?? null;
    if (!ref || !product) return;
    const v = Math.max(1, Number(e.target.value) || 1);
    setPositionLimit(ref.id, product, v);
  });

  function computeModel(state, ref, product, limit) {
    const { strategies, comparingIds } = state;
    const series = [];
    function add(s) {
      if (!s.series[product]) return;
      const xs = s.timestamps;
      const ys = s.series[product].position;
      const target = state.prefs.showSampled ? 1200 : xs.length;
      const r = lttb(xs, ys, target);
      series.push({ name: s.name, color: s.color, xs: r.xs, ys: r.ys, width: s.id === ref.id ? 2 : 1 });
    }
    add(ref);
    for (const s of strategies) {
      if (s.id === ref.id || !comparingIds.has(s.id)) continue;
      add(s);
    }
    return {
      xFormat: (v) => Math.round(v).toLocaleString(),
      yFormat: (v) => v.toFixed(0),
      series,
      limitLines: [
        { value: limit, color: "rgba(244,63,94,0.5)", dash: [3, 3] },
        { value: -limit, color: "rgba(244,63,94,0.5)", dash: [3, 3] },
      ],
      onRender: (values) => {
        legendEl.classList.remove("hidden");
        legendEl.innerHTML = series
          .map(
            (s, i) => `<div class="legend-row">
          <span class="legend-name"><span class="legend-swatch" style="background:${s.color}"></span>${escapeHtml(s.name)}</span>
          <span class="legend-value">${values[i] == null ? "—" : values[i].toFixed(0)}</span>
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
    titleEl.textContent = `Position ${product ? "· " + product : ""}`;

    if (!ref || !product) {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      emptyEl.textContent = ref ? "Select a product." : "Load a log to see positions.";
      emptyEl.classList.remove("hidden");
      canvasEl.classList.add("hidden");
      legendEl.classList.add("hidden");
      limitInput.disabled = true;
      return;
    }
    emptyEl.classList.add("hidden");
    canvasEl.classList.remove("hidden");
    limitInput.disabled = false;

    const limit = ref.positionLimits[product] ?? 50;
    if (document.activeElement !== limitInput) limitInput.value = String(limit);

    if (!chart) chart = createChart(canvasEl);

    const key = `${ref.id}|${product}|${state.prefs.showSampled}|${Array.from(state.comparingIds).join(",")}|${state.strategies.length}|${limit}`;
    if (key !== lastKey) {
      chart.setData(computeModel(state, ref, product, limit));
      lastKey = key;
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
