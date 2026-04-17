import { useEffect, useMemo, useRef } from "react";
import type uPlot from "uplot";
import type { AlignedData, Options } from "uplot";
import { useStore, getReferenceStrategy } from "../../lib/store";
import { lttb } from "../../lib/downsample";
import { UPlotChart, syncPlotCursorToX } from "../UPlotChart";

export function PriceChartPanel() {
  const ref = useStore(getReferenceStrategy);
  const selectedProduct = useStore((s) => s.selectedProduct);
  const sampled = useStore((s) => s.prefs.showSampled);
  const handleRef = useRef<uPlot | null>(null);

  const product = selectedProduct ?? ref?.products[0] ?? null;

  const { data, options } = useMemo(() => {
    if (!ref || !product) {
      return {
        data: [[], []] as AlignedData,
        options: {
          width: 400,
          height: 200,
          series: [{}, { label: "" }],
          axes: defaultAxes(),
        } as Options,
      };
    }
    const ps = ref.series[product];
    const xs = ps.timestamps;
    const targetPts = sampled ? 1500 : xs.length;
    const project = (ys: number[]) => lttb(xs, ys, targetPts);
    const a = project(ps.bestAsk);
    const b = project(ps.bestBid);
    const m = project(ps.midPrice);
    const mp = project(ps.microPrice);
    const baseXs = m.xs;
    const data: AlignedData = [baseXs, a.ys, b.ys, m.ys, mp.ys] as AlignedData;
    const opts: Options = {
      width: 400,
      height: 200,
      legend: { show: true, live: true },
      cursor: { focus: { prox: 16 }, drag: { x: false, y: false } },
      scales: { x: { time: false }, y: { auto: true } },
      series: [
        { label: "Timestamp" },
        { label: "Best ask", stroke: "#f87171", width: 1, points: { show: false } },
        { label: "Best bid", stroke: "#34d399", width: 1, points: { show: false } },
        { label: "Mid", stroke: "#a78bfa", width: 1.6, points: { show: false } },
        {
          label: "Microprice",
          stroke: "#2dd4bf",
          width: 1.2,
          dash: [4, 3],
          points: { show: false },
        },
      ],
      axes: defaultAxes(),
    };
    return { data, options: opts };
  }, [ref, product, sampled]);

  // Cursor sync via direct store subscription so scrubbing doesn't
  // re-render this panel on every tick.
  useEffect(() => {
    if (!ref) return;
    const timestamps = ref.timestamps;
    syncPlotCursorToX(
      handleRef.current,
      timestamps[useStore.getState().tickIdx] ?? 0
    );
    return useStore.subscribe((state, prev) => {
      if (state.tickIdx !== prev.tickIdx) {
        syncPlotCursorToX(handleRef.current, timestamps[state.tickIdx] ?? 0);
      }
    });
  }, [ref]);

  return (
    <div className="flex h-full flex-col">
      <div className="panel-header">
        <span>Price &amp; Liquidity {product ? `· ${product}` : ""}</span>
      </div>
      <div className="flex-1">
        {ref && product ? (
          <UPlotChart plotRef={handleRef} data={data} options={options} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            {ref ? "Select a product." : "Load a log to see prices."}
          </div>
        )}
      </div>
    </div>
  );
}

function defaultAxes(): Options["axes"] {
  return [
    {
      stroke: "#71717a",
      grid: { stroke: "#27272a", width: 0.5 },
      ticks: { stroke: "#27272a" },
      values: (_u, splits) => splits.map((v) => Math.round(v).toLocaleString()),
    },
    {
      stroke: "#71717a",
      grid: { stroke: "#27272a", width: 0.5 },
      ticks: { stroke: "#27272a" },
      values: (_u, splits) => splits.map((v) => v.toFixed(1)),
    },
  ];
}
