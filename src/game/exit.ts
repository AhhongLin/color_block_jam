import type { CellCoord, Color, Door, Side } from "../types/level";
import { DIRECTION_DELTA, type Direction } from "./slide";

// 門的 side（朝外方向）跟玩家拖曳方向是同一件事：往右滑出去，就是從右側的門
// 出場。
const DIRECTION_TO_SIDE: Record<Direction, Side> = {
  up: "top",
  down: "bottom",
  left: "left",
  right: "right",
};

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

interface ExitableBlock {
  color: Color;
  cells: CellCoord[];
}

// spec.md 2.4：方塊前緣的所有格子都對齊同色門，才會整個滑出盤面消失；只要
// 有一格沒對齊（門顏色不符、方向不符、或被其他方塊擋住），整個方塊視同撞
// 牆，不會部分離場。
//
// 「前緣格」是形狀本身的概念（往 direction 方向看，該方塊自己再沒有其他格
// 子擋在前面），跟方塊目前實際有沒有被擋住無關。凹形方塊（例如 L 形）的前緣
// 格，並非每一格都會真正頂到盤面邊界——形狀較「短」的那一格，前面永遠會留
// 著地板，這是形狀本身決定的，不代表方塊還沒滑到底。所以前緣格分兩種看待：
// 頂到邊界的（前面不是地板）才需要比對同色門；前面還是地板的，只要沒被
// 「其他方塊」佔住就放行——但整個方塊至少要有一格真的頂到邊界並對上同色
// 門，否則就只是還停在盤面中間，不算離場。
export function canExit(
  floorCells: CellCoord[],
  doors: Door[],
  block: ExitableBlock,
  direction: Direction,
  otherBlocksCells: CellCoord[] = [],
): boolean {
  const [dr, dc] = DIRECTION_DELTA[direction];
  const side = DIRECTION_TO_SIDE[direction];
  const floor = new Set(floorCells.map(([r, c]) => cellKey(r, c)));
  const ownCells = new Set(block.cells.map(([r, c]) => cellKey(r, c)));
  const occupiedByOthers = new Set(otherBlocksCells.map(([r, c]) => cellKey(r, c)));

  const leadingCells = block.cells.filter(([r, c]) => !ownCells.has(cellKey(r + dr, c + dc)));
  if (leadingCells.length === 0) return false;

  let reachedBoundary = false;
  for (const [r, c] of leadingCells) {
    const nextKey = cellKey(r + dr, c + dc);
    if (!floor.has(nextKey)) {
      // 前面不是地板，真的頂到邊界——要有同色門才能離場。
      const door = doors.find((d) => d.row === r && d.col === c && d.side === side);
      if (!door || door.color !== block.color) return false;
      reachedBoundary = true;
    } else if (occupiedByOthers.has(nextKey)) {
      // 前面還是地板，但被別的方塊佔住，是真的撞到東西擋住去路。
      return false;
    }
    // 前面是地板且沒被佔住：形狀凹進去的那一格，放行但不強求有門。
  }
  return reachedBoundary;
}

const ALL_DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

// 離場只看方塊目前的位置有沒有貼齊同色門，跟「剛剛往哪個方向滑」無關：
// 一次移動可能同時讓某一側貼齊邊界，即使那一側不是這次滑動的方向，也該
// 離場（例如先往右滑一格對齊右側門柱，下一步往下滑到底時，只要下側也貼齊
// 同色門就該離場，不需要玩家再多滑一步）。依序試 4 個方向，回傳第一個判定
// 可以離場的方向（離場動畫要往哪個方向滑出用得到），都不行就回傳 null。
export function findExitDirection(
  floorCells: CellCoord[],
  doors: Door[],
  block: ExitableBlock,
  otherBlocksCells: CellCoord[] = [],
): Direction | null {
  return ALL_DIRECTIONS.find((direction) => canExit(floorCells, doors, block, direction, otherBlocksCells)) ?? null;
}

// spec.md 2.5：盤面上所有方塊都離場即過關。
export function isLevelComplete(blocks: readonly unknown[]): boolean {
  return blocks.length === 0;
}
