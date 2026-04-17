export function exportSummaryCsv(strategies) {
  const products = Array.from(
    new Set(strategies.flatMap((s) => s.products))
  ).sort();
  const headers = [
    "name",
    "submissionId",
    "totalPnl",
    "maxDrawdown",
    "maxAbsPosition",
    "tradeCount",
    "winRate",
    "sharpe",
    ...products.map((p) => `pnl:${p}`),
  ];
  const rows = strategies.map((s) => {
    const cells = [
      escCsv(s.name),
      escCsv(s.submissionId),
      String(s.summary.totalPnl),
      String(s.summary.maxDrawdown),
      String(s.summary.maxAbsPosition),
      String(s.summary.tradeCount),
      String(s.summary.winRate),
      String(s.summary.sharpe),
      ...products.map((p) => String(s.summary.perProductPnl[p] ?? "")),
    ];
    return cells.join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

function escCsv(s) {
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function downloadBlob(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export function downloadCanvasPng(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, "image/png");
}
