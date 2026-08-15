// 決定重疊方塊誰蓋住誰（用 z-index 表達，不重排 DOM 順序——見
// computeStackRanks() 底下的說明）。純視覺呈現問題，不影響任何遊戲規則。

import type { LevelBlock } from "../../types/level";

// 方塊填色層會往上位移做出立體厚度感（見 Board.module.css 的 .blockFill
// translate(0, -7px)），上下相鄰的兩個方塊因此可能在視覺上互相咬到一點
// 邊緣——這時畫面上位置較下面（row 較大）的方塊應該蓋住位置較上面（row
// 較小）的方塊，才符合「越靠近鏡頭前緣的東西擋住後面東西」的直覺。
function blockFrontRow(block: LevelBlock): number {
  return Math.max(...block.cells.map(([row]) => row));
}

// 只看整塊方塊的最下緣 row 還不夠：兩個互相咬合的 L/S 形方塊，各自的
// 最下緣可能剛好落在同一個 row（例如一個是「左欄下探一格」、另一個是
// 「右欄下探一格」，整體最下緣一樣深），但兩者實際互相貼齊、視覺上會咬
// 到彼此的，是它們共用的那一欄——這一欄裡誰的格子比較下面，那一欄的
// 交界處就該由誰蓋住對方（使用者回報：兩塊方塊整體最下緣同高，但細看
// 各自方塊在交界那一欄有一格比較低，理應由那一塊蓋住另一塊）。這裡逐欄
// 算出每個方塊在該欄「最下面那一格」的 row，兩塊方塊共用的欄位中誰的
// row 比較大，那一塊就該排在後面（畫面上蓋住對方）；多欄意見不一致時
// 加總取多數決；完全沒有共用欄位（兩塊方塊左右不相鄰）就沒有這種局部
// 咬合問題，退回用整塊最下緣比較即可。
function bottomRowByColumn(block: LevelBlock): Map<number, number> {
  const map = new Map<number, number>();
  for (const [row, col] of block.cells) {
    const existing = map.get(col);
    if (existing === undefined || row > existing) map.set(col, row);
  }
  return map;
}

function compareBlockStackOrder(a: LevelBlock, b: LevelBlock): number {
  const aBottom = bottomRowByColumn(a);
  const bBottom = bottomRowByColumn(b);
  let sharedColumnDiff = 0;
  for (const [col, aRow] of aBottom) {
    const bRow = bBottom.get(col);
    if (bRow !== undefined) sharedColumnDiff += aRow - bRow;
  }
  if (sharedColumnDiff !== 0) return sharedColumnDiff;
  return blockFrontRow(a) - blockFrontRow(b);
}

// 疊放順序改用 z-index 表達，不能直接把 blocks 陣列依 compareBlockStackOrder
// 排序後再決定 JSX/DOM 順序——DOM 順序一旦在方塊移動時跟著重新排列，
// React 會用 insertBefore 把既有節點搬到新的手足順序位置，這個搬動在瀏覽器
// 裡等同「先從文件移除、再插回」，會把 .blockFill 的 blockPopIn 這種
// animation-fill-mode: backwards 的進場動畫重新觸發一次，讓旁邊沒被拖曳的
// 方塊也跟著閃一下（先看到沒被蓋住的深色底座層，動畫播完才變回正常顏色
// ——使用者反饋：拖曳方塊落定的瞬間，左右相鄰的方塊會閃一下深色）。改成
// 保持 JSX/DOM 順序穩定（永遠照 blocks 陣列原始順序），疊放順序完全交給
// 呼叫端的 inline z-index 表達，就不會有節點被搬動、動畫也就不會被重新
// 觸發。
export function computeStackRanks(blocks: LevelBlock[]): Map<string, number> {
  const ranked = [...blocks].sort(compareBlockStackOrder);
  const ranks = new Map<string, number>();
  ranked.forEach((block, rank) => ranks.set(block.id, rank));
  return ranks;
}
