export function fmtNum(n, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 10_000) return (n / 1_000).toFixed(2) + "k";
  return n.toFixed(digits);
}

export function fmtSigned(n, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + fmtNum(n, digits);
}

export function fmtInt(n) {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

export function fmtPct(n, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toFixed(digits) + "%";
}

export function fmtPrice(n) {
  if (!Number.isFinite(n) || n === 0) return "—";
  return n.toFixed(1);
}
