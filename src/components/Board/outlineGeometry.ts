// 共用幾何引擎：把一組格子描成邊界多邊形，再套上圓角／往外推，輸出一段
// SVG path 資料。blockShape.ts（方塊外框）跟 wallBandShape.ts（牆／門色帶）
// 都是這份引擎的呼叫端——兩者的差異只在「輪廓可能有幾圈」（方塊固定一圈，
// 色帶還要處理坑洞）跟「座標系統的原點在哪」（方塊永遠是局部座標 0,0，
// 色帶要往外推出去的量位移),核心的描邊／濾共線／圓角／外推公式完全共用。
//
// 座標系統：cells 用呼叫端自己的局部座標（方塊用「相對 bounding box
// 左上角」，色帶用「相對 level 格線」)，這裡不假設任何特定原點，最終位移
// 交給 buildRoundedPolygonPath 的 origin 參數決定。
//
// 已知簡化：格距用「量出來的 cellPitch」，沒有另外扣掉格子間的 gap，形狀
// 會稍微蓋到原本兩格之間的縫隙——這正是「消除縫隙」這個題目要的效果，不是
// 副作用（方塊、色帶都吃這個簡化）。

import type { CellCoord } from "../../types/level";

export interface Point {
  row: number;
  col: number;
}

function pointKey(p: Point): string {
  return `${p.row},${p.col}`;
}

// 邊界邊一律用「順時針」方向表示（螢幕座標 row 往下、col 往右），這樣沿著
// 邊界走一圈，格子本體固定在行進方向的右手邊，才能把所有邊界邊串成一圈
// 有序的多邊形。
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

// 把邊界邊串成好幾圈有序頂點（外圍一圈＋每個坑洞各一圈——方塊資料本身
// 保證單一連通、不帶洞，天然只會描出一圈，呼叫端取 loops[0] 即可；即使這個
// 假設哪天被打破，多出來的圈也只是安靜地被忽略，不會出錯），再各自濾掉
// 共線（方向沒變）的中間點，只留下真正轉彎的角——後面套圓角時只需要處理
// 這些角。
export function traceOutlines(cells: CellCoord[]): Point[][] {
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
      if (d1.row === d2.row && d1.col === d2.col) continue; // 共線，不是角，丟掉
      corners.push(curr);
    }
    return corners;
  });
}

// 順時針多邊形裡，外凸角跟內凹角（兩者都套圓角，只是圓弧轉向相反，見
// buildRoundedPolygonPath）可以用叉積正負號分辨——跟 traceOutlines() 用
// 同一個順時針假設。
function turnCross(prev: Point, curr: Point, nextPt: Point): number {
  const d1 = { x: curr.col - prev.col, y: curr.row - prev.row };
  const d2 = { x: nextPt.col - curr.col, y: nextPt.row - curr.row };
  return d1.x * d2.y - d1.y * d2.x;
}

function buildLoopSegments(
  corners: Point[],
  cellPitchPx: number,
  cornerRadiusPx: number,
  outsetPx: number,
  toPx: (p: Point) => { x: number; y: number },
): string {
  const n = corners.length;
  if (n === 0) return "";
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
    // 凸角往外推 outsetPx 半徑要跟著變大（外推的平行曲線半徑=原半徑+推移
    // 量），凹角則相反——往外推等於把洞的兩側牆往內夾，半徑要跟著縮小，
    // 縮到 0 以下就不再套圓角（夾到底了）。
    const isConvex = turnCross(prev, curr, nextPt) > 0;
    const signedRadius = isConvex ? cornerRadiusPx + outsetPx : cornerRadiusPx - outsetPx;
    const radius = Math.max(0, Math.min(signedRadius, edgeInLenPx / 2, edgeOutLenPx / 2));

    if (radius <= 0.5) {
      segments.push(`${i === 0 ? "M" : "L"} ${pCurr.x} ${pCurr.y}`);
      continue;
    }

    const p1 = { x: pCurr.x - inUnit.x * radius, y: pCurr.y - inUnit.y * radius };
    const p2 = { x: pCurr.x + outUnit.x * radius, y: pCurr.y + outUnit.y * radius };

    // 圓弧的轉向要跟這個角本身的轉向一致——凸角在順時針描邊時是往右轉
    // （順時針轉弧，sweep-flag=1），凹角是往左轉（逆時針轉弧，
    // sweep-flag=0）。用相反方向的話，弧線會鼓向錯的一側，穿出輪廓原本的
    // 直邊。
    const sweepFlag = isConvex ? 1 : 0;
    segments.push(`${i === 0 ? "M" : "L"} ${p1.x} ${p1.y}`);
    segments.push(`A ${radius} ${radius} 0 0 ${sweepFlag} ${p2.x} ${p2.y}`);
  }
  segments.push("Z");

  return segments.join(" ");
}

// 把 traceOutlines() 描出的一或多圈輪廓，轉成一段完整的 SVG path 資料
// （"M ... Z M ... Z"，不含 clip-path: path(...) 那層包裝，包裝交給呼叫端）。
// 半徑會依相鄰兩段邊的長度夾住，避免缺口很窄的短手臂（notch 形狀）算出
// 自我交疊的圓角。
//
// outsetPx（預設可傳 0）：把每一圈輪廓「往外推」固定距離再描邊——原本想用
// filter: drop-shadow() 疊很多份位移色塊做底座，實測發現 Chrome 會把
// clip-path 套在 filter 算完的結果上，超出原本輪廓的部分直接被裁掉（看不到
// 任何效果，不是變淡，是完全消失），所以只能老實地算出一份「真的比較大」的
// 多邊形。矩形邊多邊形往外推的算法：每個角同時是一段「進來的邊」跟一段
// 「出去的邊」的交會點，這兩段邊都往外（垂直於邊本身）推 outsetPx，推完的
// 兩條線交點 = 原角落 + outsetPx * (進邊的外法向量 + 出邊的外法向量)——兩段
// 邊互相垂直，兩個外法向量各自只在一個軸有分量，相加後正好是原角落沿兩軸
// 各推 outsetPx 的對角位移，不管這個角是凸角還是凹角（凹角的洞會對應地縮小
// outsetPx），算法一樣。
//
// origin（px）：整份 path 的座標系統要跟呼叫端容器的 local box 對齊——方塊
// 永遠用局部座標，origin 固定 {x:0,y:0}；色帶的容器為了容納往外推出去的
// 部分，通常會比地板本身往左/上多留 outsetPx，origin 就是那個位移量，加總
// 進每個點的座標。
export function buildRoundedPolygonPath(
  loops: Point[][],
  cellPitchPx: number,
  cornerRadiusPx: number,
  outsetPx: number,
  origin: { x: number; y: number },
): string {
  if (cellPitchPx <= 0) return "";
  const toPx = (p: Point) => ({ x: p.col * cellPitchPx + origin.x, y: p.row * cellPitchPx + origin.y });

  const data = loops
    .map((corners) => buildLoopSegments(corners, cellPitchPx, cornerRadiusPx, outsetPx, toPx))
    .filter(Boolean)
    .join(" ");
  return data;
}
