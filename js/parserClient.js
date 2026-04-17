let worker = null;
let nextReqId = 1;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

export function parseLogText(text, meta, handlers = {}) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const reqId = nextReqId++;
    const onMsg = (ev) => {
      const m = ev.data;
      if (!m || m.reqId !== reqId) return;
      if (m.type === "progress") handlers.onProgress?.(m.pct, m.message);
      else if (m.type === "done") {
        w.removeEventListener("message", onMsg);
        resolve(m.strategy);
      } else if (m.type === "error") {
        w.removeEventListener("message", onMsg);
        reject(new Error(m.error));
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "parse", reqId, text, meta });
  });
}
