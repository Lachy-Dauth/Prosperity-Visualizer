import { buildStrategy, parseActivitiesCsv } from "./parser.js";

self.addEventListener("message", (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== "parse") return;
  const { reqId, text, meta } = msg;
  try {
    const post = (pct, message) =>
      self.postMessage({ type: "progress", reqId, pct, message });
    post(5, "Parsing JSON…");
    const raw = JSON.parse(text);
    if (!raw || typeof raw.activitiesLog !== "string") {
      throw new Error(
        "File does not look like a Prosperity log (missing activitiesLog)."
      );
    }
    post(25, "Parsing market data…");
    const rows = parseActivitiesCsv(raw.activitiesLog);
    post(60, "Computing series & metrics…");
    const strategy = buildStrategy(raw, rows, meta);
    post(95, "Finalizing…");
    self.postMessage({ type: "done", reqId, strategy });
  } catch (e) {
    self.postMessage({
      type: "error",
      reqId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
