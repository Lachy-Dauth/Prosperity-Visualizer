/**
 * Vanilla Canvas line chart with click-drag horizontal zoom, double-click
 * seek, and an optional external legend hook.
 *
 * Usage:
 *   const chart = createChart(canvas, {
 *     onSeek: (xValue) => {...},
 *     onHover: (values, xValue) => {...},   // also fires on chart-internal
 *                                            // re-renders (e.g. after zoom)
 *   });
 *   chart.setData({
 *     xFormat, yFormat,
 *     series: [{ name, color, xs, ys, width?, dash? }],
 *     limitLines: [{ value, color, dash? }],
 *   });
 *   chart.setCursorX(x);   // programmatic crosshair
 *   chart.setXView(min, max);    // zoom to a range
 *   chart.resetXView();          // back to full
 */

const DPR = window.devicePixelRatio || 1;
const DRAG_THRESHOLD = 4; // px before a drag is treated as a zoom

export function createChart(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  const { onSeek = null, onHover = null } = opts;

  let model = null;
  let cursorX = null;
  let hoverLogicalX = null;
  let lastSize = { w: 0, h: 0 };
  let resizeRaf = null;

  let plot = { left: 48, top: 8, width: 0, height: 0 };
  let xView = null; // [min, max] or null for auto-range

  const AXIS_COLOR = "#71717a";
  const GRID_COLOR = "#27272a";
  const MUTED_TEXT = "#a1a1aa";
  const ZOOM_BG = "rgba(45, 212, 191, 0.15)";
  const ZOOM_EDGE = "rgba(45, 212, 191, 0.6)";

  // --- drag zoom state ---
  let dragStart = null; // { pxStart, pxCur, started }
  let dragClickTime = 0;

  const ro = new ResizeObserver(() => {
    if (resizeRaf != null) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      render();
    });
  });
  ro.observe(canvas);

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < plot.left || px > plot.left + plot.width) return;
    dragStart = { pxStart: px, pxCur: px, started: false };
    dragClickTime = performance.now();
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragStart) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    dragStart.pxCur = px;
    if (
      !dragStart.started &&
      Math.abs(px - dragStart.pxStart) >= DRAG_THRESHOLD
    ) {
      dragStart.started = true;
    }
    if (dragStart.started) render();
  });

  window.addEventListener("mouseup", (e) => {
    if (!dragStart) return;
    const drag = dragStart;
    dragStart = null;
    if (!drag.started) {
      render();
      return;
    }
    if (!model) {
      render();
      return;
    }
    const xmin = visibleXMin();
    const xmax = visibleXMax();
    const p2v = (px) =>
      xmin + ((px - plot.left) / plot.width) * (xmax - xmin);
    let a = p2v(Math.max(plot.left, Math.min(plot.left + plot.width, drag.pxStart)));
    let b = p2v(Math.max(plot.left, Math.min(plot.left + plot.width, drag.pxCur)));
    if (a > b) [a, b] = [b, a];
    if (b - a > (xmax - xmin) * 0.001) {
      xView = [a, b];
      render();
    } else {
      render();
    }
  });

  canvas.addEventListener("dblclick", (e) => {
    if (!model || !onSeek) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < plot.left || px > plot.left + plot.width) return;
    const xmin = visibleXMin();
    const xmax = visibleXMax();
    const xValue = xmin + ((px - plot.left) / plot.width) * (xmax - xmin);
    onSeek(xValue);
  });

  // Right-click to reset zoom.
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (xView !== null) {
      xView = null;
      render();
    }
  });

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
    const xmin = visibleXMin();
    const xmax = visibleXMax();
    hoverLogicalX = xmin + ((px - plot.left) / plot.width) * (xmax - xmin);
    render();
  });

  canvas.addEventListener("mouseleave", () => {
    hoverLogicalX = null;
    render();
  });

  canvas.style.cursor = "crosshair";

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

  function visibleXMin() {
    return xView ? xView[0] : model._xmin;
  }
  function visibleXMax() {
    return xView ? xView[1] : model._xmax;
  }

  function computeBounds() {
    let xmin = Infinity,
      xmax = -Infinity;
    for (const s of model.series) {
      for (let i = 0; i < s.xs.length; i++) {
        const x = s.xs[i];
        if (Number.isFinite(x)) {
          if (x < xmin) xmin = x;
          if (x > xmax) xmax = x;
        }
      }
    }
    if (!Number.isFinite(xmin)) {
      xmin = 0;
      xmax = 1;
    }
    if (xmin === xmax) xmax = xmin + 1;
    model._xmin = xmin;
    model._xmax = xmax;

    // y bounds only over currently visible x range
    const visXmin = visibleXMin();
    const visXmax = visibleXMax();
    let ymin = Infinity,
      ymax = -Infinity;
    for (const s of model.series) {
      const xs = s.xs;
      const ys = s.ys;
      const len = Math.min(xs.length, ys.length);
      for (let i = 0; i < len; i++) {
        const x = xs[i];
        if (x < visXmin || x > visXmax) continue;
        const y = ys[i];
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
    if (!Number.isFinite(ymin)) {
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

    plot = { left: 48, top: 8, width: w - 54, height: h - 28 };
    if (plot.width < 20 || plot.height < 20) {
      ctx.restore();
      return;
    }

    const xmin = visibleXMin();
    const xmax = visibleXMax();
    const { _ymin: ymin, _ymax: ymax } = model;
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
      ctx.fillText(model.yFormat(v), plot.left - 6, py(v));
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
      ctx.fillText(model.xFormat(v), px(v), plot.top + plot.height + 4);
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

    // Series (clipped)
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
        // Skip NaN points without lifting the pen — joins the line
        // across gaps so you see continuous series instead of
        // hundreds of short segments when a level disappears briefly.
        if (!Number.isFinite(y)) continue;
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

    // Markers (scatter points drawn over the line series)
    if (model.markers) {
      for (const m of model.markers) {
        ctx.fillStyle = m.color;
        ctx.strokeStyle = m.color;
        const size = m.size ?? 5;
        const half = size / 2;
        const xs = m.xs;
        const ys = m.ys;
        const len = Math.min(xs.length, ys.length);
        for (let i = 0; i < len; i++) {
          const y = ys[i];
          const x = xs[i];
          if (!Number.isFinite(y) || !Number.isFinite(x)) continue;
          if (x < xmin || x > xmax) continue;
          const X = px(x);
          const Y = py(y);
          drawMarker(ctx, X, Y, m.shape ?? "dot", size, half);
        }
      }
    }
    ctx.restore();

    // Active drag-zoom rectangle
    if (dragStart && dragStart.started) {
      const a = Math.max(
        plot.left,
        Math.min(plot.left + plot.width, dragStart.pxStart)
      );
      const b = Math.max(
        plot.left,
        Math.min(plot.left + plot.width, dragStart.pxCur)
      );
      const left = Math.min(a, b);
      const width = Math.abs(b - a);
      ctx.fillStyle = ZOOM_BG;
      ctx.fillRect(left, plot.top, width, plot.height);
      ctx.strokeStyle = ZOOM_EDGE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left + 0.5, plot.top);
      ctx.lineTo(left + 0.5, plot.top + plot.height);
      ctx.moveTo(left + width - 0.5, plot.top);
      ctx.lineTo(left + width - 0.5, plot.top + plot.height);
      ctx.stroke();
    }

    // Crosshair
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

      // Readout under crosshair
      ctx.save();
      ctx.font =
        "10px JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const tsLabel = model.xFormat(chosen);
      const m = ctx.measureText(tsLabel);
      const bgW = m.width + 6;
      const labelX = px(chosen);
      const bgX = Math.min(
        Math.max(labelX - bgW / 2, plot.left),
        plot.left + plot.width - bgW
      );
      ctx.fillStyle = "rgba(9,9,11,0.82)";
      ctx.fillRect(bgX, plot.top + plot.height - 14, bgW, 12);
      ctx.fillStyle = MUTED_TEXT;
      ctx.fillText(tsLabel, bgX + bgW / 2, plot.top + plot.height - 2);
      ctx.restore();
    }

    // Zoom indicator in the top-left of the plot area
    if (xView) {
      ctx.save();
      ctx.font =
        "9px JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = ZOOM_EDGE;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("zoom · right-click to reset", plot.left + 4, plot.top + 2);
      ctx.restore();
    }

    ctx.restore();

    if (onHover || model.onRender) {
      const values = model.series.map((s) =>
        chosen === null ? null : sampleSeries(s, chosen)
      );
      if (onHover) onHover(values, chosen);
      if (model.onRender) model.onRender(values, chosen);
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

  function setXView(min, max) {
    xView = [min, max];
    render();
  }

  function resetXView() {
    xView = null;
    render();
  }

  function destroy() {
    ro.disconnect();
    if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
  }

  return { setData, setCursorX, setXView, resetXView, render, destroy };
}

function drawMarker(ctx, X, Y, shape, size, half) {
  if (shape === "up") {
    ctx.beginPath();
    ctx.moveTo(X, Y - half);
    ctx.lineTo(X + half, Y + half);
    ctx.lineTo(X - half, Y + half);
    ctx.closePath();
    ctx.fill();
  } else if (shape === "down") {
    ctx.beginPath();
    ctx.moveTo(X, Y + half);
    ctx.lineTo(X + half, Y - half);
    ctx.lineTo(X - half, Y - half);
    ctx.closePath();
    ctx.fill();
  } else if (shape === "diamond") {
    ctx.beginPath();
    ctx.moveTo(X, Y - half);
    ctx.lineTo(X + half, Y);
    ctx.lineTo(X, Y + half);
    ctx.lineTo(X - half, Y);
    ctx.closePath();
    ctx.fill();
  } else {
    // dot (default)
    ctx.beginPath();
    ctx.arc(X, Y, half, 0, Math.PI * 2);
    ctx.fill();
  }
  void size;
}

