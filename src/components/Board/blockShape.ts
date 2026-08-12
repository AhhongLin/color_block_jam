// 把一個方塊的所有格子描成一整圈邊界（假設方塊本身單一連通、不帶洞——
// 現有關卡資料的方塊都符合這個假設），再轉成一份 clip-path 的 SVG path
// 字串，讓整個方塊只用一個 DOM 節點畫出來，凹角維持直角、凸角套圓角——
// 這樣同一個方塊的視覺呈現才會是一個整體，而不是好幾個格子拼起來的。
//
// 座標系統：cells 一律用「相對這個方塊 bounding box 左上角」的局部座標
// （呼叫端自己減掉 anchorRow/anchorCol），輸出的 px 座標也是同一個原點，
// 直接拿去當 wrapper 內部子元素的 clip-path 用。
//
// 已知簡化：格距用「量出來的 cellPitch」（約等於 --cell-size + --cell-gap，
// 量測方式跟 Board.tsx 既有的 measureCellPitch() 同一套），沒有另外扣掉
// 方塊內部的 gap，所以形狀會稍微蓋到原本兩格之間的縫隙——這正是「消除
// 縫隙」這個題目要的效果，不是副作用。

import type { CellCoord } from "../../types/level";

interface Point {
  row: number;
  col: number;
}

function pointKey(p: Point): string {
  return `${p.row},${p.col}`;
}

// 邊界邊一律用「順時針」方向表示（螢幕座標 row 往下、col 往右），這樣沿著
// 邊界走一圈，方塊內部固定在行進方向的右手邊，才能把所有邊界邊串成一圈
// 有序的多邊形，邏輯跟 Board.tsx 的 boundaryWalls() 是同一個念頭，只是那邊
// 找的是「地板外圍要補牆的邊」，這邊找的是「方塊自己的外圍」。
function collectBoundaryEdges(cells: CellCoord[]): [Point, Point][] {
  const occupied = new Set(cells.map(([r, c]) => `${r},${c}`));
  const has = (r: number, c: number) => occupied.has(`${r},${c}`);
  const edges: [Point, Point][] = [];
  for (const [r, c] of cells) {
    if (!has(r - 1, c)) edges.push([{ row: r, col: c }, { row: r, col: c + 1 }]); // 上緣
    if (!has(r, c + 1)) edges.push([{ row: r, col: c + 1 }, { row: r + 1, col: c + 1 }]); // 右緣
    if (!has(r + 1, c)) edges.push([{ row: r + 1, col: c + 1 }, { row: r + 1, col: c }]); // 下緣
    if (!has(r, c - 1)) edges.push([{ row: r + 1, col: c }, { row: r, col: c }]); // 左緣
  }
  return edges;
}

// 把邊界邊串成一圈有序頂點，再濾掉共線（方向沒變）的中間點，只留下真正
// 轉彎的角——後面套圓角時只需要處理這些角。
function traceBlockOutline(cells: CellCoord[]): Point[] {
  const edges = collectBoundaryEdges(cells);
  if (edges.length === 0) return [];

  const next = new Map<string, Point>();
  for (const [from, to] of edges) next.set(pointKey(from), to);

  const start = edges[0][0];
  const loop: Point[] = [start];
  let current = start;
  for (let i = 0; i < edges.length; i++) {
    const to = next.get(pointKey(current));
    if (!to || pointKey(to) === pointKey(start)) break;
    loop.push(to);
    current = to;
  }

  const corners: Point[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n];
    const curr = loop[i];
    const nextPt = loop[(i + 1) % n];
    const d1 = { row: curr.row - prev.row, col: curr.col - prev.col };
    const d2 = { row: nextPt.row - curr.row, col: nextPt.col - curr.col };
    if (d1.row === d2.row && d1.col === d2.col) continue; // 共線，不是角，丟掉
    corners.push(curr);
  }
  return corners;
}

// 順時針多邊形裡，外凸角（該套圓角的那種）跟內凹角（維持直角）可以用叉積
// 正負號分辨——跟 traceBlockOutline() 用同一個順時針假設。
function turnCross(prev: Point, curr: Point, nextPt: Point): number {
  const d1 = { x: curr.col - prev.col, y: curr.row - prev.row };
  const d2 = { x: nextPt.col - curr.col, y: nextPt.row - curr.row };
  return d1.x * d2.y - d1.y * d2.x;
}

// 把描好的邊界轉成一段 SVG path 資料（"M ... Z"，不含 clip-path: path(...)
// 那層包裝，包裝交給 buildBlockClipPath()）。半徑會依相鄰兩段邊的長度夾住，
// 避免缺口很窄的短手臂（notch 方塊）算出自我交疊的圓角。
//
// outsetPx（預設 0）：把整圈輪廓「往外推」固定距離再描邊，拿來畫底座層用
// ——原本想用 filter: drop-shadow() 疊很多份位移色塊做底座，實測發現
// Chrome 會把 clip-path 套在 filter 算完的結果上，超出原本輪廓的部分直接
// 被裁掉（看不到任何效果，不是變淡，是完全消失），所以底座只能老實地算出
// 一份「真的比較大」的多邊形，蓋在填色層底下。矩形邊多邊形往外推的算法：
// 每個角同時是一段「進來的邊」跟一段「出去的邊」的交會點，這兩段邊都往外
// （垂直於邊本身）推 outsetPx，推完的兩條線交點 = 原角落 + outsetPx *
// (進邊的外法向量 + 出邊的外法向量)——兩段邊互相垂直，兩個外法向量各自
// 只在一個軸有分量，相加後正好是原角落沿兩軸各推 outsetPx 的對角位移，
// 不管這個角是凸角還是凹角（凹角的洞會對應地縮小 outsetPx），算法一樣。
function buildPolygonPathData(cells: CellCoord[], cellPitchPx: number, cornerRadiusPx: number, outsetPx = 0): string {
  const corners = traceBlockOutline(cells);
  if (corners.length === 0 || cellPitchPx <= 0) return "";

  const toPx = (p: Point) => ({ x: p.col * cellPitchPx, y: p.row * cellPitchPx });
  const n = corners.length;
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

    // 順時針（螢幕座標 y 往下）多邊形裡，一段邊的外法向量 = 邊方向向量
    // 順時針轉 90 度：(dx,dy) -> (dy,-dx)。
    const n1 = { x: inUnit.y, y: -inUnit.x };
    const n2 = { x: outUnit.y, y: -outUnit.x };
    const pCurr =
      outsetPx === 0
        ? pOriginal
        : { x: pOriginal.x + outsetPx * (n1.x + n2.x), y: pOriginal.y + outsetPx * (n1.y + n2.y) };

    const edgeInLenPx = Math.hypot(curr.row - prev.row, curr.col - prev.col) * cellPitchPx;
    const edgeOutLenPx = Math.hypot(nextPt.row - curr.row, nextPt.col - curr.col) * cellPitchPx;
    const isConvex = turnCross(prev, curr, nextPt) > 0;
    const radius = isConvex ? Math.min(cornerRadiusPx + outsetPx, edgeInLenPx / 2, edgeOutLenPx / 2) : 0;

    if (radius <= 0.5) {
      segments.push(`${i === 0 ? "M" : "L"} ${pCurr.x} ${pCurr.y}`);
      continue;
    }

    const p1 = { x: pCurr.x - inUnit.x * radius, y: pCurr.y - inUnit.y * radius };
    const p2 = { x: pCurr.x + outUnit.x * radius, y: pCurr.y + outUnit.y * radius };

    segments.push(`${i === 0 ? "M" : "L"} ${p1.x} ${p1.y}`);
    segments.push(`A ${radius} ${radius} 0 0 1 ${p2.x} ${p2.y}`);
  }
  segments.push("Z");

  return segments.join(" ");
}

// 一份多邊形路徑，直接包成 clip-path: path(...) 能吃的字串。
export function buildBlockClipPath(
  cells: CellCoord[],
  cellPitchPx: number,
  cornerRadiusPx: number,
  outsetPx = 0,
): string {
  const data = buildPolygonPathData(cells, cellPitchPx, cornerRadiusPx, outsetPx);
  return data ? `path("${data}")` : "";
}
