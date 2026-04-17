import {
  subscribe,
  getState,
  addStrategy,
  setState,
  replaceStrategies,
} from "./js/store.js";
import { mountRail } from "./js/panels/rail.js";
import { mountTopBar } from "./js/panels/topBar.js";
import { mountKpi } from "./js/panels/kpi.js";
import { mountPnlChart } from "./js/panels/pnlChart.js";
import { mountPriceChart } from "./js/panels/priceChart.js";
import { mountPositionChart } from "./js/panels/positionChart.js";
import { mountSummary } from "./js/panels/summary.js";
import { mountOrderBook } from "./js/panels/orderBook.js";
import { mountPressure } from "./js/panels/pressure.js";
import { mountOwnFills } from "./js/panels/ownFills.js";
import { mountLogs } from "./js/panels/logs.js";
import { showAboutModal } from "./js/panels/about.js";
import { loadStrategies } from "./js/persistence.js";
import { loadDemoLog } from "./js/demoLog.js";
import { parseLogText } from "./js/parserClient.js";
import { pickColor } from "./js/colors.js";
import { uid } from "./js/uid.js";

const DEMO_LOADED_KEY = "openprosperity:demo-loaded:v1";

function $(id) {
  return document.getElementById(id);
}

function openAbout() {
  showAboutModal($("modal-root"));
}

function applyTheme(theme) {
  document.body.classList.toggle("theme-dark", theme === "dark");
  document.body.classList.toggle("theme-light", theme === "light");
}

async function hydrate() {
  if (!getState().prefs.persistEnabled) return;
  try {
    const list = await loadStrategies();
    if (list.length > 0) replaceStrategies(list);
  } catch {
    /* ignore */
  }
}

async function maybeLoadDemo() {
  if (getState().strategies.length > 0) return;
  if (localStorage.getItem(DEMO_LOADED_KEY) === "1") return;
  try {
    const text = await loadDemoLog();
    if (getState().strategies.length > 0) return;
    const strat = await parseLogText(text, {
      id: uid("demo"),
      name: "Demo — IMC Day 0 Sample",
      color: pickColor([]),
      filename: "demo.log",
    });
    addStrategy(strat);
    localStorage.setItem(DEMO_LOADED_KEY, "1");
  } catch (err) {
    console.warn("Demo load failed:", err);
  }
}

async function main() {
  // Theme init
  applyTheme(getState().prefs.theme);
  subscribe((state, prev) => {
    if (state.prefs.theme !== prev.prefs?.theme) applyTheme(state.prefs.theme);
  });

  // Rail
  mountRail({
    railEl: $("rail"),
    railExpandEl: $("rail-expand"),
    dropzoneEl: $("dropzone"),
    fileInputEl: $("file-input"),
    listEl: $("rail-list"),
    progressEl: $("parse-progress"),
    progressMessage: $("parse-progress-message"),
    progressPct: $("parse-progress-pct"),
    progressFill: $("parse-progress-fill"),
    persistToggle: $("persist-toggle"),
    collapseBtn: $("rail-collapse"),
    onShowAbout: openAbout,
  });
  $("open-about").addEventListener("click", openAbout);

  // Top bar
  mountTopBar({
    scrubberEl: $("scrubber"),
    tickCurEl: $("tick-cur"),
    tickMaxEl: $("tick-max"),
    tickTsEl: $("tick-ts"),
    tickDayPrefixEl: $("tick-day-prefix"),
    playBtn: $("play"),
    stepBackBtn: $("step-back"),
    stepFwdBtn: $("step-fwd"),
    speedGroupEl: $("speed-group"),
    productSelect: $("product-select"),
    themeBtn: $("theme-toggle"),
    aboutBtn: $("open-about-top"),
    onShowAbout: openAbout,
  });

  // Panels
  mountKpi($("kpi-grid"));

  mountPnlChart({
    canvasEl: $("chart-pnl"),
    emptyEl: $("chart-pnl-empty"),
    legendEl: $("pnl-legend"),
    normCheck: $("pnl-norm"),
    diffCheck: $("pnl-diff"),
    sampledCheck: $("pnl-sampled"),
    exportBtn: $("pnl-export"),
    resetZoomBtn: $("pnl-reset-zoom"),
  });

  mountSummary({
    bodyEl: $("summary-body"),
    exportBtn: $("summary-export"),
  });

  mountPriceChart({
    canvasEl: $("chart-price"),
    emptyEl: $("chart-price-empty"),
    titleEl: $("price-title"),
    legendEl: $("price-legend"),
    levelsCheck: $("price-levels"),
    midCheck: $("price-mid"),
    microCheck: $("price-micro"),
    wallMidCheck: $("price-wallmid"),
    buysCheck: $("price-buys"),
    sellsCheck: $("price-sells"),
    botsCheck: $("price-bots"),
    resetZoomBtn: $("price-reset-zoom"),
  });

  mountOrderBook({
    bodyEl: $("book-body"),
    titleEl: $("book-title"),
    midSpreadEl: $("book-mid-spread"),
  });

  mountPressure({
    bodyEl: $("pressure-body"),
    titleEl: $("pressure-title"),
    valueEl: $("pressure-value"),
  });

  mountPositionChart({
    canvasEl: $("chart-position"),
    emptyEl: $("chart-position-empty"),
    titleEl: $("position-title"),
    legendEl: $("position-legend"),
    limitInput: $("position-limit"),
    resetZoomBtn: $("position-reset-zoom"),
  });

  mountOwnFills({
    bodyEl: $("fills-body"),
    titleEl: $("fills-title"),
    showAllInput: $("fills-all"),
  });

  mountLogs({
    bodyEl: $("logs-body"),
    tsEl: $("logs-ts"),
    tabsEl: $("panel-logs").querySelector(".tabs"),
  });

  await hydrate();
  await maybeLoadDemo();
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<pre style="color:#f87171;padding:12px;font-family:monospace">Boot error: ${String(err)}</pre>`
  );
});
