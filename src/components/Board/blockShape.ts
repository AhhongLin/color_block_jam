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
