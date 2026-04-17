import { useEffect, useRef, type MutableRefObject } from "react";
import uPlot, { type AlignedData, type Options } from "uplot";

interface Props {
  data: AlignedData;
  options: Options;
  /**
   * Stable ref container that receives the current uPlot instance. Must be
   * the SAME ref across renders — don't inline `(u) => ...` or the chart will
   * rebuild on every render.
   */
  plotRef?: MutableRefObject<uPlot | null>;
}

/**
 * Thin wrapper around uPlot.
 *
 * Contract (hard-earned):
 * - Mount creates a uPlot instance once.
 * - `data` updates use setData().
 * - `options` updates rebuild the instance in place (uPlot has no
 *   setSeries/setScales — this is the simplest correct behavior).
 * - Parents must pass a stable `plotRef` (useRef) so this component's
 *   effects don't re-run every render.
 */
export function UPlotChart({ data, options, plotRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerPlotRef = useRef<uPlot | null>(null);
  // Mirror into parent's ref if provided
  if (plotRef && plotRef.current !== innerPlotRef.current) {
    plotRef.current = innerPlotRef.current;
  }

  // Build / rebuild chart when options change.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const u = new uPlot(
      {
        ...options,
        width: el.clientWidth || 400,
        height: el.clientHeight || 200,
      },
      data,
      el
    );
    innerPlotRef.current = u;
    if (plotRef) plotRef.current = u;

    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const p = innerPlotRef.current;
        if (!p) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w > 0 && h > 0 && (p.width !== w || p.height !== h)) {
          p.setSize({ width: w, height: h });
        }
      });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
      u.destroy();
      if (innerPlotRef.current === u) innerPlotRef.current = null;
      if (plotRef && plotRef.current === u) plotRef.current = null;
    };
    // We intentionally exclude `data` — data updates go through setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Push new data without rebuilding.
  useEffect(() => {
    const u = innerPlotRef.current;
    if (!u) return;
    u.setData(data);
  }, [data]);

  return <div ref={containerRef} className="h-full w-full" />;
}

/** Find the x-array index nearest to `x` and move the chart's crosshair. */
export function syncPlotCursorToX(u: uPlot | null, x: number) {
  if (!u) return;
  const xs = u.data[0] as number[];
  if (!xs || xs.length === 0) return;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  const left = u.valToPos(xs[lo], "x");
  if (Number.isFinite(left)) {
    u.setCursor({ left, top: 0 });
  }
}
