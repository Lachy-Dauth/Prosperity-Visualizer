import { useEffect, useRef } from "react";
import { useStore, getReferenceStrategy } from "../lib/store";
import {
  InfoIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  StepBackIcon,
  StepFwdIcon,
  SunIcon,
} from "./Icons";

const SPEEDS = [1, 2, 5, 10, 20];

interface Props {
  onShowAbout: () => void;
}

export function TopBar({ onShowAbout }: Props) {
  const ref = useStore(getReferenceStrategy);
  const tickIdx = useStore((s) => s.tickIdx);
  const setTickIdx = useStore((s) => s.setTickIdx);
  const stepTick = useStore((s) => s.stepTick);
  const isPlaying = useStore((s) => s.isPlaying);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const playSpeed = useStore((s) => s.playSpeed);
  const setPlaySpeed = useStore((s) => s.setPlaySpeed);
  const selectedProduct = useStore((s) => s.selectedProduct);
  const setSelectedProduct = useStore((s) => s.setSelectedProduct);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);

  const max = ref ? ref.timestamps.length - 1 : 0;
  const tickDay = ref?.days?.[tickIdx];
  const tickTs = ref?.rawTimestamps?.[tickIdx] ?? ref?.timestamps?.[tickIdx] ?? 0;
  const hasMultipleDays = ref
    ? ref.days && ref.days.length > 0 && ref.days[0] !== ref.days[ref.days.length - 1]
    : false;

  // Playback loop
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  useEffect(() => {
    if (!isPlaying || !ref) return;
    let cancelled = false;
    const loop = (now: number) => {
      if (cancelled) return;
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      const cur = useStore.getState().tickIdx;
      const inc = playSpeed * dt;
      const next = Math.min(max, cur + inc);
      setTickIdx(Math.floor(next));
      if (next >= max) {
        setIsPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, playSpeed, max, ref, setTickIdx, setIsPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " ") {
        e.preventDefault();
        setIsPlaying(!useStore.getState().isPlaying);
      } else if (e.key === "ArrowRight") {
        stepTick(e.shiftKey ? 100 : 1);
      } else if (e.key === "ArrowLeft") {
        stepTick(e.shiftKey ? -100 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setIsPlaying, stepTick]);

  function toggleTheme() {
    const next = prefs.theme === "dark" ? "light" : "dark";
    setPrefs({ theme: next });
    document.documentElement.classList.toggle("light", next === "light");
  }

  return (
    <div className="flex flex-col gap-1.5 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          className="btn !px-1.5 !py-1.5"
          onClick={() => stepTick(-10)}
          disabled={!ref || tickIdx <= 0}
          title="Step back 10 (Shift+← for 100)"
        >
          <StepBackIcon />
        </button>
        <button
          className={`btn !px-2 !py-1.5 ${isPlaying ? "btn-primary" : ""}`}
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={!ref}
          title="Space to play/pause"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          className="btn !px-1.5 !py-1.5"
          onClick={() => stepTick(10)}
          disabled={!ref || tickIdx >= max}
          title="Step forward 10 (Shift+→ for 100)"
        >
          <StepFwdIcon />
        </button>
        <div className="ml-1 flex items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-900 px-0.5 py-0.5">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              onClick={() => setPlaySpeed(sp)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                playSpeed === sp
                  ? "bg-accent-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {sp}×
            </button>
          ))}
        </div>

        <div className="mx-2 flex flex-1 items-center gap-2">
          <input
            type="range"
            min={0}
            max={max}
            step={1}
            value={tickIdx}
            onChange={(e) => setTickIdx(Number(e.target.value))}
            disabled={!ref}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-accent-500"
          />
          <div className="num shrink-0 whitespace-nowrap text-[11px] text-zinc-300">
            Tick <span className="text-zinc-100">{tickIdx}</span> /{" "}
            <span className="text-zinc-500">{max}</span> ·{" "}
            {hasMultipleDays && tickDay !== undefined && (
              <>
                <span className="text-zinc-100">D{tickDay}</span>{" "}
              </>
            )}
            TS{" "}
            <span className="text-zinc-100">{tickTs.toLocaleString()}</span>
          </div>
        </div>

        <button
          className="btn !px-1.5 !py-1.5"
          onClick={toggleTheme}
          title="Toggle theme"
        >
          {prefs.theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          className="btn !px-1.5 !py-1.5"
          onClick={onShowAbout}
          title="About / privacy"
        >
          <InfoIcon />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Filters
        </span>
        <select
          className="input !w-auto !py-0.5"
          value={selectedProduct ?? ""}
          onChange={(e) => setSelectedProduct(e.target.value || null)}
          disabled={!ref}
        >
          <option value="">All products</option>
          {ref?.products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="ml-auto inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          Local-only · No uploads
        </span>
      </div>
    </div>
  );
}
