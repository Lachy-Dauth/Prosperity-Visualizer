import React, { useCallback, useMemo } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import { KpiPanel } from "./panels/KpiPanel";
import { PnlChartPanel } from "./panels/PnlChartPanel";
import { PriceChartPanel } from "./panels/PriceChartPanel";
import { PositionChartPanel } from "./panels/PositionChartPanel";
import { SummaryTablePanel } from "./panels/SummaryTablePanel";
import { OrderBookPanel } from "./panels/OrderBookPanel";
import { PressurePanel } from "./panels/PressurePanel";
import { OwnFillsPanel } from "./panels/OwnFillsPanel";
import { LogsPanel } from "./panels/LogsPanel";

const ReactGridLayout = WidthProvider(GridLayout);

const LAYOUT_KEY = "openprosperity:layout:v1";

const DEFAULT_LAYOUT: Layout[] = [
  { i: "kpi", x: 0, y: 0, w: 12, h: 3, minH: 2 },
  { i: "pnl", x: 0, y: 3, w: 8, h: 7, minH: 4, minW: 3 },
  { i: "summary", x: 8, y: 3, w: 4, h: 7, minH: 4, minW: 3 },
  { i: "price", x: 0, y: 10, w: 8, h: 7, minH: 4, minW: 3 },
  { i: "book", x: 8, y: 10, w: 2, h: 7, minH: 4, minW: 2 },
  { i: "pressure", x: 10, y: 10, w: 2, h: 3, minH: 2, minW: 2 },
  { i: "position", x: 0, y: 17, w: 6, h: 6, minH: 4, minW: 3 },
  { i: "fills", x: 6, y: 17, w: 3, h: 6, minH: 4, minW: 3 },
  { i: "logs", x: 9, y: 17, w: 3, h: 6, minH: 4, minW: 3 },
];

// Map panel id → component
const PANELS: Record<string, React.ComponentType> = {
  kpi: KpiPanel,
  pnl: PnlChartPanel,
  summary: SummaryTablePanel,
  price: PriceChartPanel,
  book: OrderBookPanel,
  pressure: PressurePanel,
  position: PositionChartPanel,
  fills: OwnFillsPanel,
  logs: LogsPanel,
};

function loadLayout(): Layout[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return DEFAULT_LAYOUT;
}

function saveLayout(l: Layout[]) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
  } catch {
    /* ignore */
  }
}

export function Dashboard() {
  const layout = useMemo(() => {
    const loaded = loadLayout();
    // ensure all panels are present (add missing with defaults)
    const present = new Set(loaded.map((l) => l.i));
    const merged = [...loaded];
    for (const def of DEFAULT_LAYOUT) {
      if (!present.has(def.i)) merged.push(def);
    }
    return merged.filter((l) => l.i in PANELS);
  }, []);

  const onLayoutChange = useCallback((l: Layout[]) => {
    saveLayout(l);
  }, []);

  return (
    <ReactGridLayout
      className="layout"
      layout={layout}
      cols={12}
      rowHeight={28}
      margin={[8, 8]}
      containerPadding={[8, 8]}
      onLayoutChange={onLayoutChange}
      draggableHandle=".panel-header"
      compactType="vertical"
      isResizable
      isDraggable
    >
      {layout.map((item) => {
        const Comp = PANELS[item.i];
        if (!Comp) return <div key={item.i} />;
        return (
          <div key={item.i} className="panel overflow-hidden">
            <Comp />
          </div>
        );
      })}
    </ReactGridLayout>
  );
}
