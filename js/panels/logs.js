import { subscribe, getState, getReference, setLogTab } from "../store.js";
import { decodeLambdaLog } from "../parser.js";

export function mountLogs({ bodyEl, tsEl, tabsEl }) {
  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    setLogTab(btn.dataset.logTab);
  });

  function render() {
    const state = getState();
    const ref = getReference(state);
    for (const t of tabsEl.querySelectorAll(".tab")) {
      t.classList.toggle("active", t.dataset.logTab === state.logTab);
    }
    if (!ref) {
      bodyEl.innerHTML = `<div class="logs-empty">No strategy loaded.</div>`;
      tsEl.textContent = "";
      return;
    }
    const tickIdx = state.tickIdx;
    const tickKey = ref.timestamps[tickIdx];
    const rawTs = ref.rawTimestamps[tickIdx] ?? 0;
    tsEl.textContent = `TS ${rawTs.toLocaleString()}`;
    const info = ref.logIndexByTick[tickKey];
    let sandbox = "";
    let lambda = "";
    let decoded = null;
    if (info) {
      const entry = ref.rawLogs[info.start];
      sandbox = entry?.sandboxLog ?? "";
      lambda = entry?.lambdaLog ?? "";
      decoded = decodeLambdaLog(lambda);
    }
    const tab = state.logTab;
    const showRaw = tab === "sandbox" ? sandbox : lambda;
    if (tab === "trader") {
      if (decoded?.ok) {
        bodyEl.textContent = decoded.pretty;
      } else {
        bodyEl.innerHTML = `<div class="logs-empty">
          No structured trader data at this tick.
          <div class="hint">If you expect state dumps here, your algo needs the jmerle-style Logger shim.</div>
        </div>`;
      }
      return;
    }
    const isEmpty = !showRaw || showRaw.trim().length === 0;
    if (isEmpty) {
      const label = tab === "sandbox" ? "sandbox" : "algorithm";
      const hint =
        tab === "lambda"
          ? "If you're expecting algorithm logs, your submission needs to print() something each tick."
          : "Sandbox logs are usually empty unless something went wrong on the IMC side.";
      bodyEl.innerHTML = `<div class="logs-empty">No ${label} logs at this tick.<div class="hint">${hint}</div></div>`;
      return;
    }
    bodyEl.textContent = showRaw;
  }

  subscribe(render);
  render();
}
