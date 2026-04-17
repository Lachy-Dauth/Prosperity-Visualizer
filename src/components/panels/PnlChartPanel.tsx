import { useEffect, useMemo, useRef } from "react";
import type uPlot from "uplot";
import type { AlignedData, Options } from "uplot";
import { useStore } from "../../lib/store";
import { lttb } from "../../lib/downsample";
import { downloadCanvasPng } from "../../lib/exporters";
import { UPlotChart, syncPlotCursorToX } from "../UPlotChart";
import { DownloadIcon } from "../Icons";

const TARGET_POINTS = 1500;

export function PnlChartPanel() {
  const strategies = useStore((s) => s.strategies);
  const referenceId = useStore((s) => s.referenceId);
  const comparingIds = useStore((s) => s.comparingIds);
  const tickIdx = useStore((s) => s.tickIdx);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);

  const refStrat = strategies.find((s) => s.id === referenceId) ?? null;

  const handleRef = useRef<uPlot | null>(null);

  const { data, options } = useMemo(() => {
    if (!refStrat) {
      const opts: Options = {
        width: 400,
        height: 200,
        legend: { show: false },
        scales: { x: { time: false } },
        series: [{}, { label: "PnL" }],
        axes: defaultAxes(),
      };
      return { data: [[], []] as AlignedData, options: opts };
    }

    const compareList = strategies.filter(
      (s) => comparingIds.has(s.id) && s.id !== refStrat.id
    );
    const seriesArr: { name: string; color: string; xs: number[]; ys: number[] }[] = [];
    const refStratLocal = refStrat;
    const refXsRaw = refStratLocal.timestamps;
    const refYsRaw = refStratLocal.totalPnl;

    function project(strat: typeof refStratLocal): { xs: number[]; ys: number[] } {
      const xsBase = prefs.normalizedX
        ? strat.timestamps.map((_, i) =>
            strat.timestamps.length > 1 ? i / (strat.timestamps.length - 1) : 0
          )
        : strat.timestamps;
      let ys = strat.totalPnl;
      if (prefs.diffMode && strat.id !== refStratLocal.id) {
        const out = new Array<number>(xsBase.length);
        if (prefs.normalizedX) {
          for (let i = 0; i < xsBase.length; i++) {
            const t = xsBase[i];
            const refIdx = Math.min(
              refXsRaw.length - 1,
              Math.round(t * (refXsRaw.length - 1))
            );
            out[i] = ys[i] - refYsRaw[refIdx];
          }
        } else {
          let j = 0;
          for (let i = 0; i < xsBase.length; i++) {
            while (j + 1 < refXsRaw.length && refXsRaw[j + 1] <= xsBase[i]) j++;
            out[i] = ys[i] - refYsRaw[j];
          }
        }
        ys = out;
      }
      return prefs.showSampled ? lttb(xsBase, ys, TARGET_POINTS) : { xs: xsBase, ys };
    }

    seriesArr.push({
      name: refStratLocal.name + " (ref)",
      color: refStratLocal.color,
      ...project(refStratLocal),
    });
    for (const s of compareList) {
      seriesArr.push({ name: s.name, color: s.color, ...project(s) });
    }

    const baseXs = seriesArr.reduce(
      (best, s) => (s.xs.length > best.length ? s.xs : best),
      seriesArr[0]?.xs ?? []
    );
    const ysMatrix: (number | null)[][] = seriesArr.map((s) => {
      const out = new Array<number | null>(baseXs.length).fill(null);
      let j = 0;
      for (let i = 0; i < baseXs.length; i++) {
        while (j + 1 < s.xs.length && s.xs[j + 1] <= baseXs[i]) j++;
        out[i] = s.ys[j];
      }
      return out;
    });

    const data: AlignedData = [baseXs, ...ysMatrix] as AlignedData;
    const series: Options["series"] = [
      { label: prefs.normalizedX ? "Progress" : "Timestamp" },
      ...seriesArr.map((s, i) => ({
        label: s.name,
        stroke: s.color,
        width: i === 0 ? 2.2 : 1.2,
        points: { show: false },
      })),
    ];

    const opts: Options = {
      width: 400,
      height: 200,
      legend: { show: true, live: true },
      cursor: { focus: { prox: 16 }, sync: { key: "prosperity" } },
      scales: { x: { time: false }, y: { auto: true } },
      series,
      axes: defaultAxes(prefs.normalizedX ? "%" : ""),
    };
    return { data, options: opts };
  }, [refStrat, strategies, comparingIds, prefs.diffMode, prefs.normalizedX, prefs.showSampled]);

  // Sync crosshair on scrub — side effect, so useEffect not useMemo.
  useEffect(() => {
    if (!refStrat) return;
    const target = prefs.normalizedX
      ? refStrat.timestamps.length > 1
        ? tickIdx / (refStrat.timestamps.length - 1)
        : 0
      : refStrat.timestamps[tickIdx] ?? 0;
    handleRef.current &&
      syncPlotCursorToX(handleRef.current, target);
  }, [tickIdx, refStrat, prefs.normalizedX]);

  return (
    <div className="flex h-full flex-col">
      <div className="panel-header">
        <span>PnL Performance</span>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 normal-case tracking-normal text-zinc-400">
            <input
              type="checkbox"
              checked={prefs.normalizedX}
              onChange={(e) => setPrefs({ normalizedX: e.target.checked })}
              className="h-3 w-3 accent-accent-500"
            />
            normalize x
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1 normal-case tracking-normal text-zinc-400">
            <input
              type="checkbox"
              checked={prefs.diffMode}
              onChange={(e) => setPrefs({ diffMode: e.target.checked })}
              className="h-3 w-3 accent-accent-500"
            />
            diff vs ref
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1 normal-case tracking-normal text-zinc-400">
            <input
              type="checkbox"
              checked={prefs.showSampled}
              onChange={(e) => setPrefs({ showSampled: e.target.checked })}
              className="h-3 w-3 accent-accent-500"
            />
            sampled
          </label>
          <button
            className="btn !px-1.5 !py-0.5"
            title="Export PNG"
            onClick={() => {
              const u = handleRef.current;
              if (!u) return;
              const c = (u.root as HTMLElement).querySelector("canvas");
              if (c instanceof HTMLCanvasElement) {
                downloadCanvasPng(c, "pnl-performance.png");
              }
            }}
          >
            <DownloadIcon />
          </button>
        </div>
      </div>
      <div className="relative flex-1">
        <UPlotChart plotRef={handleRef} data={data} options={options} />
      </div>
    </div>
  );
}

function defaultAxes(xSuffix = ""): Options["axes"] {
  return [
    {
      stroke: "#71717a",
      grid: { stroke: "#27272a", width: 0.5 },
      ticks: { stroke: "#27272a" },
      values: (_u, splits) =>
        splits.map((v) =>
          xSuffix === "%" ? (v * 100).toFixed(0) + "%" : Math.round(v).toLocaleString()
        ),
    },
    {
      stroke: "#71717a",
      grid: { stroke: "#27272a", width: 0.5 },
      ticks: { stroke: "#27272a" },
    },
  ];
}
