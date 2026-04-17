/**
 * Vanilla Canvas line chart.
 *
 * Usage:
 *   const chart = createChart(canvasElement);
 *   chart.setData({
 *     xLabel: "Timestamp",
 *     yLabel: "",
 *     xFormat: (v) => v.toString(),
 *     yFormat: (v) => v.toFixed(1),
 *     series: [
 *       { name, color, xs, ys, width, dash }
 *     ],
 *     limitLines: [{ value: 50, color: "#f00", dash: [3,3] }],
 *   });
 *   chart.setCursorX(x);   // programmatic crosshair
 *
 * Coordinates match uPlot's data[0]=xs, data[1..]=ys model.
 */

const DPR = window.devicePixelRatio || 1;

export function createChart(canvas) {
  const ctx = canvas.getContext("2d");

  /** @type {{
   *   xLabel: string, yLabel: string,
   *   xFormat: (v:number)=>string, yFormat: (v:number)=>string,
   *   series: Array<{name:string,color:string,xs:number[],ys:(number|null)[],width?:number,dash?:number[]}>,
   *   limitLines?: Array<{value:number,color:string,dash?:number[]}>,
   * }} */
  let model = null;
  let cursorX = null;
  let hoverLogicalX = null; // mouse-follow cursor in data coords
  let lastSize = { w: 0, h: 0 };
  let resizeRaf = null;

  // Current drawing rectangle in CSS pixels.
  let plot = { left: 40, top: 8, width: 0, height: 0 };
  const AXIS_COLOR = "#71717a";
  const GRID_COLOR = "#27272a";
  const MUTED_TEXT = "#a1a1aa";

  // Observe container size
  const ro = new ResizeObserver(() => {
    if (resizeRaf != null) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      render();
    });
  });
  ro.observe(canvas);

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < plot.left || px > plot.left + plot.width) {
      if (hoverLogicalX !== null) {
        hoverLogicalX = null;
        render();
      }
      return;
    }
    if (!model || !model.series.length) return;
    const xmin = model._xmin;
    const xmax = model._xmax;
    hoverLogicalX = xmin + ((px - plot.left) / plot.width) * (xmax - xmin);
    render();
  });
  canvas.addEventListener("mouseleave", () => {
    hoverLogicalX = null;
    render();
  });

  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(100, Math.round(rect.width));
    const h = Math.max(80, Math.round(rect.height));
    if (w !== lastSize.w || h !== lastSize.h) {
      canvas.width = Math.round(w * DPR);
      canvas.height = Math.round(h * DPR);
      lastSize = { w, h };
    }
    return { w, h };
  }

  function computeBounds() {
    let xmin = Infinity,
      xmax = -Infinity,
      ymin = Infinity,
      ymax = -Infinity;
    for (const s of model.series) {
      const xs = s.xs;
      const ys = s.ys;
      const len = Math.min(xs.length, ys.length);
      for (let i = 0; i < len; i++) {
        const x = xs[i];
        const y = ys[i];
        if (Number.isFinite(x)) {
          if (x < xmin) xmin = x;
          if (x > xmax) xmax = x;
        }
        if (Number.isFinite(y)) {
          if (y < ymin) ymin = y;
          if (y > ymax) ymax = y;
        }
      }
    }
    if (model.limitLines) {
      for (const l of model.limitLines) {
        if (Number.isFinite(l.value)) {
          if (l.value < ymin) ymin = l.value;
          if (l.value > ymax) ymax = l.value;
        }
      }
    }
    if (!Number.isFinite(xmin) || !Number.isFinite(xmax)) {
      xmin = 0;
      xmax = 1;
    }
    if (xmin === xmax) xmax = xmin + 1;
    if (!Number.isFinite(ymin) || !Number.isFinite(ymax)) {
      ymin = 0;
      ymax = 1;
    }
    if (ymin === ymax) {
      const pad = Math.abs(ymin) * 0.05 || 1;
      ymin -= pad;
      ymax += pad;
    } else {
      const pad = (ymax - ymin) * 0.06;
      ymin -= pad;
      ymax += pad;
    }
    model._xmin = xmin;
    model._xmax = xmax;
    model._ymin = ymin;
    model._ymax = ymax;
  }

  function niceStep(span, targetTicks) {
    const rough = span / Math.max(1, targetTicks);
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const n = rough / pow;
    let step;
    if (n < 1.5) step = 1;
    else if (n < 3) step = 2;
    else if (n < 7) step = 5;
    else step = 10;
    return step * pow;
  }

  function render() {
    if (!model) {
      const { w, h } = sizeCanvas();
      ctx.save();
      ctx.scale(DPR, DPR);
      ctx.clearRect(0, 0, w, h);
      ctx.restore();
      return;
    }
    const { w, h } = sizeCanvas();
    computeBounds();

    ctx.save();
    ctx.scale(DPR, DPR);
    ctx.clearRect(0, 0, w, h);

    // Layout
    plot = { left: 48, top: 8, width: w - 54, height: h - 28 };
    if (plot.width < 20 || plot.height < 20) {
      ctx.restore();
      return;
    }

    const { _xmin: xmin, _xmax: xmax, _ymin: ymin, _ymax: ymax } = model;
    const px = (x) => plot.left + ((x - xmin) / (xmax - xmin)) * plot.width;
    const py = (y) =>
      plot.top + plot.height - ((y - ymin) / (ymax - ymin)) * plot.height;

    // Grid + axes
    ctx.lineWidth = 1;
    ctx.strokeStyle = GRID_COLOR;
    ctx.fillStyle = AXIS_COLOR;
    ctx.font =
      "10px JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "middle";

    const yStep = niceStep(ymax - ymin, 5);
    const yStart = Math.ceil(ymin / yStep) * yStep;
    ctx.beginPath();
    for (let v = yStart; v <= ymax; v += yStep) {
      const y = Math.round(py(v)) + 0.5;
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + plot.width, y);
    }
    ctx.stroke();

    ctx.textAlign = "right";
    for (let v = yStart; v <= ymax; v += yStep) {
      const y = py(v);
      ctx.fillText(model.yFormat(v), plot.left - 6, y);
    }

    const xStep = niceStep(xmax - xmin, 6);
    const xStart = Math.ceil(xmin / xStep) * xStep;
    ctx.beginPath();
    for (let v = xStart; v <= xmax; v += xStep) {
      const x = Math.round(px(v)) + 0.5;
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.height);
    }
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let v = xStart; v <= xmax; v += xStep) {
      const x = px(v);
      ctx.fillText(model.xFormat(v), x, plot.top + plot.height + 4);
    }

    // Limit lines
    if (model.limitLines) {
      ctx.save();
      for (const l of model.limitLines) {
        if (!Number.isFinite(l.value)) continue;
        ctx.strokeStyle = l.color;
        ctx.lineWidth = 1;
        if (l.dash) ctx.setLineDash(l.dash);
        const y = Math.round(py(l.value)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(plot.left, y);
        ctx.lineTo(plot.left + plot.width, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // Series
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    for (const s of model.series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width ?? 1.2;
      if (s.dash) ctx.setLineDash(s.dash);
      ctx.beginPath();
      let penDown = false;
      const xs = s.xs;
      const ys = s.ys;
      const len = Math.min(xs.length, ys.length);
      for (let i = 0; i < len; i++) {
        const y = ys[i];
        if (!Number.isFinite(y)) {
          penDown = false;
          continue;
        }
        const X = px(xs[i]);
        const Y = py(y);
        if (!penDown) {
          ctx.moveTo(X, Y);
          penDown = true;
        } else {
          ctx.lineTo(X, Y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // Crosshair (programmatic or hover)
    const chosen = hoverLogicalX ?? cursorX;
    if (chosen !== null && chosen >= xmin && chosen <= xmax) {
      ctx.save();
      ctx.strokeStyle = MUTED_TEXT + "99";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      const x = Math.round(px(chosen)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + plot.height);
      ctx.stroke();
      ctx.restore();

      // Readouts under crosshair
      const labelX = px(chosen);
      ctx.save();
      ctx.font =
        "10px JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = MUTED_TEXT;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const tsLabel = model.xFormat(chosen);
      // draw a small background for readability
      const m = ctx.measureText(tsLabel);
      const pad = 3;
      const bgW = m.width + pad * 2;
      const bgX = Math.min(
        Math.max(labelX - bgW / 2, plot.left),
        plot.left + plot.width - bgW
      );
      ctx.fillStyle = "rgba(9,9,11,0.75)";
      ctx.fillRect(bgX, plot.top + plot.height - 14, bgW, 12);
      ctx.fillStyle = MUTED_TEXT;
      ctx.fillText(tsLabel, bgX + bgW / 2, plot.top + plot.height - 2);
      ctx.restore();
    }

    ctx.restore();

    // Update legend via callback if provided
    if (model.onRender) {
      const values = model.series.map((s) => {
        if (chosen === null) return null;
        return sampleSeries(s, chosen);
      });
      model.onRender(values, chosen);
    }
  }

  function sampleSeries(s, x) {
    const xs = s.xs;
    if (!xs.length) return null;
    let lo = 0;
    let hi = xs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (xs[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    const y = s.ys[lo];
    return Number.isFinite(y) ? y : null;
  }

  function setData(m) {
    model = m;
    render();
  }

  function setCursorX(x) {
    cursorX = x;
    render();
  }

  function destroy() {
    ro.disconnect();
    if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
  }

  return { setData, setCursorX, render, destroy };
}
