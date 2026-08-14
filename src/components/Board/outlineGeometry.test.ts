import { describe, expect, it } from "vitest";
import { buildRoundedPolygonPath, traceOutlines, type Point } from "./outlineGeometry";
import type { CellCoord } from "../../types/level";

// buildRoundedPolygonPath 回傳一段沒有格式包裝的 SVG path 資料
// （"M x y L x y A r r 0 0 sweep x y Z"，可能好幾個 "M...Z" 串接）。逐字比對
// 整串字串一改數字格式化方式就會整批炸開，這裡用一個測試專用的 parser 把它
// 拆回結構化的線段，只斷言真正在意的語意（角的座標、圓角半徑、轉彎方向）。
type Segment =
  | { cmd: "M" | "L"; x: number; y: number }
  | { cmd: "A"; radius: number; sweepFlag: 0 | 1; x: number; y: number }
  | { cmd: "Z" };

function parsePath(path: string): Segment[] {
  const tokens = path.split(" ").filter(Boolean);
  const segments: Segment[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === "Z") {
      segments.push({ cmd: "Z" });
      i += 1;
    } else if (cmd === "M" || cmd === "L") {
      segments.push({ cmd, x: Number(tokens[i + 1]), y: Number(tokens[i + 2]) });
      i += 3;
    } else if (cmd === "A") {
      // A radius radius 0 0 sweepFlag x y
      segments.push({
        cmd: "A",
        radius: Number(tokens[i + 1]),
        sweepFlag: Number(tokens[i + 5]) as 0 | 1,
        x: Number(tokens[i + 6]),
        y: Number(tokens[i + 7]),
      });
      i += 8;
    } else {
      throw new Error(`unexpected path token: "${cmd}" at index ${i} in "${path}"`);
    }
  }
  return segments;
}

const UNIT_SQUARE: CellCoord[] = [[0, 0]];
const DOMINO: CellCoord[] = [
  [0, 0],
  [0, 1],
];
// L 形：(1,1) 是內凹的缺角。
const L_SHAPE: CellCoord[] = [
  [0, 0],
  [0, 1],
  [1, 0],
];
// 3x3 地板挖掉正中間一格——外圍一圈 + 中間坑洞一圈。
const RING: CellCoord[] = [
  [0, 0], [0, 1], [0, 2],
  [1, 0], /* hole */ [1, 2],
  [2, 0], [2, 1], [2, 2],
];

describe("traceOutlines", () => {
  it("單一格子描出順時針的 4 個角", () => {
    expect(traceOutlines(UNIT_SQUARE)).toEqual([
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 1 },
        { row: 1, col: 0 },
      ],
    ]);
  });

  it("兩格相連時，共用邊上的共線點被濾掉，只留下矩形的 4 個角", () => {
    expect(traceOutlines(DOMINO)).toEqual([
      [
        { row: 0, col: 0 },
        { row: 0, col: 2 },
        { row: 1, col: 2 },
        { row: 1, col: 0 },
      ],
    ]);
  });

  it("L 形留下 6 個角，包含一個內凹角", () => {
    expect(traceOutlines(L_SHAPE)).toEqual([
      [
        { row: 0, col: 0 },
        { row: 0, col: 2 },
        { row: 1, col: 2 },
        { row: 1, col: 1 }, // 內凹角
        { row: 2, col: 1 },
        { row: 2, col: 0 },
      ],
    ]);
  });

  it("中間有坑洞時，描出外圍跟坑洞兩圈", () => {
    // 兩圈各自從邊界的哪個角開始走，取決於 collectBoundaryEdges 內部的
    // 迭代順序（實作細節，不是語意），這裡只比較「這一圈由哪些角組成」，
    // 不比較起始點或走向。
    const cornerSet = (loop: Point[]) => new Set(loop.map((p) => `${p.row},${p.col}`));

    const loops = traceOutlines(RING);
    expect(loops).toHaveLength(2);
    const sets = loops.map(cornerSet);

    expect(sets).toContainEqual(new Set(["0,0", "0,3", "3,3", "3,0"])); // 外圍
    expect(sets).toContainEqual(new Set(["1,1", "1,2", "2,2", "2,1"])); // 坑洞
  });

  it("空輸入回傳空陣列", () => {
    expect(traceOutlines([])).toEqual([]);
  });
});

describe("buildRoundedPolygonPath", () => {
  const ORIGIN = { x: 0, y: 0 };

  it("cornerRadiusPx 為 0 時，輸出全是直線段（M/L），沒有圓角", () => {
    const loops = traceOutlines(UNIT_SQUARE);
    const path = buildRoundedPolygonPath(loops, 10, 0, 0, ORIGIN);
    const segments = parsePath(path);
    expect(segments).toEqual([
      { cmd: "M", x: 0, y: 0 },
      { cmd: "L", x: 10, y: 0 },
      { cmd: "L", x: 10, y: 10 },
      { cmd: "L", x: 0, y: 10 },
      { cmd: "Z" },
    ]);
  });

  it("凸角套用圓角時，四個角都是 sweepFlag=1（順時針轉弧）", () => {
    const loops = traceOutlines(UNIT_SQUARE);
    const path = buildRoundedPolygonPath(loops, 10, 2, 0, ORIGIN);
    const segments = parsePath(path);
    const arcs = segments.filter((s): s is Extract<Segment, { cmd: "A" }> => s.cmd === "A");
    expect(arcs).toHaveLength(4);
    for (const arc of arcs) {
      expect(arc.radius).toBe(2);
      expect(arc.sweepFlag).toBe(1);
    }
    // 左上角的圓角起點/終點：進邊沿 -y 方向、出邊沿 +x 方向各縮回半徑 2px。
    expect(segments[0]).toEqual({ cmd: "M", x: 0, y: 2 });
    expect(segments[1]).toEqual({ cmd: "A", radius: 2, sweepFlag: 1, x: 2, y: 0 });
  });

  it("L 形內凹角套用圓角時是 sweepFlag=0（逆時針轉弧）", () => {
    const loops = traceOutlines(L_SHAPE);
    const path = buildRoundedPolygonPath(loops, 10, 3, 0, ORIGIN);
    const segments = parsePath(path);
    const arcs = segments.filter((s): s is Extract<Segment, { cmd: "A" }> => s.cmd === "A");
    // 6 個角只有內凹角（(1,1)）是 sweepFlag=0，其餘 5 個凸角是 sweepFlag=1。
    const concaveArcs = arcs.filter((a) => a.sweepFlag === 0);
    expect(concaveArcs).toHaveLength(1);
    expect(concaveArcs[0].radius).toBe(3);
    expect(arcs.filter((a) => a.sweepFlag === 1)).toHaveLength(5);
  });

  it("outsetPx 讓內凹角的半徑縮小，縮到 0 以下就不再套圓角", () => {
    const loops = traceOutlines(L_SHAPE);
    // cornerRadiusPx=3, outsetPx=1 → 內凹角 signedRadius = 3-1 = 2。
    const shrunk = parsePath(buildRoundedPolygonPath(loops, 10, 3, 1, ORIGIN));
    const shrunkConcave = shrunk.filter((s): s is Extract<Segment, { cmd: "A" }> => s.cmd === "A" && s.sweepFlag === 0);
    expect(shrunkConcave).toHaveLength(1);
    expect(shrunkConcave[0].radius).toBe(2);

    // cornerRadiusPx=1, outsetPx=2 → signedRadius = 1-2 = -1，夾到 0，內凹角
    // 那個角改成直線段（沒有 A 命令）。
    const clamped = parsePath(buildRoundedPolygonPath(loops, 10, 1, 2, ORIGIN));
    const clampedArcs = clamped.filter((s): s is Extract<Segment, { cmd: "A" }> => s.cmd === "A");
    expect(clampedArcs).toHaveLength(5); // 少了原本內凹角那一個
  });

  it("origin 位移整份輸出座標", () => {
    const loops = traceOutlines(UNIT_SQUARE);
    const path = buildRoundedPolygonPath(loops, 10, 0, 0, { x: 5, y: 7 });
    expect(parsePath(path)).toEqual([
      { cmd: "M", x: 5, y: 7 },
      { cmd: "L", x: 15, y: 7 },
      { cmd: "L", x: 15, y: 17 },
      { cmd: "L", x: 5, y: 17 },
      { cmd: "Z" },
    ]);
  });

  it("多圈輸入輸出多個 M...Z 子路徑", () => {
    const loops = traceOutlines(RING);
    const path = buildRoundedPolygonPath(loops, 10, 0, 0, ORIGIN);
    const segments = parsePath(path);
    const moveCount = segments.filter((s) => s.cmd === "M").length;
    const closeCount = segments.filter((s) => s.cmd === "Z").length;
    expect(moveCount).toBe(2);
    expect(closeCount).toBe(2);
  });

  it("cellPitchPx <= 0 或空圈時回傳空字串", () => {
    expect(buildRoundedPolygonPath(traceOutlines(UNIT_SQUARE), 0, 2, 0, ORIGIN)).toBe("");
    expect(buildRoundedPolygonPath([], 10, 2, 0, ORIGIN)).toBe("");
  });
});
