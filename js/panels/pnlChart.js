import { subscribe, getState, getReference, setPrefs } from "../store.js";
import { lttb } from "../downsample.js";
import { createChart } from "../chart.js";
import { downloadCanvasPng } from "../exporters.js";

const TARGET_POINTS = 1500;

export function mountPnlChart({
  canvasEl,
  emptyEl,
  normCheck,
  diffCheck,
  sampledCheck,
  exportBtn,
}) {
  let chart = null;
  let legendEl = null;
  let lastKey = null;

  const parent = canvasEl.parentElement;
  legendEl = document.createElement("div");
  legendEl.className = "chart-legend hidden";
  parent.appendChild(legendEl);

  normCheck.addEventListener("change", () =>
    setPrefs({ normalizedX: normCheck.checked })
  );
  diffCheck.addEventListener("change", () =>
    setPrefs({ diffMode: diffCheck.checked })
  );
  sampledCheck.addEventListener("change", () =>
    setPrefs({ showSampled: sampledCheck.checked })
  );
  exportBtn.addEventListener("click", () => {
    downloadCanvasPng(canvasEl, "pnl-performance.png");
  });

  function computeModel(state) {
    const ref = getReference(state);
    if (!ref) return null;
    const { prefs, strategies, comparingIds } = state;
    const compareList = strategies.filter(
      (s) => comparingIds.has(s.id) && s.id !== ref.id
    );
    const refXs = ref.timestamps;
    const refYs = ref.totalPnl;

    function project(strat) {
      const xsBase = prefs.normalizedX
        ? strat.timestamps.map((_, i) =>
            strat.timestamps.length > 1 ? i / (strat.timestamps.length - 1) : 0
          )
        : strat.timestamps;
      let ys = strat.totalPnl;
      if (prefs.diffMode && strat.id !== ref.id) {
        const out = new Array(xsBase.length);
        if (prefs.normalizedX) {
          for (let i = 0; i < xsBase.length; i++) {
            const t = xsBase[i];
            const refIdx = Math.min(
              refXs.length - 1,
              Math.round(t * (refXs.length - 1))
            );
            out[i] = ys[i] - refYs[refIdx];
          }
        } else {
          let j = 0;
          for (let i = 0; i < xsBase.length; i++) {
            while (j + 1 < refXs.length && refXs[j + 1] <= xsBase[i]) j++;
            out[i] = ys[i] - refYs[j];
          }
        }
        ys = out;
      }
      return prefs.showSampled ? lttb(xsBase, ys, TARGET_POINTS) : { xs: xsBase, ys };
    }

    const series = [
      {
        name: ref.name + " (ref)",
        color: ref.color,
        width: 2.2,
        ...project(ref),
      },
    ];
    for (const s of compareList) {
      series.push({ name: s.name, color: s.color, width: 1.2, ...project(s) });
    }

    return {
      xFormat: (v) =>
        prefs.normalizedX
          ? (v * 100).toFixed(0) + "%"
          : Math.round(v).toLocaleString(),
      yFormat: (v) =>
        Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0),
      series,
      onRender: (values) => {
        if (!series.length) {
          legendEl.classList.add("hidden");
          return;
        }
        legendEl.classList.remove("hidden");
        legendEl.innerHTML = series
          .map((s, i) => {
            const v = values[i];
            const cls =
              v === null
                ? ""
                : v >= 0
                ? "positive"
                : "negative";
            const text =
              v === null
                ? "—"
                : (v >= 0 ? "+" : "") +
                  (Math.abs(v) >= 1000
                    ? (v / 1000).toFixed(1) + "k"
                    : v.toFixed(0));
            return `<div class="legend-row">
              <span class="legend-name"><span class="legend-swatch" style="background:${s.color}"></span>${escapeHtml(s.name)}</span>
              <span class="legend-value ${cls}">${text}</span>
            </div>`;
          })
          .join("");
      },
    };
  }

  function render() {
    const state = getState();
    const ref = getReference(state);

    normCheck.checked = state.prefs.normalizedX;
    diffCheck.checked = state.prefs.diffMode;
    sampledCheck.checked = state.prefs.showSampled;

    if (!ref) {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      emptyEl.classList.remove("hidden");
      canvasEl.classList.add("hidden");
      legendEl.classList.add("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    canvasEl.classList.remove("hidden");
    if (!chart) chart = createChart(canvasEl);

    // Rebuild model only when deps change
    const key =
      state.strategies.length +
      "|" +
      state.referenceId +
      "|" +
      Array.from(state.comparingIds).join(",") +
      "|" +
      state.prefs.diffMode +
      "|" +
      state.prefs.normalizedX +
      "|" +
      state.prefs.showSampled;
    if (key !== lastKey) {
      chart.setData(computeModel(state));
      lastKey = key;
    }

    // Crosshair
    const cursorX = state.prefs.normalizedX
      ? ref.timestamps.length > 1
        ? state.tickIdx / (ref.timestamps.length - 1)
        : 0
      : ref.timestamps[state.tickIdx] ?? 0;
    chart.setCursorX(cursorX);
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
