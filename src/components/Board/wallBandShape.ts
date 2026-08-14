// 把整個地板區塊的外圍（可能含內部坑洞，例如 level 8 的單格坑洞）描成一份
// clip-path 多邊形，往外推 BOUNDARY_THICKNESS，畫出「一整條圍住地板的色帶」
// ——所有牆、所有門都是這同一塊形狀的一部分，門只是疊在上面換色的區塊，
// 色帶本身不會在門/牆交界處露出縫隙。描邊／濾共線／圓角／外推的核心算法在
// outlineGeometry.ts，跟 blockShape.ts 共用；這裡只負責「地板可能有好幾圈
// 邊界（外圍一圈 + 每個坑洞各一圈）」跟「輸出座標要位移到呼叫端容器的
// local box」這兩件跟色帶場景綁定的事。

import type { CellCoord } from "../../types/level";
import { buildRoundedPolygonPath, traceOutlines } from "./outlineGeometry";

// 供 Board.tsx 算出容器需要往外多留多少 px（= outsetPx），才能把 clip-path
// 需要的所有座標完整包住，不被容器自身的 box 裁掉。
export const WALL_BAND_ORIGIN_MARGIN_RATIO = 1;

export function buildWallBandClipPath(
  cells: CellCoord[],
  cellPitchPx: number,
  cornerRadiusPx: number,
  outsetPx: number,
): string {
  const loops = traceOutlines(cells);
  // origin：容器為了容納往外推出去的部分，通常會比地板本身往左/上多留
  // outsetPx（見 WALL_BAND_ORIGIN_MARGIN_RATIO），這裡把同樣的位移量加總
  // 進每個點的座標，讓輸出座標跟容器的 local box 對齊。
  const origin = { x: outsetPx, y: outsetPx };
  const data = buildRoundedPolygonPath(loops, cellPitchPx, cornerRadiusPx, outsetPx, origin);
  return data ? `path("${data}")` : "";
}
