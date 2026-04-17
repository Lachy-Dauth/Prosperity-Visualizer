import { subscribe, getState, getReference } from "../store.js";
import { fmtInt, fmtPrice, fmtSigned } from "../format.js";

export function mountKpi(el) {
  function render() {
    const state = getState();
    const ref = getReference(state);
    if (!ref) {
      el.innerHTML = `<div class="kpi-empty muted" style="grid-column:1/-1;text-align:center">Load a log to see KPIs.</div>`;
      return;
    }
    const tickIdx = state.tickIdx;
    const selectedProduct = state.selectedProduct;
    const totalAtTick = ref.totalPnl[tickIdx] ?? 0;
    const finalTotal = ref.summary.totalPnl;

    let curPos = 0;
    if (selectedProduct) {
      curPos = ref.series[selectedProduct]?.position[tickIdx] ?? 0;
    } else {
      for (const p of ref.products) curPos += ref.series[p].position[tickIdx] ?? 0;
    }

    const showProd = selectedProduct ?? ref.products[0];
    const micro = ref.series[showProd]?.microPrice[tickIdx] ?? NaN;

    const perProduct = ref.products
      .filter((p) => !selectedProduct || selectedProduct === p)
      .map((p) => {
        const arr = ref.series[p].pnl;
        let v = 0;
        for (let i = tickIdx; i >= 0; i--) {
          if (Number.isFinite(arr[i])) {
            v = arr[i];
            break;
          }
        }
        return { p, v };
      });

    const kpis = [
      {
        label: "Total PnL · live",
        value: `<span class="${totalAtTick >= 0 ? "positive" : "negative"}">${fmtSigned(totalAtTick)}</span>`,
      },
      {
        label: "Total PnL · final",
        value: `<span class="${finalTotal >= 0 ? "positive" : "negative"}">${fmtSigned(finalTotal)}</span>`,
      },
      {
        label: "Max Drawdown",
        value: `<span class="negative">−${fmtInt(ref.summary.maxDrawdown)}</span>`,
      },
      {
        label: `Position · ${selectedProduct ?? "net"}`,
        value: `<span class="${curPos === 0 ? "" : curPos > 0 ? "positive" : "negative"}">${fmtSigned(curPos, 0)}</span>`,
      },
      {
        label: `Microprice · ${showProd ?? "—"}`,
        value: fmtPrice(micro),
      },
      {
        label: "Trades",
        value: `<span class="num">${fmtInt(ref.summary.tradeCount)}</span>`,
      },
      ...(perProduct.length > 1
        ? perProduct.map((pp) => ({
            label: `PnL · ${pp.p}`,
            value: `<span class="${pp.v >= 0 ? "positive" : "negative"}">${fmtSigned(pp.v)}</span>`,
          }))
        : []),
    ];

    el.innerHTML = kpis
      .map(
        (k) => `
      <div class="kpi">
        <div class="kpi-label" title="${k.label}">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
      </div>
    `
      )
      .join("");
  }

  subscribe(render);
  render();
}
