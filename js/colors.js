export const STRATEGY_PALETTE = [
  "#2dd4bf",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#60a5fa",
  "#34d399",
  "#fb923c",
  "#f87171",
  "#4ade80",
  "#c084fc",
  "#facc15",
  "#22d3ee",
];

export function pickColor(used) {
  for (const c of STRATEGY_PALETTE) {
    if (!used.includes(c)) return c;
  }
  return STRATEGY_PALETTE[used.length % STRATEGY_PALETTE.length];
}
