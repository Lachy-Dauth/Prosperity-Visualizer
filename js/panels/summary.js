import {
  subscribe,
  getState,
  setReference,
  setComparing,
} from "../store.js";
import { fmtInt, fmtPct, fmtSigned } from "../format.js";
import { exportSummaryCsv, downloadBlob } from "../exporters.js";

const SORT_KEYS = [
  { key: "name", label: "Strategy", align: "left" },
  { key: "totalPnl", label: "Total PnL" },
  { key: "maxDrawdown", label: "Max DD" },
  { key: "maxAbsPosition", label: "Max |Pos|" },
  { key: "tradeCount", label: "Trades" },
  { key: "winRate", label: "Win %" },
  { key: "sharpe", label: "Sharpe" },
];

export function mountSummary({ bodyEl, exportBtn }) {
  let sort = { key: "totalPnl", dir: -1 };

  exportBtn.addEventListener("click", () => {
    const { strategies } = getState();
    if (!strategies.length) return;
    downloadBlob(
      `prosperity-summary-${Date.now()}.csv`,
      exportSummaryCsv(strategies),
      "text/csv"
    );
  });

  bodyEl.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const th = target.closest("th[data-sort]");
    if (th) {
      const k = th.dataset.sort;
      sort =
        sort.key === k
          ? { key: k, dir: sort.dir * -1 }
          : { key: k, dir: -1 };
      render();
      return;
    }
    const row = target.closest("tr[data-id]");
    if (!row) return;
    const id = row.dataset.id;
    if (e.shiftKey) {
      const { comparingIds } = getState();
      setComparing(id, !comparingIds.has(id));
    } else {
      setReference(id);
    }
  });

  function render() {
    const { strategies, referenceId, comparingIds } = getState();
    const products = Array.from(
      new Set(strategies.flatMap((s) => s.products))
    ).sort();

    const sorted = [...strategies].sort((a, b) => {
      const va = getSort(a, sort.key);
      const vb = getSort(b, sort.key);
      if (typeof va === "string" && typeof vb === "string")
        return va.localeCompare(vb) * sort.dir;
      return (va - vb) * sort.dir;
    });

    const header = SORT_KEYS.map(
      (c) =>
        `<th class="${c.align === "left" ? "left" : ""}" data-sort="${c.key}">${c.label}${sort.key === c.key ? (sort.dir < 0 ? " ↓" : " ↑") : ""}</th>`
    ).join("");
    const productHeader = products
      .map(
        (p) =>
          `<th title="${escapeHtml(p)}">${escapeHtml(p.length > 6 ? p.slice(0, 6) + "…" : p)}</th>`
      )
      .join("");

    let rows;
    if (sorted.length === 0) {
      rows = `<tr><td class="empty" colspan="${8 + products.length}">Load logs to compare.</td></tr>`;
    } else {
      rows = sorted
        .map((s) => {
          const isRef = s.id === referenceId;
          const isCmp = comparingIds.has(s.id);
          const pnlClass = s.summary.totalPnl >= 0 ? "positive" : "negative";
          const productCells = products
            .map((p) => {
              const v = s.summary.perProductPnl[p];
              if (v === undefined)
                return `<td class="muted">—</td>`;
              return `<td class="num ${v >= 0 ? "positive" : "negative"}">${fmtSigned(v, 0)}</td>`;
            })
            .join("");
          return `
            <tr class="${isRef ? "ref" : ""}" data-id="${s.id}" style="box-shadow: inset 3px 0 0 ${s.color}">
              <td class="left name-cell">${escapeHtml(s.name)}${isRef ? '<span class="badge-mini">REF</span>' : ""}${!isRef && isCmp ? '<span class="badge-mini muted">cmp</span>' : ""}</td>
              <td class="num ${pnlClass}">${fmtSigned(s.summary.totalPnl, 0)}</td>
              <td class="num negative">−${fmtInt(s.summary.maxDrawdown)}</td>
              <td class="num">${fmtInt(s.summary.maxAbsPosition)}</td>
              <td class="num">${fmtInt(s.summary.tradeCount)}</td>
              <td class="num">${fmtPct(s.summary.winRate, 0)}</td>
              <td class="num">${Number.isFinite(s.summary.sharpe) ? s.summary.sharpe.toFixed(2) : "—"}</td>
              ${productCells}
            </tr>
          `;
        })
        .join("");
    }

    bodyEl.innerHTML = `
      <table class="data">
        <thead><tr>
          <th></th>
          ${header.replace('<th class="left" data-sort="name">', '<th class="left" data-sort="name">')}
          ${productHeader}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${sorted.length > 0 ? `<div class="muted tiny" style="padding:6px 10px">click row = ref · shift-click = toggle compare</div>` : ""}
    `;
  }

  subscribe((state, prev) => {
    if (
      state.strategies === prev.strategies &&
      state.referenceId === prev.referenceId &&
      state.comparingIds === prev.comparingIds
    )
      return;
    render();
  });
  render();
}

function getSort(s, key) {
  if (key === "name") return s.name;
  return s.summary[key] ?? 0;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
