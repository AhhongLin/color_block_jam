// 把一個方塊的所有格子描成一整圈邊界（假設方塊本身單一連通、不帶洞——
// 現有關卡資料的方塊都符合這個假設），再轉成一份 clip-path 的 SVG path
// 字串，讓整個方塊只用一個 DOM 節點畫出來，凹角、凸角都套同一個半徑的
// 圓角——這樣同一個方塊的視覺呈現才會是一個整體、輪廓處處等寬圓潤，而不是
// 好幾個格子拼起來、L 形內凹角卻留著一個尖角的樣子。描邊／濾共線／圓角／
// 外推的核心算法在 outlineGeometry.ts，跟 wallBandShape.ts 共用。
//
// 座標系統：cells 一律用「相對這個方塊 bounding box 左上角」的局部座標
// （呼叫端自己減掉 anchorRow/anchorCol），輸出的 px 座標也是同一個原點
// （outlineGeometry 的 origin 固定傳 {x:0,y:0}），直接拿去當 wrapper 內部
// 子元素的 clip-path 用。

import type { CellCoord } from "../../types/level";
import { buildRoundedPolygonPath, traceOutlines } from "./outlineGeometry";

const ORIGIN = { x: 0, y: 0 };

// 一份多邊形路徑，直接包成 clip-path: path(...) 能吃的字串。
export function buildBlockClipPath(
  cells: CellCoord[],
  cellPitchPx: number,
  cornerRadiusPx: number,
  outsetPx = 0,
): string {
  // 方塊資料保證單一連通、不帶洞，天然只會描出一圈（見 outlineGeometry.ts
  // traceOutlines() 註解），只取第一圈。
  const loops = traceOutlines(cells);
  const primaryLoop = loops[0] ? [loops[0]] : [];
  const data = buildRoundedPolygonPath(primaryLoop, cellPitchPx, cornerRadiusPx, outsetPx, ORIGIN);
  return data ? `path("${data}")` : "";
}

export interface ShineAnchor {
  xPx: number;
  yPx: number;
  widthPx: number;
}

// .blockFill::before 的高光要釘在「形狀實際存在的那一格」上，不能只釘在
// bounding box 的左上角——凹形方塊（例如 L 形）bounding box 左上角那一格
// 可能根本不屬於這個形狀，硬釘在那裡的高光會被 clip-path 切掉一半。這裡從
// cells 裡挑「最上面那一列、同列中最左邊」的格子當錨點（一定是形狀真的存在
// 的格子），換算成像素位移。
//
// 高光只有在「頂端剛好一格寬」的形狀（直向長條）才需要縮成單格尺寸，避免
// 被拉成一整條假光斑；頂端本來就有好幾格寬的形狀（橫向方塊、T 形頂端一整
// 排）要讓高光跨滿整排寬度，不能誤縮成一格。這裡量出「跟錨點同一列」的
// 格子一路往右連續延伸幾格，決定高光要跨幾格寬。
//
// 跟 buildBlockClipPath 同一個慣例：吃 cellPitchPx，直接回傳算好的 px 值，
// 呼叫端不用自己再乘一次。
export function computeShineAnchor(cells: CellCoord[], cellPitchPx: number): ShineAnchor {
  const anchor = cells.reduce<CellCoord>((best, cell) => {
    const [r, c] = cell;
    const [br, bc] = best;
    if (r < br || (r === br && c < bc)) return cell;
    return best;
  }, cells[0] ?? [0, 0]);

  const occupied = new Set(cells.map(([r, c]) => `${r},${c}`));
  let span = 0;
  while (occupied.has(`${anchor[0]},${anchor[1] + span + 1}`)) span += 1;
  const topRowSpan = 1 + span;

  return {
    xPx: anchor[1] * cellPitchPx,
    yPx: anchor[0] * cellPitchPx,
    widthPx: topRowSpan * cellPitchPx,
  };
}
