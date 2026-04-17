import { useRef, useState } from "react";
import { useStore } from "../lib/store";
import { pickColor } from "../lib/colors";
import { uid } from "../lib/uid";
import { parseLogText } from "../lib/parserClient";
import { loadDemoLog } from "../lib/demoLog";
import { ChevronLeftIcon, GithubIcon, StarIcon, UploadIcon, XIcon } from "./Icons";
import { fmtInt } from "../lib/format";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  onShowAbout: () => void;
}

export function StrategyRail({ collapsed, onToggle, onShowAbout }: Props) {
  const strategies = useStore((s) => s.strategies);
  const referenceId = useStore((s) => s.referenceId);
  const comparingIds = useStore((s) => s.comparingIds);
  const setReference = useStore((s) => s.setReference);
  const toggleComparing = useStore((s) => s.toggleComparing);
  const removeStrategy = useStore((s) => s.removeStrategy);
  const renameStrategy = useStore((s) => s.renameStrategy);
  const recolorStrategy = useStore((s) => s.recolorStrategy);
  const addStrategy = useStore((s) => s.addStrategy);
  const setParseProgress = useStore((s) => s.setParseProgress);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const parseProgress = useStore((s) => s.parseProgress);

  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const usedColors = strategies.map((s) => s.color);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    // Track colors picked within this batch so parallel/sequential picks
    // don't all return the same first-unused palette entry.
    const batchColors = [...usedColors];
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
        await addStrategy(strat);
      } catch (e) {
        alert(`Failed to parse ${f.name}: ${(e as Error).message}`);
      } finally {
        setParseProgress(null);
      }
    }
  }

  async function loadDemo() {
    const id = uid("demo");
    try {
      setParseProgress({ id, pct: 0, message: "Loading demo…" });
      const text = await loadDemoLog();
      const strat = await parseLogText(
        text,
        {
          id,
          name: "Demo — IMC Day 0 Sample",
          color: pickColor(usedColors),
          filename: "demo.log",
        },
        { onProgress: (pct, message) => setParseProgress({ id, pct, message }) }
      );
      await addStrategy(strat);
    } catch (e) {
      alert(`Demo load failed: ${(e as Error).message}`);
    } finally {
      setParseProgress(null);
    }
  }

  if (collapsed) {
    return (
      <div className="flex w-10 flex-col items-center border-r border-zinc-800 bg-zinc-950 py-2">
        <button className="btn !px-1.5 !py-1.5" onClick={onToggle} title="Expand panel">
          <ChevronLeftIcon style={{ transform: "rotate(180deg)" }} />
        </button>
        <div className="mt-3 flex flex-col gap-1.5">
          {strategies.slice(0, 12).map((s) => (
            <button
              key={s.id}
              title={s.name}
              onClick={() => setReference(s.id)}
              className="h-3 w-3 rounded-sm ring-offset-zinc-950"
              style={{
                backgroundColor: s.color,
                outline: referenceId === s.id ? "1.5px solid white" : undefined,
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between px-3 pt-3 pb-2">
        <div>
          <div className="text-sm font-semibold text-zinc-100">OpenProsperity</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Visualizer · Local-first
          </div>
        </div>
        <button className="btn !px-1.5 !py-1.5" onClick={onToggle} title="Collapse">
          <ChevronLeftIcon />
        </button>
      </header>

      <div
        className={`mx-3 mb-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-4 text-center text-xs transition-colors ${
          dragOver
            ? "dropzone-active"
            : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
        }}
      >
        <UploadIcon />
        <div>
          <div className="font-medium text-zinc-300">Drop .log files</div>
          <div className="mt-0.5 text-[10px] text-zinc-500">
            or click — multiple OK
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".log,.json,application/json"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {parseProgress && (
        <div className="mx-3 mb-3 rounded-md border border-zinc-800 bg-zinc-900 p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-400">
            <span>{parseProgress.message}</span>
            <span className="num">{parseProgress.pct.toFixed(0)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded bg-zinc-800">
            <div
              className="h-full bg-accent-500 transition-all"
              style={{ width: `${parseProgress.pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {strategies.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-zinc-500">
            No logs loaded yet.
            <button
              onClick={loadDemo}
              className="btn mt-3 w-full"
            >
              Load demo log
            </button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {strategies.map((s) => {
              const isRef = referenceId === s.id;
              const isCmp = comparingIds.has(s.id);
              return (
                <li
                  key={s.id}
                  className={`group rounded-md border px-2 py-2 transition-colors ${
                    isRef
                      ? "border-accent-700 bg-accent-700/10"
                      : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <label className="relative mt-0.5 inline-block h-3 w-3 cursor-pointer">
                      <input
                        type="color"
                        value={s.color}
                        onChange={(e) => recolorStrategy(s.id, e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        title="Recolor strategy"
                      />
                      <span
                        className="block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: s.color }}
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      {editing === s.id ? (
                        <input
                          autoFocus
                          className="input !py-0.5 !text-xs"
                          defaultValue={s.name}
                          onBlur={(e) => {
                            renameStrategy(s.id, e.target.value || s.name);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <button
                          className="block w-full truncate text-left text-xs font-medium text-zinc-100"
                          onClick={() => setReference(s.id)}
                          onDoubleClick={() => setEditing(s.id)}
                          title={`${s.name}\n${s.submissionId}\nDouble-click to rename`}
                        >
                          {s.name}
                        </button>
                      )}
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                        <span className="num">{fmtInt(s.timestamps.length)} ticks</span>
                        <span>·</span>
                        <span>{s.products.length} sym</span>
                        <span>·</span>
                        <span
                          className={
                            s.summary.totalPnl >= 0
                              ? "num text-emerald-400"
                              : "num text-rose-400"
                          }
                        >
                          {s.summary.totalPnl >= 0 ? "+" : ""}
                          {Math.round(s.summary.totalPnl).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 text-[10px]">
                        <label className="inline-flex cursor-pointer items-center gap-1 text-zinc-400">
                          <input
                            type="radio"
                            name="reference"
                            checked={isRef}
                            onChange={() => setReference(s.id)}
                            className="h-3 w-3 accent-accent-500"
                          />
                          ref
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-1 text-zinc-400">
                          <input
                            type="checkbox"
                            checked={isCmp}
                            onChange={() => toggleComparing(s.id)}
                            className="h-3 w-3 accent-accent-500"
                          />
                          compare
                        </label>
                        <button
                          className="ml-auto opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                          onClick={() => {
                            if (confirm(`Remove ${s.name}?`)) removeStrategy(s.id);
                          }}
                          title="Remove"
                        >
                          <XIcon width={12} height={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {strategies.length > 0 && (
              <li className="pt-2">
                <button onClick={loadDemo} className="btn w-full">
                  + Add demo
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      <footer className="border-t border-zinc-800 p-3">
        <label className="mb-2 flex cursor-pointer items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span>Save to browser (IndexedDB)</span>
          <input
            type="checkbox"
            checked={prefs.persistEnabled}
            onChange={(e) => setPrefs({ persistEnabled: e.target.checked })}
            className="h-3.5 w-3.5 accent-accent-500"
          />
        </label>
        <div className="mb-3 text-[10px] leading-snug text-zinc-500">
          Off by default. Your log <strong className="text-zinc-300">never</strong>{" "}
          leaves this tab.{" "}
          <button onClick={onShowAbout} className="text-accent-400 hover:underline">
            Why?
          </button>
        </div>
        <a
          href="https://github.com/lachy-dauth/prosperity-visualizer"
          target="_blank"
          rel="noreferrer"
          className="btn w-full !py-1.5"
        >
          <GithubIcon /> <span className="flex-1 text-left">Open source</span>{" "}
          <StarIcon /> Star
        </a>
      </footer>
    </aside>
  );
}
