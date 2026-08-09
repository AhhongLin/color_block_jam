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
// 有一格沒對齊（門顏色不符、方向不符、或該格根本不是門/還沒到邊界），整個
// 方塊視同撞牆，不會部分離場。
//
// 「前緣格」是形狀本身的概念（往 direction 方向看，該方塊自己再沒有其他格
// 子擋在前面），跟方塊目前實際有沒有被擋住無關：如果前緣格往前一步仍落在
// 盤面內（不管是空地還是被別的方塊佔用），代表它根本還沒到邊界，自然不算
// 對齊門。
export function canExit(floorCells: CellCoord[], doors: Door[], block: ExitableBlock, direction: Direction): boolean {
  const [dr, dc] = DIRECTION_DELTA[direction];
  const side = DIRECTION_TO_SIDE[direction];
  const floor = new Set(floorCells.map(([r, c]) => cellKey(r, c)));
  const ownCells = new Set(block.cells.map(([r, c]) => cellKey(r, c)));

  const leadingCells = block.cells.filter(([r, c]) => !ownCells.has(cellKey(r + dr, c + dc)));
  if (leadingCells.length === 0) return false;

  return leadingCells.every(([r, c]) => {
    if (floor.has(cellKey(r + dr, c + dc))) return false; // 前面還是地板，還沒到邊界
    const door = doors.find((d) => d.row === r && d.col === c && d.side === side);
    return door !== undefined && door.color === block.color;
  });
}

// spec.md 2.5：盤面上所有方塊都離場即過關。
export function isLevelComplete(blocks: readonly unknown[]): boolean {
  return blocks.length === 0;
}
