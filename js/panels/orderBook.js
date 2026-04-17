import { subscribe, getState, getReference } from "../store.js";
import { fmtPrice } from "../format.js";

export function mountOrderBook({ bodyEl, titleEl, midSpreadEl }) {
  function render() {
    const state = getState();
    const ref = getReference(state);
    const product = state.selectedProduct ?? ref?.products[0] ?? null;
    titleEl.textContent = `Order Book ${product ? "· " + product : ""}`;
    if (!ref || !product) {
      bodyEl.innerHTML = `<div class="book-empty">No order book at this tick.</div>`;
      midSpreadEl.textContent = "";
      return;
    }
    const ps = ref.series[product];
    const tickIdx = state.tickIdx;
    const book = ps.books[tickIdx] ?? { bids: [], asks: [] };
    const bestBid = book.bids[0]?.price ?? NaN;
    const bestAsk = book.asks[0]?.price ?? NaN;
    const mid = ps.midPrice[tickIdx];
    const spread =
      Number.isFinite(bestBid) && Number.isFinite(bestAsk)
        ? bestAsk - bestBid
        : NaN;
    let maxVol = 0;
    for (const b of book.bids) maxVol = Math.max(maxVol, b.volume);
    for (const a of book.asks) maxVol = Math.max(maxVol, a.volume);

    midSpreadEl.textContent = `mid ${fmtPrice(mid)} · spread ${Number.isFinite(spread) ? spread.toFixed(1) : "—"}`;

    const askRows = [...book.asks]
      .reverse()
      .map((lvl, i) => {
        const level = book.asks.length - i;
        const pct = maxVol > 0 ? (lvl.volume / maxVol) * 100 : 0;
        return `
        <div class="book-row">
          <div class="book-bar ask" style="width:${pct}%"></div>
          <span class="book-level">L${level}</span>
          <span class="book-price-ask">${lvl.price.toFixed(1)}</span>
          <span class="book-qty">${lvl.volume}</span>
        </div>`;
      })
      .join("");
    const bidRows = book.bids
      .map((lvl, i) => {
        const pct = maxVol > 0 ? (lvl.volume / maxVol) * 100 : 0;
        return `
        <div class="book-row">
          <div class="book-bar bid" style="width:${pct}%"></div>
          <span class="book-level">L${i + 1}</span>
          <span class="book-price-bid">${lvl.price.toFixed(1)}</span>
          <span class="book-qty">${lvl.volume}</span>
        </div>`;
      })
      .join("");
    bodyEl.innerHTML = `
      ${askRows}
      <div class="book-mid-divider">
        <span class="num">${fmtPrice(mid)}</span>
        <span>mid</span>
        <span class="right num">spread ${Number.isFinite(spread) ? spread.toFixed(1) : "—"}</span>
      </div>
      ${bidRows}
    `;
  }

  subscribe(render);
  render();
}
