import { create } from "zustand";
import type { ParsedStrategy } from "../types";
import {
  clearAll as idbClearAll,
  deleteStrategy as idbDelete,
  loadStrategies as idbLoad,
  saveStrategy as idbSave,
} from "./persistence";

const PREFS_KEY = "openprosperity:prefs:v1";

export interface UiPrefs {
  theme: "dark" | "light";
  persistEnabled: boolean;
  diffMode: boolean;
  normalizedX: boolean;
  showSampled: boolean;
}

const defaultPrefs: UiPrefs = {
  theme: "dark",
  persistEnabled: false,
  diffMode: false,
  normalizedX: false,
  showSampled: true,
};

function loadPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs;
    return { ...defaultPrefs, ...(JSON.parse(raw) as Partial<UiPrefs>) };
  } catch {
    return defaultPrefs;
  }
}

function savePrefs(p: UiPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* quota or denied */
  }
}

export interface AppState {
  strategies: ParsedStrategy[];
  /** id of reference strategy */
  referenceId: string | null;
  /** ids of strategies actively shown in comparison overlays */
  comparingIds: Set<string>;
  /** current scrubbed tick INDEX (into the reference strategy's timestamps).
   * If no reference, falls back to first strategy. */
  tickIdx: number;
  /** active product filter — null means "all" */
  selectedProduct: string | null;
  isPlaying: boolean;
  playSpeed: number; // ticks per second
  prefs: UiPrefs;
  parseProgress: { id: string; pct: number; message: string } | null;

  addStrategy: (s: ParsedStrategy) => Promise<void>;
  removeStrategy: (id: string) => Promise<void>;
  renameStrategy: (id: string, name: string) => void;
  recolorStrategy: (id: string, color: string) => void;
  setReference: (id: string) => void;
  toggleComparing: (id: string) => void;
  setComparing: (id: string, on: boolean) => void;
  setTickIdx: (i: number) => void;
  stepTick: (delta: number) => void;
  setSelectedProduct: (p: string | null) => void;
  setIsPlaying: (b: boolean) => void;
  setPlaySpeed: (n: number) => void;
  setPrefs: (p: Partial<UiPrefs>) => void;
  setPositionLimit: (sid: string, product: string, limit: number) => void;
  setParseProgress: (p: { id: string; pct: number; message: string } | null) => void;
  hydrateFromIdb: () => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  strategies: [],
  referenceId: null,
  comparingIds: new Set(),
  tickIdx: 0,
  selectedProduct: null,
  isPlaying: false,
  playSpeed: 5,
  prefs: loadPrefs(),
  parseProgress: null,

  addStrategy: async (s) => {
    const { strategies, comparingIds, prefs } = get();
    const next = [...strategies, s];
    const newComparing = new Set(comparingIds);
    newComparing.add(s.id);
    set({
      strategies: next,
      referenceId: get().referenceId ?? s.id,
      comparingIds: newComparing,
      tickIdx: get().referenceId ? get().tickIdx : 0,
    });
    if (prefs.persistEnabled) {
      try {
        await idbSave(s);
      } catch {
        /* ignore */
      }
    }
  },

  removeStrategy: async (id) => {
    const { strategies, referenceId, comparingIds } = get();
    const next = strategies.filter((s) => s.id !== id);
    const nextComparing = new Set(comparingIds);
    nextComparing.delete(id);
    let nextRef = referenceId;
    if (referenceId === id) nextRef = next.length ? next[0].id : null;
    set({
      strategies: next,
      referenceId: nextRef,
      comparingIds: nextComparing,
      tickIdx: 0,
    });
    try {
      await idbDelete(id);
    } catch {
      /* ignore */
    }
  },

  renameStrategy: (id, name) =>
    set((s) => ({
      strategies: s.strategies.map((st) => (st.id === id ? { ...st, name } : st)),
    })),

  recolorStrategy: (id, color) =>
    set((s) => ({
      strategies: s.strategies.map((st) => (st.id === id ? { ...st, color } : st)),
    })),

  setReference: (id) => set({ referenceId: id }),

  toggleComparing: (id) =>
    set((s) => {
      const next = new Set(s.comparingIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { comparingIds: next };
    }),

  setComparing: (id, on) =>
    set((s) => {
      const next = new Set(s.comparingIds);
      if (on) next.add(id);
      else next.delete(id);
      return { comparingIds: next };
    }),

  setTickIdx: (i) => {
    const ref = get().strategies.find((s) => s.id === get().referenceId);
    const max = ref ? ref.timestamps.length - 1 : 0;
    const clamped = Math.max(0, Math.min(max, i));
    set({ tickIdx: clamped });
  },

  stepTick: (delta) => get().setTickIdx(get().tickIdx + delta),

  setSelectedProduct: (p) => set({ selectedProduct: p }),
  setIsPlaying: (b) => set({ isPlaying: b }),
  setPlaySpeed: (n) => set({ playSpeed: n }),

  setPrefs: (patch) => {
    const next = { ...get().prefs, ...patch };
    savePrefs(next);
    set({ prefs: next });
    if ("persistEnabled" in patch) {
      // If user just enabled persistence, save what we have. If disabled, wipe.
      if (patch.persistEnabled) {
        for (const s of get().strategies) idbSave(s).catch(() => {});
      } else {
        idbClearAll().catch(() => {});
      }
    }
  },

  setPositionLimit: (sid, product, limit) =>
    set((s) => ({
      strategies: s.strategies.map((st) =>
        st.id === sid
          ? { ...st, positionLimits: { ...st.positionLimits, [product]: limit } }
          : st
      ),
    })),

  setParseProgress: (p) => set({ parseProgress: p }),

  hydrateFromIdb: async () => {
    if (!get().prefs.persistEnabled) return;
    try {
      const list = await idbLoad();
      if (list.length > 0) {
        const ids = new Set(list.map((s) => s.id));
        set({
          strategies: list,
          referenceId: list[0].id,
          comparingIds: ids,
          tickIdx: 0,
        });
      }
    } catch {
      /* ignore */
    }
  },

  clearAll: async () => {
    try {
      await idbClearAll();
    } catch {
      /* ignore */
    }
    set({
      strategies: [],
      referenceId: null,
      comparingIds: new Set(),
      tickIdx: 0,
    });
  },
}));

export function getReferenceStrategy(state: AppState): ParsedStrategy | null {
  return state.strategies.find((s) => s.id === state.referenceId) ?? null;
}
