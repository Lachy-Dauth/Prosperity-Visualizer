import {
  subscribe,
  getState,
  setTickIdx,
  stepTick,
  setIsPlaying,
  setPlaySpeed,
  setSelectedProduct,
  setPrefs,
  getReference,
} from "../store.js";

export function mountTopBar({
  scrubberEl,
  tickCurEl,
  tickMaxEl,
  tickDayTsEl,
  playBtn,
  stepBackBtn,
  stepFwdBtn,
  speedGroupEl,
  productSelect,
  themeBtn,
  aboutBtn,
  onShowAbout,
}) {
  // Playback loop — setInterval-based (more predictable than rAF under
  // background-tab throttling; playback only needs ~30fps).
  const LOOP_HZ = 30;
  let intervalId = null;
  let lastTime = 0;

  function stopLoop() {
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  let accum = 0;

  function startLoop() {
    stopLoop();
    lastTime = performance.now();
    accum = 0;
    intervalId = setInterval(() => {
      const state = getState();
      if (!state.isPlaying) {
        stopLoop();
        return;
      }
      const ref = getReference(state);
      if (!ref) {
        setIsPlaying(false);
        stopLoop();
        return;
      }
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      // Accumulate fractional tick increments so we actually advance at
      // playback speeds < LOOP_HZ ticks/second (e.g. 1x at 30Hz).
      accum += state.playSpeed * dt;
      if (accum >= 1) {
        const step = Math.floor(accum);
        accum -= step;
        const max = ref.timestamps.length - 1;
        const nextIdx = Math.min(max, state.tickIdx + step);
        setTickIdx(nextIdx);
        if (nextIdx >= max) {
          setIsPlaying(false);
          stopLoop();
        }
      }
    }, 1000 / LOOP_HZ);
  }

  // Events
  scrubberEl.addEventListener("input", (e) => {
    setTickIdx(Number(e.target.value));
  });

  playBtn.addEventListener("click", () => {
    setIsPlaying(!getState().isPlaying);
  });
  stepBackBtn.addEventListener("click", () => stepTick(-10));
  stepFwdBtn.addEventListener("click", () => stepTick(10));

  speedGroupEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".speed-btn");
    if (!btn) return;
    setPlaySpeed(Number(btn.dataset.speed));
  });

  productSelect.addEventListener("change", (e) => {
    setSelectedProduct(e.target.value || null);
  });

  themeBtn.addEventListener("click", () => {
    const cur = getState().prefs.theme;
    const next = cur === "dark" ? "light" : "dark";
    setPrefs({ theme: next });
  });

  aboutBtn.addEventListener("click", onShowAbout);

  // Keyboard
  window.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === " ") {
      e.preventDefault();
      setIsPlaying(!getState().isPlaying);
    } else if (e.key === "ArrowRight") {
      stepTick(e.shiftKey ? 100 : 1);
    } else if (e.key === "ArrowLeft") {
      stepTick(e.shiftKey ? -100 : -1);
    }
  });

  let lastProducts = null;
  let lastRefId = null;
  function render() {
    const state = getState();
    const ref = getReference(state);
    const max = ref ? ref.timestamps.length - 1 : 0;
    const hasMultipleDays =
      ref && ref.days && ref.days.length > 0
        ? ref.days[0] !== ref.days[ref.days.length - 1]
        : false;

    // Scrubber
    scrubberEl.max = String(max);
    scrubberEl.disabled = !ref;
    scrubberEl.value = String(state.tickIdx);

    tickCurEl.textContent = String(state.tickIdx);
    tickMaxEl.textContent = String(max);
    const ts =
      ref?.rawTimestamps?.[state.tickIdx] ??
      ref?.timestamps?.[state.tickIdx] ??
      0;
    const day = ref?.days?.[state.tickIdx];
    tickDayTsEl.textContent =
      hasMultipleDays && day !== undefined
        ? `D${day} TS ${ts.toLocaleString()}`
        : `TS ${ts.toLocaleString()}`;

    // Play button
    playBtn.disabled = !ref;
    playBtn.textContent = state.isPlaying ? "❚❚" : "▶";
    stepBackBtn.disabled = !ref || state.tickIdx <= 0;
    stepFwdBtn.disabled = !ref || state.tickIdx >= max;

    // Speed buttons
    for (const btn of speedGroupEl.querySelectorAll(".speed-btn")) {
      btn.classList.toggle(
        "active",
        Number(btn.dataset.speed) === state.playSpeed
      );
    }

    // Product select (only rebuild if product set changed)
    const productsKey = ref ? ref.products.join("|") : "";
    if (productsKey !== lastProducts || ref?.id !== lastRefId) {
      productSelect.innerHTML =
        `<option value="">All products</option>` +
        (ref?.products.map((p) => `<option value="${p}">${p}</option>`).join("") ??
          "");
      lastProducts = productsKey;
      lastRefId = ref?.id ?? null;
    }
    productSelect.value = state.selectedProduct ?? "";
    productSelect.disabled = !ref;

    // Theme
    themeBtn.textContent = state.prefs.theme === "dark" ? "☀" : "☾";

    // Playback loop
    if (state.isPlaying && intervalId == null) startLoop();
    else if (!state.isPlaying && intervalId != null) stopLoop();
  }

  subscribe(render);
  render();
}
