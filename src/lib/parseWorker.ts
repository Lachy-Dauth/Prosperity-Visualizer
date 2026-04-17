/// <reference lib="webworker" />
import type { ParsedStrategy, RawLogFile } from "../types";
import { buildStrategy, parseActivitiesCsv } from "./parser";

type ParseRequest = {
  type: "parse";
  reqId: number;
  text: string;
  meta: { id: string; name: string; color: string; filename?: string };
};

type ProgressMsg = {
  type: "progress";
  reqId: number;
  pct: number;
  message: string;
};

type DoneMsg = { type: "done"; reqId: number; strategy: ParsedStrategy };
type ErrMsg = { type: "error"; reqId: number; error: string };

// In a dedicated worker, `self` is the worker's global scope, not a Worker
// instance (postMessage is there, terminate() is not).
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (ev: MessageEvent<ParseRequest>) => {
  const msg = ev.data;
  if (msg.type !== "parse") return;
  const { reqId, text, meta } = msg;
  try {
    const post = (pct: number, message: string) => {
      const m: ProgressMsg = { type: "progress", reqId, pct, message };
      ctx.postMessage(m);
    };
    post(5, "Parsing JSON…");
    const raw = JSON.parse(text) as RawLogFile;
    if (!raw || typeof raw.activitiesLog !== "string") {
      throw new Error("File does not look like a Prosperity log (missing activitiesLog).");
    }
    post(25, "Parsing market data…");
    const rows = parseActivitiesCsv(raw.activitiesLog);
    post(60, "Computing series & metrics…");
    const strategy = buildStrategy(raw, rows, meta);
    post(95, "Finalizing…");
    const done: DoneMsg = { type: "done", reqId, strategy };
    ctx.postMessage(done);
  } catch (e) {
    const err: ErrMsg = {
      type: "error",
      reqId,
      error: e instanceof Error ? e.message : String(e),
    };
    ctx.postMessage(err);
  }
});

export {};
