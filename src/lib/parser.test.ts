import { describe, expect, it } from "vitest";
import { buildStrategy, decodeLambdaLog, parseActivitiesCsv } from "./parser";
import { DAY_STRIDE, type RawLogFile } from "../types";

const CSV = `day;timestamp;product;bid_price_1;bid_volume_1;bid_price_2;bid_volume_2;bid_price_3;bid_volume_3;ask_price_1;ask_volume_1;ask_price_2;ask_volume_2;ask_price_3;ask_volume_3;mid_price;profit_and_loss
0;0;AAA;100;10;;;;;101;10;;;;;100.5;0.0
0;0;BBB;200;5;199;3;;;202;5;;;;;201.0;0.0
0;100;AAA;101;12;;;;;102;12;;;;;101.5;10.0
0;100;BBB;;;;;;;202;5;;;;;202.0;-5.0
`;

const RAW: RawLogFile = {
  submissionId: "test",
  activitiesLog: CSV,
  logs: [
    { sandboxLog: "", lambdaLog: "", timestamp: 0 },
    { sandboxLog: "", lambdaLog: "", timestamp: 100 },
  ],
  tradeHistory: [
    {
      timestamp: 0,
      buyer: "SUBMISSION",
      seller: "",
      symbol: "AAA",
      currency: "X",
      price: 100,
      quantity: 5,
    },
    {
      timestamp: 100,
      buyer: "",
      seller: "SUBMISSION",
      symbol: "AAA",
      currency: "X",
      price: 102,
      quantity: 2,
    },
    {
      timestamp: 100,
      buyer: "",
      seller: "",
      symbol: "BBB",
      currency: "X",
      price: 200,
      quantity: 1,
    },
  ],
};

describe("parseActivitiesCsv", () => {
  it("parses a simple 2-tick, 2-product CSV", () => {
    const rows = parseActivitiesCsv(CSV);
    expect(rows).toHaveLength(4);
    const aaa0 = rows.find((r) => r.timestamp === 0 && r.product === "AAA")!;
    expect(aaa0.bids[0]).toEqual({ price: 100, volume: 10 });
    expect(aaa0.asks[0]).toEqual({ price: 101, volume: 10 });
    expect(aaa0.midPrice).toBe(100.5);
  });

  it("handles missing depth levels", () => {
    const rows = parseActivitiesCsv(CSV);
    const bbb100 = rows.find((r) => r.timestamp === 100 && r.product === "BBB")!;
    expect(bbb100.bids).toHaveLength(0);
    expect(bbb100.asks).toHaveLength(1);
  });
});

describe("buildStrategy", () => {
  it("computes position trace from SUBMISSION fills", () => {
    const rows = parseActivitiesCsv(CSV);
    const s = buildStrategy(RAW, rows, {
      id: "a",
      name: "test",
      color: "#f00",
    });
    expect(s.products).toEqual(["AAA", "BBB"]);
    // day-0 log: composite tick keys equal raw timestamps.
    expect(s.timestamps).toEqual([0, 100]);
    expect(s.rawTimestamps).toEqual([0, 100]);
    expect(s.days).toEqual([0, 0]);
    // After tick 0, we bought 5 AAA
    expect(s.series.AAA.position[0]).toBe(5);
    // After tick 100, we sold 2 AAA, net +3
    expect(s.series.AAA.position[1]).toBe(3);
    // BBB never traded (the pure market trade doesn't affect us)
    expect(s.series.BBB.position[0]).toBe(0);
    expect(s.series.BBB.position[1]).toBe(0);
  });

  it("produces own-fill cashflow with correct sign", () => {
    const rows = parseActivitiesCsv(CSV);
    const s = buildStrategy(RAW, rows, {
      id: "a",
      name: "test",
      color: "#f00",
    });
    expect(s.ownFills).toHaveLength(2);
    // buy cash-out: negative
    expect(s.ownFills[0].cashFlow).toBe(-500);
    // sell cash-in: positive
    expect(s.ownFills[1].cashFlow).toBe(204);
  });

  it("computes totalPnl as running sum of per-product cumulative PnL", () => {
    const rows = parseActivitiesCsv(CSV);
    const s = buildStrategy(RAW, rows, {
      id: "a",
      name: "test",
      color: "#f00",
    });
    // AAA pnl at t=100 is 10; BBB pnl at t=100 is -5 → total 5
    expect(s.totalPnl[1]).toBeCloseTo(5);
  });

  it("computes summary max drawdown", () => {
    const rows = parseActivitiesCsv(CSV);
    const s = buildStrategy(RAW, rows, {
      id: "a",
      name: "test",
      color: "#f00",
    });
    // total pnl goes 0 -> 5, no drawdown
    expect(s.summary.maxDrawdown).toBe(0);
  });

  it("tags own-fills per (product, tick) without collapsing onto unrelated fills", () => {
    // Two products trade at the same timestamp — interleaved in ownFills.
    const csv = `day;timestamp;product;bid_price_1;bid_volume_1;bid_price_2;bid_volume_2;bid_price_3;bid_volume_3;ask_price_1;ask_volume_1;ask_price_2;ask_volume_2;ask_price_3;ask_volume_3;mid_price;profit_and_loss
0;0;AAA;100;10;;;;;101;10;;;;;100.5;0.0
0;0;BBB;200;5;;;;;202;5;;;;;201.0;0.0
`;
    const raw: RawLogFile = {
      submissionId: "t2",
      activitiesLog: csv,
      logs: [{ sandboxLog: "", lambdaLog: "", timestamp: 0 }],
      tradeHistory: [
        { timestamp: 0, buyer: "SUBMISSION", seller: "", symbol: "AAA",
          currency: "X", price: 100, quantity: 1 },
        { timestamp: 0, buyer: "SUBMISSION", seller: "", symbol: "BBB",
          currency: "X", price: 200, quantity: 2 },
        { timestamp: 0, buyer: "SUBMISSION", seller: "", symbol: "AAA",
          currency: "X", price: 101, quantity: 3 },
      ],
    };
    const rows = parseActivitiesCsv(csv);
    const s = buildStrategy(raw, rows, { id: "a", name: "t", color: "#0f0" });
    // AAA has two fills at tick 0 (quantities 1 and 3), BBB has one (qty 2).
    const aaaIdx = s.series.AAA.ownFillIndices[0];
    const bbbIdx = s.series.BBB.ownFillIndices[0];
    expect(aaaIdx).toHaveLength(2);
    expect(bbbIdx).toHaveLength(1);
    // Dereferencing the indices must return only fills for that product.
    expect(aaaIdx.every((i) => s.ownFills[i].product === "AAA")).toBe(true);
    expect(bbbIdx.every((i) => s.ownFills[i].product === "BBB")).toBe(true);
  });

  it("handles multi-day logs where timestamps reset each day", () => {
    // Two days × two ticks × one product, ts resets 0 each day.
    const csv = `day;timestamp;product;bid_price_1;bid_volume_1;bid_price_2;bid_volume_2;bid_price_3;bid_volume_3;ask_price_1;ask_volume_1;ask_price_2;ask_volume_2;ask_price_3;ask_volume_3;mid_price;profit_and_loss
0;0;AAA;100;10;;;;;101;10;;;;;100.5;0.0
0;100;AAA;100;10;;;;;101;10;;;;;100.5;5.0
1;0;AAA;110;10;;;;;111;10;;;;;110.5;0.0
1;100;AAA;110;10;;;;;111;10;;;;;110.5;10.0
`;
    const raw: RawLogFile = {
      submissionId: "md",
      activitiesLog: csv,
      logs: [
        { sandboxLog: "", lambdaLog: "d0t0", timestamp: 0 },
        { sandboxLog: "", lambdaLog: "d0t100", timestamp: 100 },
        { sandboxLog: "", lambdaLog: "d1t0", timestamp: 0 },
        { sandboxLog: "", lambdaLog: "d1t100", timestamp: 100 },
      ],
      // Trades in file order: day 0 ts=0, day 0 ts=100, day 1 ts=0
      // (ts dropping from 100 back to 0 is how we detect a day rollover).
      tradeHistory: [
        { timestamp: 0, buyer: "SUBMISSION", seller: "", symbol: "AAA",
          currency: "X", price: 100, quantity: 1 },
        { timestamp: 100, buyer: "SUBMISSION", seller: "", symbol: "AAA",
          currency: "X", price: 101, quantity: 1 },
        { timestamp: 0, buyer: "SUBMISSION", seller: "", symbol: "AAA",
          currency: "X", price: 110, quantity: 2 },
      ],
    };
    const rows = parseActivitiesCsv(csv);
    const s = buildStrategy(raw, rows, { id: "md", name: "md", color: "#00f" });
    // 4 unique ticks: (0,0) (0,100) (1,0) (1,100).
    expect(s.timestamps).toHaveLength(4);
    // Ticks are ordered chronologically by composite key.
    expect(s.timestamps).toEqual([
      0,
      100,
      DAY_STRIDE + 0,
      DAY_STRIDE + 100,
    ]);
    expect(s.days).toEqual([0, 0, 1, 1]);
    expect(s.rawTimestamps).toEqual([0, 100, 0, 100]);
    // Logs still retrievable at each tick without day collision.
    const d0t0 = s.logIndexByTick[0];
    const d1t0 = s.logIndexByTick[DAY_STRIDE + 0];
    expect(d0t0).toBeDefined();
    expect(d1t0).toBeDefined();
    expect(s.rawLogs[d0t0.start].lambdaLog).toBe("d0t0");
    expect(s.rawLogs[d1t0.start].lambdaLog).toBe("d1t0");
    // Position walks: +1 after day 0 ts=0, +2 after day 0 ts=100, +4 after
    // day 1 ts=0 (the ts-dropped trade is assigned to day 1), holds through
    // day 1 ts=100.
    expect(s.series.AAA.position[0]).toBe(1);
    expect(s.series.AAA.position[1]).toBe(2);
    expect(s.series.AAA.position[2]).toBe(4);
    expect(s.series.AAA.position[3]).toBe(4);
  });
});

describe("decodeLambdaLog", () => {
  it("returns not-ok for empty input", () => {
    expect(decodeLambdaLog("")).toEqual({ ok: false, error: "empty" });
  });
  it("decodes a base64 JSON blob", () => {
    const payload = [{ t: 100 }, [], 0, "td", ""];
    const encoded = btoa(JSON.stringify(payload));
    const d = decodeLambdaLog(`some preamble\n${encoded}`);
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.traderData).toBe("td");
  });
});
