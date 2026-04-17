import {
  subscribe,
  getState,
  getReference,
  setFillsShowAll,
} from "../store.js";

export function mountOwnFills({ bodyEl, titleEl, showAllInput }) {
  showAllInput.addEventListener("change", (e) =>
    setFillsShowAll(e.target.checked)
  );

  function render() {
    const state = getState();
    const ref = getReference(state);
    showAllInput.checked = state.fillsShowAll;
    titleEl.textContent = `Own Fills ${state.fillsShowAll ? "· all" : "· ±500 ts"}`;

    if (!ref) {
      bodyEl.innerHTML = `<div class="muted" style="padding:12px;text-align:center">No strategy loaded.</div>`;
      return;
    }
    const tickIdx = state.tickIdx;
    const rawTs = ref.rawTimestamps[tickIdx] ?? 0;
    let fills = ref.ownFills;
    if (state.selectedProduct)
      fills = fills.filter((f) => f.product === state.selectedProduct);
    if (!state.fillsShowAll) {
      const lo = rawTs - 500;
      const hi = rawTs + 500;
      fills = fills.filter((f) => f.timestamp >= lo && f.timestamp <= hi);
    }

    const rows =
      fills.length === 0
        ? `<tr><td class="empty" colspan="6">No fills in this window.</td></tr>`
        : fills
            .map(
              (f) => `
      <tr class="fills-row-${f.side}">
        <td class="left num muted">${f.timestamp}</td>
        <td class="left side">${f.side.toUpperCase()}</td>
        <td class="left">${f.product}</td>
        <td class="num">${f.price.toFixed(1)}</td>
        <td class="num">${f.quantity}</td>
        <td class="num ${f.cashFlow >= 0 ? "positive" : "negative"}">${f.cashFlow >= 0 ? "+" : ""}${f.cashFlow.toFixed(0)}</td>
      </tr>
    `
            )
            .join("");

    bodyEl.innerHTML = `
      <table class="data">
        <thead>
          <tr>
            <th class="left">TS</th>
            <th class="left">Side</th>
            <th class="left">Product</th>
            <th>Price</th>
            <th>Qty</th>
            <th>Cash</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  subscribe(render);
  render();
}
