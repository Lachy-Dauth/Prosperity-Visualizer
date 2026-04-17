// Tiny pub/sub store. Every subscriber receives every update with
// (state, prev); do your own diffing in the subscriber.

const PREFS_KEY = "openprosperity:prefs:v1";

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    return { ...defaultPrefs(), ...JSON.parse(raw) };
  } catch {
    return defaultPrefs();
  }
}

function defaultPrefs() {
  return {
    theme: "dark",
    persistEnabled: false,
    diffMode: false,
    normalizedX: false,
    showSampled: true,
  };
}

function savePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* quota */
  }
}

let state = {
  strategies: [],
  referenceId: null,
  comparingIds: new Set(),
  tickIdx: 0,
  selectedProduct: null,
  isPlaying: false,
  playSpeed: 5,
  prefs: loadPrefs(),
  parseProgress: null,
  railCollapsed: false,
  logTab: "lambda",
  fillsShowAll: false,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  const prev = state;
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state, prev);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---- selectors ---- */
export function getReference(s = state) {
  return s.strategies.find((st) => st.id === s.referenceId) ?? null;
}

/* ---- actions ---- */
export function addStrategy(strat) {
  const { strategies, comparingIds, referenceId, tickIdx } = getState();
  const nextComparing = new Set(comparingIds);
  nextComparing.add(strat.id);
  setState({
    strategies: [...strategies, strat],
    referenceId: referenceId ?? strat.id,
    comparingIds: nextComparing,
    tickIdx: referenceId ? tickIdx : 0,
  });
}

export function removeStrategy(id) {
  const { strategies, referenceId, comparingIds } = getState();
  const next = strategies.filter((s) => s.id !== id);
  const nextComparing = new Set(comparingIds);
  nextComparing.delete(id);
  const nextRef = referenceId === id ? (next[0]?.id ?? null) : referenceId;
  setState({
    strategies: next,
    referenceId: nextRef,
    comparingIds: nextComparing,
    tickIdx: 0,
  });
}

export function renameStrategy(id, name) {
  const { strategies } = getState();
  setState({
    strategies: strategies.map((s) => (s.id === id ? { ...s, name } : s)),
  });
}

export function recolorStrategy(id, color) {
  const { strategies } = getState();
  setState({
    strategies: strategies.map((s) => (s.id === id ? { ...s, color } : s)),
  });
}

export function setReference(id) {
  setState({ referenceId: id });
}

export function toggleComparing(id) {
  const { comparingIds } = getState();
  const next = new Set(comparingIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setState({ comparingIds: next });
}

export function setComparing(id, on) {
  const { comparingIds } = getState();
  const next = new Set(comparingIds);
  if (on) next.add(id);
  else next.delete(id);
  setState({ comparingIds: next });
}

export function setTickIdx(i) {
  const { strategies, referenceId } = getState();
  const ref = strategies.find((s) => s.id === referenceId);
  const max = ref ? ref.timestamps.length - 1 : 0;
  setState({ tickIdx: Math.max(0, Math.min(max, i)) });
}

export function stepTick(delta) {
  setTickIdx(getState().tickIdx + delta);
}

export function setSelectedProduct(p) {
  setState({ selectedProduct: p });
}
export function setIsPlaying(b) {
  setState({ isPlaying: b });
}
export function setPlaySpeed(n) {
  setState({ playSpeed: n });
}
export function setLogTab(t) {
  setState({ logTab: t });
}
export function setFillsShowAll(b) {
  setState({ fillsShowAll: b });
}
export function setRailCollapsed(b) {
  setState({ railCollapsed: b });
}
export function setParseProgress(p) {
  setState({ parseProgress: p });
}

export function setPrefs(patch) {
  const next = { ...getState().prefs, ...patch };
  savePrefs(next);
  setState({ prefs: next });
}

export function setPositionLimit(sid, product, limit) {
  const { strategies } = getState();
  setState({
    strategies: strategies.map((s) =>
      s.id === sid
        ? { ...s, positionLimits: { ...s.positionLimits, [product]: limit } }
        : s
    ),
  });
}

export function replaceStrategies(list) {
  setState({
    strategies: list,
    referenceId: list[0]?.id ?? null,
    comparingIds: new Set(list.map((s) => s.id)),
    tickIdx: 0,
  });
}
