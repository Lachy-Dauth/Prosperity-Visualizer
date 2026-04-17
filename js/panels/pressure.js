import { subscribe, getState, getReference } from "../store.js";

export function mountPressure({ bodyEl, titleEl, valueEl }) {
  function render() {
    const state = getState();
    const ref = getReference(state);
    const product = state.selectedProduct ?? ref?.products[0] ?? null;
    titleEl.textContent = `Market Pressure ${product ? "· " + product : ""}`;
    if (!ref || !product) {
      bodyEl.innerHTML = `<div class="muted">—</div>`;
      valueEl.textContent = "";
      return;
    }
    const ps = ref.series[product];
    const imb = ps.imbalance[state.tickIdx];
    const bidV = ps.bidVol[state.tickIdx];
    const askV = ps.askVol[state.tickIdx];
    const pct = Number.isFinite(imb) ? imb * 100 : 50;
    valueEl.textContent = Number.isFinite(imb)
      ? `${pct.toFixed(0)}% bids`
      : "—";
    bodyEl.innerHTML = `
      <div class="pressure-scale">
        <span>Bids heavy ←</span><span>→ Asks heavy</span>
      </div>
      <div class="pressure-bar">
        <div class="pressure-fill" style="width:${pct}%"></div>
        <div class="pressure-mid"></div>
      </div>
      <div class="pressure-nums">
        <span><span class="dot-bid">●</span> ${Number.isFinite(bidV) ? bidV : "—"}</span>
        <span>${Number.isFinite(askV) ? askV : "—"} <span class="dot-ask">●</span></span>
      </div>
    `;
  }

  subscribe(render);
  render();
}
