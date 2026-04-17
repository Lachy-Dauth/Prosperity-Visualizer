export interface RawLogEntry {
  sandboxLog: string;
  lambdaLog: string;
  timestamp: number;
}

export interface RawTrade {
  timestamp: number;
  buyer: string;
  seller: string;
  symbol: string;
  currency: string;
  price: number;
  quantity: number;
}

export interface RawLogFile {
  submissionId: string;
  activitiesLog: string;
  logs: RawLogEntry[];
  tradeHistory: RawTrade[];
}

export interface OrderBookLevel {
  price: number;
  volume: number;
}

export interface ProductTickRow {
  day: number;
  timestamp: number;
  product: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midPrice: number;
  pnl: number;
}

/**
 * Per-product time series. Indices align across all arrays and match the
 * parent strategy's `timestamps` / `days` / `rawTimestamps` arrays.
 * Missing/empty data uses NaN. Stored as plain arrays (not typed) for
 * ergonomic NaN handling and uPlot compatibility.
 */
export interface ProductSeries {
  product: string;
  timestamps: number[];
  midPrice: number[];
  microPrice: number[];
  spread: number[];
  bestBid: number[];
  bestAsk: number[];
  bidVol: number[];
  askVol: number[];
  imbalance: number[];
  pnl: number[];
  position: number[];
  cumOwnVolume: number[];
  /** per-tick raw book snapshots (for the order book panel) */
  books: { bids: OrderBookLevel[]; asks: OrderBookLevel[] }[];
  /**
   * Per-tick list of indices into the parent strategy's `ownFills`
   * array. Each entry is the list of own-fill indices whose trade hit
   * this product at this tick. Empty array when no own fills.
   */
  ownFillIndices: number[][];
}

export interface OwnFill {
  timestamp: number;
  product: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  cashFlow: number;
}

export interface SummaryMetrics {
  totalPnl: number;
  perProductPnl: Record<string, number>;
  maxDrawdown: number;
  maxAbsPosition: number;
  tradeCount: number;
  winRate: number;
  sharpe: number;
  finalPositions: Record<string, number>;
}

export interface DecodedLambdaLog {
  ok: boolean;
  pretty?: string;
  state?: unknown;
  orders?: unknown;
  conversions?: unknown;
  traderData?: unknown;
  error?: string;
}

export interface ParsedStrategy {
  /** stable id for this strategy (uuid-ish) */
  id: string;
  /** original submissionId from the log file */
  submissionId: string;
  /** display name (user-editable, defaults to filename) */
  name: string;
  /** color swatch (#rrggbb) */
  color: string;
  /** original filename if known */
  filename?: string;
  /**
   * Sorted, unique tick keys used as the x-axis for all charts and as
   * the index into every per-tick array in this strategy.
   *
   * Each key is `day * DAY_STRIDE + raw_timestamp` so ticks stay unique
   * across day boundaries in multi-day logs where timestamps reset to 0
   * each day. For single-day (day=0) logs a key equals its raw
   * timestamp, which is the common case.
   *
   * Use `rawTimestamps[i]` for the human-facing timestamp at tick `i`,
   * and `days[i]` for its day.
   */
  timestamps: number[];
  /** Parallel array: raw per-tick timestamp (0..~999900). */
  rawTimestamps: number[];
  /** Parallel array: per-tick `day` value from the activitiesLog. */
  days: number[];
  /** sorted unique product list */
  products: string[];
  /** product → time series (length aligned with timestamps) */
  series: Record<string, ProductSeries>;
  /** flat cumulative PnL across all products, aligned with timestamps */
  totalPnl: number[];
  /** all sandbox/lambda logs in original file order */
  rawLogs: RawLogEntry[];
  /** all SUBMISSION fills, in chronological order */
  ownFills: OwnFill[];
  /** all trades (all bots, in chronological order) */
  trades: RawTrade[];
  /** per-tick-key log-index range (start,count) into rawLogs */
  logIndexByTick: Record<number, { start: number; count: number }>;
  /** position limits by product (overridable in UI) */
  positionLimits: Record<string, number>;
  summary: SummaryMetrics;
  /** ISO date string of when the file was loaded */
  loadedAt: string;
}

/**
 * Tick keys are built as `day * DAY_STRIDE + raw_timestamp`. 1_000_000 is
 * larger than the max timestamp in any single IMC Prosperity day
 * (999_900 for a full 10k-tick day) so the components never overlap.
 */
export const DAY_STRIDE = 1_000_000;

export interface ParseProgress {
  phase: "reading" | "parsing-csv" | "computing" | "done";
  pct: number;
  message: string;
}

export interface ParseResult {
  ok: true;
  strategy: ParsedStrategy;
}

export interface ParseError {
  ok: false;
  error: string;
}
