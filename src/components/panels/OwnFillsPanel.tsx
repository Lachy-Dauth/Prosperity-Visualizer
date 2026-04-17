import { useMemo, useState } from "react";
import { useStore, getReferenceStrategy } from "../../lib/store";
import type { OwnFill } from "../../types";

export function OwnFillsPanel() {
  const ref = useStore(getReferenceStrategy);
  const tickIdx = useStore((s) => s.tickIdx);
  const selectedProduct = useStore((s) => s.selectedProduct);
  const [showAll, setShowAll] = useState(false);

  const filtered: OwnFill[] = useMemo(() => {
    if (!ref) return [];
    const rawTs = ref.rawTimestamps[tickIdx] ?? 0;
    let out = ref.ownFills;
    if (selectedProduct) out = out.filter((f) => f.product === selectedProduct);
    if (!showAll) {
      // ±5 tick window around current raw timestamp (each tick = 100)
      const lo = rawTs - 500;
      const hi = rawTs + 500;
      out = out.filter((f) => f.timestamp >= lo && f.timestamp <= hi);
    }
    return out;
  }, [ref, tickIdx, selectedProduct, showAll]);

  if (!ref) {
    return <div className="p-3 text-xs text-zinc-500">No strategy loaded.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="panel-header">
        <span>Own Fills {showAll ? "· all" : "· ±500 ts"}</span>
        <label className="inline-flex cursor-pointer items-center gap-1 normal-case tracking-normal text-zinc-400">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-3 w-3 accent-accent-500"
          />
          show all
        </label>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-950 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-2 py-1 text-left">TS</th>
              <th className="px-2 py-1 text-left">Side</th>
              <th className="px-2 py-1 text-left">Product</th>
              <th className="px-2 py-1 text-right">Price</th>
              <th className="px-2 py-1 text-right">Qty</th>
              <th className="px-2 py-1 text-right">Cash</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-3 text-center text-zinc-500">
                  No fills in this window.
                </td>
              </tr>
            ) : (
              filtered.map((f, i) => (
                <tr key={i} className="border-b border-zinc-900 hover:bg-zinc-900">
                  <td className="num px-2 py-0.5 text-zinc-400">{f.timestamp}</td>
                  <td className="px-2 py-0.5">
                    <span
                      className={
                        f.side === "buy" ? "text-emerald-400" : "text-rose-400"
                      }
                    >
                      {f.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 text-zinc-300">{f.product}</td>
                  <td className="num px-2 py-0.5 text-right text-zinc-200">
                    {f.price.toFixed(1)}
                  </td>
                  <td className="num px-2 py-0.5 text-right text-zinc-200">
                    {f.quantity}
                  </td>
                  <td
                    className={`num px-2 py-0.5 text-right ${
                      f.cashFlow >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {f.cashFlow >= 0 ? "+" : ""}
                    {f.cashFlow.toFixed(0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
