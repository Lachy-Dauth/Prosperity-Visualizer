import { useMemo, useState } from "react";
import { useStore, getReferenceStrategy } from "../../lib/store";
import { decodeLambdaLog } from "../../lib/parser";

type Tab = "sandbox" | "lambda" | "trader";

export function LogsPanel() {
  const ref = useStore(getReferenceStrategy);
  const tickIdx = useStore((s) => s.tickIdx);
  const [tab, setTab] = useState<Tab>("lambda");

  const view = useMemo(() => {
    if (!ref) return null;
    const ts = ref.timestamps[tickIdx];
    const idxInfo = ref.logIndexByTick[ts];
    if (!idxInfo) return { sandbox: "", lambda: "", decoded: null as ReturnType<typeof decodeLambdaLog> | null };
    const entry = ref.rawLogs[idxInfo.start];
    const decoded = decodeLambdaLog(entry?.lambdaLog ?? "");
    return {
      sandbox: entry?.sandboxLog ?? "",
      lambda: entry?.lambdaLog ?? "",
      decoded,
    };
  }, [ref, tickIdx]);

  if (!ref) {
    return <div className="p-3 text-xs text-zinc-500">No strategy loaded.</div>;
  }
  if (!view) return null;

  const showRaw = tab === "sandbox" ? view.sandbox : view.lambda;
  const isEmpty = showRaw.trim().length === 0 && !(tab === "trader" && view.decoded?.ok);

  return (
    <div className="flex h-full flex-col">
      <div className="panel-header">
        <div className="flex items-center gap-1">
          {(["sandbox", "lambda", "trader"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                tab === t
                  ? "bg-accent-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t === "sandbox" ? "Sandbox" : t === "lambda" ? "Algorithm" : "Trader Data"}
            </button>
          ))}
        </div>
        <span className="num normal-case tracking-normal text-zinc-500">
          TS {ref.rawTimestamps[tickIdx]?.toLocaleString()}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {tab === "trader" ? (
          view.decoded?.ok ? (
            <pre className="whitespace-pre-wrap break-all font-mono text-[10.5px] leading-snug text-zinc-300">
              {view.decoded.pretty}
            </pre>
          ) : (
            <EmptyState
              text="No structured trader data at this tick."
              hint='If you expect this tab to show state dumps, your algo needs to use the jmerle-style Logger shim. See the README link in About → "Algorithm logs are empty?".'
            />
          )
        ) : isEmpty ? (
          <EmptyState
            text={`No ${tab === "sandbox" ? "sandbox" : "algorithm"} logs at this tick.`}
            hint={
              tab === "lambda"
                ? "If you're expecting algorithm logs, your submission needs to print() something each tick."
                : "Sandbox logs are usually empty unless something went wrong on the IMC side."
            }
          />
        ) : (
          <pre className="whitespace-pre-wrap break-all font-mono text-[10.5px] leading-snug text-zinc-300">
            {showRaw}
          </pre>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-[11px] text-zinc-500">
      <span>{text}</span>
      {hint && <span className="max-w-md text-[10px] text-zinc-600">{hint}</span>}
    </div>
  );
}
