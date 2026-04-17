import { useMemo, useState } from "react";
import { useStore } from "../../lib/store";
import { downloadBlob, exportSummaryCsv } from "../../lib/exporters";
import { DownloadIcon } from "../Icons";
import { fmtInt, fmtPct, fmtSigned } from "../../lib/format";
import type { ParsedStrategy } from "../../types";

type SortKey =
  | "name"
  | "totalPnl"
  | "maxDrawdown"
  | "maxAbsPosition"
  | "tradeCount"
  | "winRate"
  | "sharpe";

export function SummaryTablePanel() {
  const strategies = useStore((s) => s.strategies);
  const refId = useStore((s) => s.referenceId);
  const comparing = useStore((s) => s.comparingIds);
  const setReference = useStore((s) => s.setReference);
  const setComparing = useStore((s) => s.setComparing);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "totalPnl",
    dir: -1,
  });

  const sorted = useMemo(() => {
    const out = [...strategies];
    out.sort((a, b) => {
      const va = getSortVal(a, sort.key);
      const vb = getSortVal(b, sort.key);
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * sort.dir;
      }
      return ((va as number) - (vb as number)) * sort.dir;
    });
    return out;
  }, [strategies, sort]);

  const products = useMemo(
    () => Array.from(new Set(strategies.flatMap((s) => s.products))).sort(),
    [strategies]
  );

  function header(label: string, key: SortKey, align: "left" | "right" = "right") {
    const active = sort.key === key;
    return (
      <th
        className={`cursor-pointer select-none px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 ${
          align === "right" ? "text-right" : "text-left"
        }`}
        onClick={() =>
          setSort((cur) =>
            cur.key === key
              ? { key, dir: (cur.dir * -1) as 1 | -1 }
              : { key, dir: -1 }
          )
        }
      >
        {label}
        {active ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
      </th>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="panel-header">
        <span>Strategy Comparison</span>
        <button
          className="btn !px-1.5 !py-0.5"
          title="Export CSV"
          disabled={strategies.length === 0}
          onClick={() =>
            downloadBlob(
              `prosperity-summary-${Date.now()}.csv`,
              exportSummaryCsv(strategies),
              "text/csv"
            )
          }
        >
          <DownloadIcon />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-950">
            <tr>
              <th className="px-2 py-1 text-left text-[10px] text-zinc-500">·</th>
              {header("Strategy", "name", "left")}
              {header("Total PnL", "totalPnl")}
              {header("Max DD", "maxDrawdown")}
              {header("Max |Pos|", "maxAbsPosition")}
              {header("Trades", "tradeCount")}
              {header("Win %", "winRate")}
              {header("Sharpe", "sharpe")}
              {products.map((p) => (
                <th
                  key={p}
                  className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-zinc-500"
                  title={p}
                >
                  {p.length > 6 ? p.slice(0, 6) + "…" : p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={8 + products.length}
                  className="p-4 text-center text-zinc-500"
                >
                  Load logs to compare.
                </td>
              </tr>
            ) : (
              sorted.map((s) => {
                const isRef = s.id === refId;
                const isCmp = comparing.has(s.id);
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-zinc-900 transition-colors ${
                      isRef ? "bg-accent-700/10" : "hover:bg-zinc-900"
                    }`}
                    style={{ boxShadow: `inset 3px 0 0 ${s.color}` }}
                    onClick={(e) => {
                      if (e.shiftKey) setComparing(s.id, !isCmp);
                      else setReference(s.id);
                    }}
                  >
                    <td className="px-2 py-1">
                      <span
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{ backgroundColor: s.color }}
                      />
                    </td>
                    <td className="max-w-[180px] truncate px-2 py-1 font-medium text-zinc-200">
                      {s.name}
                      {isRef && <span className="ml-1 text-[9px] text-accent-400">REF</span>}
                      {isCmp && !isRef && (
                        <span className="ml-1 text-[9px] text-zinc-500">cmp</span>
                      )}
                    </td>
                    <td
                      className={`num px-2 py-1 text-right ${
                        s.summary.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {fmtSigned(s.summary.totalPnl, 0)}
                    </td>
                    <td className="num px-2 py-1 text-right text-rose-400">
                      −{fmtInt(s.summary.maxDrawdown)}
                    </td>
                    <td className="num px-2 py-1 text-right text-zinc-300">
                      {fmtInt(s.summary.maxAbsPosition)}
                    </td>
                    <td className="num px-2 py-1 text-right text-zinc-300">
                      {fmtInt(s.summary.tradeCount)}
                    </td>
                    <td className="num px-2 py-1 text-right text-zinc-300">
                      {fmtPct(s.summary.winRate, 0)}
                    </td>
                    <td className="num px-2 py-1 text-right text-zinc-300">
                      {Number.isFinite(s.summary.sharpe)
                        ? s.summary.sharpe.toFixed(2)
                        : "—"}
                    </td>
                    {products.map((p) => {
                      const v = s.summary.perProductPnl[p];
                      if (v === undefined)
                        return (
                          <td key={p} className="px-2 py-1 text-right text-zinc-700">
                            —
                          </td>
                        );
                      return (
                        <td
                          key={p}
                          className={`num px-2 py-1 text-right ${
                            v >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {fmtSigned(v, 0)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {strategies.length > 0 && (
          <div className="px-3 py-1.5 text-[10px] text-zinc-600">
            click row to set as reference · shift-click to toggle comparing
          </div>
        )}
      </div>
    </div>
  );
}

function getSortVal(s: ParsedStrategy, key: SortKey): number | string {
  switch (key) {
    case "name":
      return s.name;
    case "totalPnl":
      return s.summary.totalPnl;
    case "maxDrawdown":
      return s.summary.maxDrawdown;
    case "maxAbsPosition":
      return s.summary.maxAbsPosition;
    case "tradeCount":
      return s.summary.tradeCount;
    case "winRate":
      return s.summary.winRate;
    case "sharpe":
      return s.summary.sharpe;
  }
}
