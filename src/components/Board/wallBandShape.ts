// 把整個地板區塊的外圍（可能含內部坑洞，例如 level 8 的單格坑洞）描成一份
// clip-path 多邊形，往外推 BOUNDARY_THICKNESS，畫出「一整條圍住地板的色帶」
// ——所有牆、所有門都是這同一塊形狀的一部分，門只是疊在上面換色的區塊，
// 色帶本身不會在門/牆交界處露出縫隙。
//
// 跟 blockShape.ts 的演算法同一套（外圍描邊→濾共線→依轉彎方向套圓角→
// 往外推），差別只在這裡改成「可能有好幾圈邊界」（外圍一圈 + 每個坑洞各自
// 一圈），blockShape.ts 明確假設方塊不帶洞、只處理第一圈就結束（見該檔案
// 開頭註解），這裡把「描一圈」改成「描完所有圈」。
//
// 方向規則沿用 blockShape.ts：每一條邊界邊都讓「地板」固定在行進方向的
// 右手邊。外圍那一圈因此是順時針，坑洞那一圈（地板在坑洞外側）則自然會是
// 逆時針——兩者疊在同一份 path data 裡，靠 clip-path 預設的 nonzero
// fill-rule，方向相反的兩圈剛好讓坑洞「挖空」，不需要另外判斷這一圈是外圍
// 還是坑洞。往外推／圓角的每一步計算都只看「這一段邊/這個角自己的局部方向」
// （由上面那條「地板在右手邊」規則保證），不需要知道自己屬於哪一圈，所以
// 外圍跟坑洞可以共用同一份逐角公式。

import type { CellCoord } from "../../types/level";

interface Point {
  row: number;
  col: number;
}

function pointKey(p: Point): string {
  return `${p.row},${p.col}`;
}

function collectBoundaryEdges(cells: CellCoord[]): [Point, Point][] {
  const occupied = new Set(cells.map(([r, c]) => `${r},${c}`));
  const has = (r: number, c: number) => occupied.has(`${r},${c}`);
  const edges: [Point, Point][] = [];
  for (const [r, c] of cells) {
    if (!has(r - 1, c)) edges.push([{ row: r, col: c }, { row: r, col: c + 1 }]);
    if (!has(r, c + 1)) edges.push([{ row: r, col: c + 1 }, { row: r + 1, col: c + 1 }]);
    if (!has(r + 1, c)) edges.push([{ row: r + 1, col: c + 1 }, { row: r + 1, col: c }]);
    if (!has(r, c - 1)) edges.push([{ row: r + 1, col: c }, { row: r, col: c }]);
  }
  return edges;
}

// 把邊界邊串成好幾圈有序頂點（外圍一圈＋每個坑洞各一圈），再各自濾掉共線
// 中間點，只留下真正轉彎的角。
function traceAllOutlines(cells: CellCoord[]): Point[][] {
  const edges = collectBoundaryEdges(cells);
  if (edges.length === 0) return [];

  const next = new Map<string, Point>();
  for (const [from, to] of edges) next.set(pointKey(from), to);

  const visited = new Set<string>();
  const loops: Point[][] = [];

  for (const [start] of edges) {
    if (visited.has(pointKey(start))) continue;
    const loop: Point[] = [start];
    visited.add(pointKey(start));
    let current = start;
    for (let i = 0; i < edges.length; i++) {
      const to = next.get(pointKey(current));
      if (!to || pointKey(to) === pointKey(start)) break;
      loop.push(to);
      visited.add(pointKey(to));
      current = to;
    }
    if (loop.length >= 3) loops.push(loop);
  }

  return loops.map((loop) => {
    const n = loop.length;
    const corners: Point[] = [];
    for (let i = 0; i < n; i++) {
      const prev = loop[(i - 1 + n) % n];
      const curr = loop[i];
      const nextPt = loop[(i + 1) % n];
      const d1 = { row: curr.row - prev.row, col: curr.col - prev.col };
      const d2 = { row: nextPt.row - curr.row, col: nextPt.col - curr.col };
      if (d1.row === d2.row && d1.col === d2.col) continue;
      corners.push(curr);
    }
    return corners;
  });
}

function turnCross(prev: Point, curr: Point, nextPt: Point): number {
  const d1 = { x: curr.col - prev.col, y: curr.row - prev.row };
  const d2 = { x: nextPt.col - curr.col, y: nextPt.row - curr.row };
  return d1.x * d2.y - d1.y * d2.x;
}

// origin（px）：整份 path 的座標系統要跟呼叫端容器的 local box 對齊——容器
// 為了容納往外推出去的部分，通常會比地板本身往左/上多留 outsetPx，這裡的
// origin 就是那個位移量，加總進每個點的座標。
function buildLoopPathData(
  corners: Point[],
  cellPitchPx: number,
  cornerRadiusPx: number,
  outsetPx: number,
  origin: { x: number; y: number },
): string {
  const n = corners.length;
  if (n === 0) return "";
  const toPx = (p: Point) => ({ x: p.col * cellPitchPx + origin.x, y: p.row * cellPitchPx + origin.y });
  const segments: string[] = [];

  for (let i = 0; i < n; i++) {
    const prev = corners[(i - 1 + n) % n];
    const curr = corners[i];
    const nextPt = corners[(i + 1) % n];
    const pPrev = toPx(prev);
    const pOriginal = toPx(curr);
    const pNext = toPx(nextPt);

    const inDx = pOriginal.x - pPrev.x;
    const inDy = pOriginal.y - pPrev.y;
    const inLen = Math.hypot(inDx, inDy) || 1;
    const outDx = pNext.x - pOriginal.x;
    const outDy = pNext.y - pOriginal.y;
    const outLen = Math.hypot(outDx, outDy) || 1;
    const inUnit = { x: inDx / inLen, y: inDy / inLen };
    const outUnit = { x: outDx / outLen, y: outDy / outLen };

    const n1 = { x: inUnit.y, y: -inUnit.x };
    const n2 = { x: outUnit.y, y: -outUnit.x };
    const pCurr =
      outsetPx === 0
        ? pOriginal
        : { x: pOriginal.x + outsetPx * (n1.x + n2.x), y: pOriginal.y + outsetPx * (n1.y + n2.y) };

    const edgeInLenPx = Math.hypot(curr.row - prev.row, curr.col - prev.col) * cellPitchPx;
    const edgeOutLenPx = Math.hypot(nextPt.row - curr.row, nextPt.col - curr.col) * cellPitchPx;
    const isConvex = turnCross(prev, curr, nextPt) > 0;
    const signedRadius = isConvex ? cornerRadiusPx + outsetPx : cornerRadiusPx - outsetPx;
    const radius = Math.max(0, Math.min(signedRadius, edgeInLenPx / 2, edgeOutLenPx / 2));

    if (radius <= 0.5) {
      segments.push(`${i === 0 ? "M" : "L"} ${pCurr.x} ${pCurr.y}`);
      continue;
    }

    const p1 = { x: pCurr.x - inUnit.x * radius, y: pCurr.y - inUnit.y * radius };
    const p2 = { x: pCurr.x + outUnit.x * radius, y: pCurr.y + outUnit.y * radius };
    const sweepFlag = isConvex ? 1 : 0;
    segments.push(`${i === 0 ? "M" : "L"} ${p1.x} ${p1.y}`);
    segments.push(`A ${radius} ${radius} 0 0 ${sweepFlag} ${p2.x} ${p2.y}`);
  }
  segments.push("Z");

  return segments.join(" ");
}

// 供 Board.tsx 算出容器需要往外多留多少 px（= outsetPx），才能把 clip-path
// 需要的所有座標完整包住，不被容器自身的 box 裁掉。
export const WALL_BAND_ORIGIN_MARGIN_RATIO = 1;

export function buildWallBandClipPath(
  cells: CellCoord[],
  cellPitchPx: number,
  cornerRadiusPx: number,
  outsetPx: number,
): string {
  if (cellPitchPx <= 0) return "";
  const loops = traceAllOutlines(cells);
  if (loops.length === 0) return "";
  const origin = { x: outsetPx, y: outsetPx };
  const data = loops
    .map((corners) => buildLoopPathData(corners, cellPitchPx, cornerRadiusPx, outsetPx, origin))
    .filter(Boolean)
    .join(" ");
  return data ? `path("${data}")` : "";
}
