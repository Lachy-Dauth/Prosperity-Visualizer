import { useEffect, useMemo, useRef } from "react";
import type uPlot from "uplot";
import type { AlignedData, Options } from "uplot";
import { useStore } from "../../lib/store";
import { lttb } from "../../lib/downsample";
import { UPlotChart, syncPlotCursorToX } from "../UPlotChart";
import type { ParsedStrategy } from "../../types";

export function PositionChartPanel() {
  const strategies = useStore((s) => s.strategies);
  const refId = useStore((s) => s.referenceId);
  const comparing = useStore((s) => s.comparingIds);
  const selectedProduct = useStore((s) => s.selectedProduct);
  const tickIdx = useStore((s) => s.tickIdx);
  const sampled = useStore((s) => s.prefs.showSampled);
  const handleRef = useRef<uPlot | null>(null);

  const ref = strategies.find((s) => s.id === refId) ?? null;
  const product = selectedProduct ?? ref?.products[0] ?? null;
  const limit: number = ref && product ? ref.positionLimits[product] ?? 50 : 50;
  const limitRef = useRef(limit);
  limitRef.current = limit;

  const { data, options } = useMemo(() => {
    if (!ref || !product) {
      return {
        data: [[], []] as AlignedData,
        options: { width: 400, height: 200, series: [{}, {}], axes: defAxes() } as Options,
      };
    }
    const prod = product;
    const seriesArr: { name: string; color: string; xs: number[]; ys: number[] }[] = [];
    function add(s: ParsedStrategy) {
      if (!s.series[prod]) return;
      const xs = s.timestamps;
      const ys = s.series[prod].position;
      const target = sampled ? 1200 : xs.length;
      const r = lttb(xs, ys, target);
      seriesArr.push({ name: s.name, color: s.color, xs: r.xs, ys: r.ys });
    }
    add(ref);
    for (const s of strategies) {
      if (s.id === ref.id) continue;
      if (!comparing.has(s.id)) continue;
      add(s);
    }

    const baseXs = seriesArr.reduce(
      (best, s) => (s.xs.length > best.length ? s.xs : best),
      seriesArr[0]?.xs ?? []
    );
    const ys = seriesArr.map((s) => {
      const out = new Array<number | null>(baseXs.length).fill(null);
      let j = 0;
      for (let i = 0; i < baseXs.length; i++) {
        while (j + 1 < s.xs.length && s.xs[j + 1] <= baseXs[i]) j++;
        out[i] = s.ys[j];
      }
      return out;
    });

    const data = [baseXs, ...ys] as AlignedData;
    const opts: Options = {
      width: 400,
      height: 200,
      legend: { show: true, live: true },
      cursor: { focus: { prox: 16 }, sync: { key: "prosperity" } },
      scales: { x: { time: false }, y: { auto: true } },
      series: [
        { label: "Timestamp" },
        ...seriesArr.map((s, i) => ({
          label: s.name,
          stroke: s.color,
          width: i === 0 ? 2 : 1,
          points: { show: false },
        })),
      ],
      axes: defAxes(),
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx;
            const lim = limitRef.current;
            const top = u.valToPos(lim, "y", true);
            const bot = u.valToPos(-lim, "y", true);
            const left = u.bbox.left;
            const right = u.bbox.left + u.bbox.width;
            ctx.save();
            ctx.strokeStyle = "rgba(244,63,94,0.5)";
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(left, top);
            ctx.lineTo(right, top);
            ctx.moveTo(left, bot);
            ctx.lineTo(right, bot);
            ctx.stroke();
            ctx.restore();
          },
        ],
      },
    };
    return { data, options: opts };
  }, [ref, product, strategies, comparing, sampled]);

  useEffect(() => {
    if (!ref) return;
    syncPlotCursorToX(handleRef.current, ref.timestamps[tickIdx] ?? 0);
  }, [tickIdx, ref]);

  // Redraw when the user changes the limit (band is drawn from limitRef).
  useEffect(() => {
    handleRef.current?.redraw();
  }, [limit]);

  const setLimit = useStore((s) => s.setPositionLimit);

  return (
    <div className="flex h-full flex-col">
      <div className="panel-header">
        <span>Position {product ? `· ${product}` : ""}</span>
        {ref && product && (
          <label className="flex items-center gap-1 normal-case tracking-normal text-zinc-400">
            limit ±
            <input
              type="number"
              value={limit}
              min={1}
              max={9999}
              onChange={(e) => setLimit(ref.id, product, Number(e.target.value) || 1)}
              className="input w-16 !py-0.5"
            />
          </label>
        )}
      </div>
      <div className="flex-1">
        <UPlotChart plotRef={handleRef} data={data} options={options} />
      </div>
    </div>
  );
}

function defAxes(): Options["axes"] {
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
    },
  ];
}
