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
// 著地板，這是形狀本身決定的，不代表方塊還沒滑到底。但這不代表這一格可以
// 免門：把它沿著移動方向繼續投影下去，直到它自己也真正碰到邊界為止，門仍
// 要開在「它自己這條線」對齊的位置——方塊從水平或垂直哪個角度看是幾格寬，
// 那個方向的門就要有幾格寬，只是不強求每一格都實際貼到牆而已。投影路徑上
// 若被其他方塊佔住，視同撞到東西，不可離場。整個方塊至少要有一格「這一步」
// 就真的頂到邊界，否則只是還停在盤面中間，不算離場。
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

  const reachedBoundary = leadingCells.some(([r, c]) => !floor.has(cellKey(r + dr, c + dc)));
  if (!reachedBoundary) return false;

  for (const [r, c] of leadingCells) {
    let targetRow = r;
    let targetCol = c;
    for (;;) {
      const nextRow = targetRow + dr;
      const nextCol = targetCol + dc;
      const nextKey = cellKey(nextRow, nextCol);
      if (!floor.has(nextKey)) break; // 這一格自己也真正碰到邊界了
      if (occupiedByOthers.has(nextKey)) return false; // 投影路徑上被其他方塊擋住
      targetRow = nextRow;
      targetCol = nextCol;
    }
    const door = doors.find((d) => d.row === targetRow && d.col === targetCol && d.side === side);
    if (!door || door.color !== block.color) return false;
  }
  return true;
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
