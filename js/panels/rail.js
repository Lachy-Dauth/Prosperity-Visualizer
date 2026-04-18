import {
  subscribe,
  getState,
  addStrategy,
  removeStrategy,
  renameStrategy,
  recolorStrategy,
  setReference,
  toggleComparing,
  setParseProgress,
  setPrefs,
  setRailCollapsed,
} from "../store.js";
import { pickColor } from "../colors.js";
import { uid } from "../uid.js";
import { parseLogText } from "../parserClient.js";
import { loadDemoLog } from "../demoLog.js";
import { saveStrategy, clearAll } from "../persistence.js";
import { fmtInt } from "../format.js";

let editingId = null;

export function mountRail({
  railEl,
  railExpandEl,
  dropzoneEl,
  fileInputEl,
  listEl,
  progressEl,
  progressMessage,
  progressPct,
  progressFill,
  persistToggle,
  collapseBtn,
  onShowAbout,
}) {
  async function handleFiles(files) {
    const arr = Array.from(files);
    const { strategies } = getState();
    const batchColors = strategies.map((s) => s.color);
    for (const f of arr) {
      const id = uid();
      try {
        setParseProgress({ id, pct: 0, message: `Reading ${f.name}…` });
        const text = await f.text();
        setParseProgress({ id, pct: 5, message: `Parsing ${f.name}…` });
        const color = pickColor(batchColors);
        batchColors.push(color);
        const strat = await parseLogText(
          text,
          {
            id,
            name: f.name.replace(/\.(log|json)$/i, ""),
            color,
            filename: f.name,
          },
          {
            onProgress: (pct, message) =>
              setParseProgress({ id, pct, message }),
          }
        );
        addStrategy(strat);
        if (getState().prefs.persistEnabled) {
          saveStrategy(strat).catch(() => {});
        }
      } catch (e) {
        alert(`Failed to parse ${f.name}: ${e.message}`);
      } finally {
        setParseProgress(null);
      }
    }
  }

  async function doLoadDemo() {
    const { strategies } = getState();
    const id = uid("demo");
    try {
      setParseProgress({ id, pct: 0, message: "Loading demo…" });
      const text = await loadDemoLog();
      const strat = await parseLogText(
        text,
        {
          id,
          name: "Demo — IMC Day 0 Sample",
          color: pickColor(strategies.map((s) => s.color)),
          filename: "demo.log",
        },
        {
          onProgress: (pct, message) =>
            setParseProgress({ id, pct, message }),
        }
      );
      addStrategy(strat);
    } catch (e) {
      alert(`Demo load failed: ${e.message}`);
    } finally {
      setParseProgress(null);
    }
  }

  // Wire events once
  dropzoneEl.addEventListener("click", () => fileInputEl.click());
  dropzoneEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzoneEl.classList.add("active");
  });
  dropzoneEl.addEventListener("dragleave", () =>
    dropzoneEl.classList.remove("active")
  );
  dropzoneEl.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzoneEl.classList.remove("active");
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  });
  fileInputEl.addEventListener("change", () => {
    if (fileInputEl.files?.length) handleFiles(fileInputEl.files);
    fileInputEl.value = "";
  });

  persistToggle.addEventListener("change", (e) => {
    const on = e.target.checked;
    setPrefs({ persistEnabled: on });
    if (on) {
      for (const s of getState().strategies)
        saveStrategy(s).catch(() => {});
    } else {
      clearAll().catch(() => {});
    }
  });

  collapseBtn.addEventListener("click", () => setRailCollapsed(true));
  railExpandEl.addEventListener("click", () => setRailCollapsed(false));

  listEl.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const item = target.closest("[data-strat-id]");
    if (!item) return;
    const id = item.getAttribute("data-strat-id");
    const action = target.getAttribute("data-action");
    if (action === "remove") {
      const s = getState().strategies.find((x) => x.id === id);
      if (s && confirm(`Remove ${s.name}?`)) removeStrategy(id);
    } else if (action === "name") {
      editingId = id;
      renderList();
      const input = listEl.querySelector(
        `[data-strat-id="${id}"] .strat-rename`
      );
      input?.focus();
      input?.select();
    } else if (action === "ref-radio" || action === "name-click") {
      setReference(id);
    } else if (action === "cmp") {
      toggleComparing(id);
    }
  });

  listEl.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    const item = target.closest("[data-strat-id]");
    if (!item) return;
    const id = item.getAttribute("data-strat-id");
    if (target.getAttribute("data-action") === "ref-radio") {
      setReference(id);
    } else if (target.getAttribute("data-action") === "cmp") {
      toggleComparing(id);
    } else if (target.getAttribute("data-action") === "color") {
      recolorStrategy(id, target.value);
    }
  });

  listEl.addEventListener("keydown", (e) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    if (!e.target.classList.contains("strat-rename")) return;
    if (e.key === "Enter") e.target.blur();
    else if (e.key === "Escape") {
      editingId = null;
      renderList();
    }
  });

  listEl.addEventListener("focusout", (e) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    if (!e.target.classList.contains("strat-rename")) return;
    const item = e.target.closest("[data-strat-id]");
    if (!item) return;
    const id = item.getAttribute("data-strat-id");
    const newName = e.target.value.trim();
    if (newName) renameStrategy(id, newName);
    editingId = null;
    renderList();
  });

  function renderList() {
    const { strategies, referenceId, comparingIds } = getState();
    if (strategies.length === 0) {
      listEl.innerHTML = `
        <div class="rail-empty">No logs loaded yet.</div>
        <button class="btn full" id="rail-load-demo-inline">Load demo log</button>
      `;
      listEl.querySelector("#rail-load-demo-inline")?.addEventListener(
        "click",
        doLoadDemo
      );
      return;
    }
    const items = strategies
      .map((s) => {
        const isRef = s.id === referenceId;
        const isCmp = comparingIds.has(s.id);
        const pnl = s.summary.totalPnl;
        const pnlStr =
          (pnl >= 0 ? "+" : "") + Math.round(pnl).toLocaleString();
        const pnlClass = pnl >= 0 ? "positive" : "negative";
        const isEditing = editingId === s.id;
        return `
          <div class="strat-item ${isRef ? "ref" : ""}" data-strat-id="${s.id}">
            <label class="strat-swatch" style="background:${s.color}" title="Recolor">
              <input type="color" value="${s.color}" data-action="color" />
            </label>
            <div class="strat-body">
              ${
                isEditing
                  ? `<input class="strat-rename" value="${escapeAttr(s.name)}" autofocus />`
                  : `<button class="strat-name" data-action="name-click" title="${escapeAttr(s.name)}&#10;${escapeAttr(s.submissionId)}&#10;Double-click the name icon to rename">${escapeHtml(s.name)}</button>`
              }
              <div class="strat-meta">
                <span class="num">${fmtInt(s.timestamps.length)} ticks</span>
                <span>·</span>
                <span>${s.products.length} sym</span>
                <span>·</span>
                <span class="num ${pnlClass}">${pnlStr}</span>
              </div>
              <div class="strat-controls">
                <label><input type="radio" name="reference" data-action="ref-radio" ${isRef ? "checked" : ""}/> ref</label>
                <label><input type="checkbox" data-action="cmp" ${isCmp ? "checked" : ""}/> compare</label>
                <button data-action="name" class="strat-remove" title="Rename">✎</button>
                <button data-action="remove" class="strat-remove" title="Remove">×</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
    listEl.innerHTML =
      items +
      `<button class="btn full" id="rail-add-demo" style="margin-top:8px">+ Add demo</button>`;
    listEl.querySelector("#rail-add-demo")?.addEventListener("click", doLoadDemo);
  }

  function renderProgress() {
    const { parseProgress } = getState();
    if (!parseProgress) {
      progressEl.classList.add("hidden");
      return;
    }
    progressEl.classList.remove("hidden");
    progressMessage.textContent = parseProgress.message;
    progressPct.textContent = `${parseProgress.pct.toFixed(0)}%`;
    progressFill.style.width = `${parseProgress.pct}%`;
  }

  function renderToggleState() {
    const { prefs, railCollapsed } = getState();
    persistToggle.checked = prefs.persistEnabled;
    const app = document.querySelector(".app");
    app.classList.toggle("rail-collapsed", railCollapsed);
    railExpandEl.classList.toggle("hidden", !railCollapsed);
  }

  let lastSnap = {};
  subscribe((state) => {
    const snap = {
      strategies: state.strategies,
      referenceId: state.referenceId,
      comparingIds: state.comparingIds,
      parseProgress: state.parseProgress,
      persistEnabled: state.prefs.persistEnabled,
      railCollapsed: state.railCollapsed,
      editingId,
    };
    if (
      snap.strategies !== lastSnap.strategies ||
      snap.referenceId !== lastSnap.referenceId ||
      snap.comparingIds !== lastSnap.comparingIds ||
      snap.editingId !== lastSnap.editingId
    ) {
      renderList();
    }
    if (snap.parseProgress !== lastSnap.parseProgress) renderProgress();
    if (
      snap.persistEnabled !== lastSnap.persistEnabled ||
      snap.railCollapsed !== lastSnap.railCollapsed
    )
      renderToggleState();
    lastSnap = snap;
  });

  // Initial
  renderList();
  renderProgress();
  renderToggleState();

  return { handleFiles, loadDemo: doLoadDemo };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
