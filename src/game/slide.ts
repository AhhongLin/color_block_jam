import type { CellCoord } from "../types/level";

export type Direction = "up" | "down" | "left" | "right";

const DIRECTION_DELTA: Record<Direction, CellCoord> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

interface SlideableBlock {
  id: string;
  cells: CellCoord[];
}

// 逐格模擬（spec.md 第 2.2、8 節）：整個方塊形狀每次往指定方向整體移動一格，
// 檢查移動後的所有新格子是否都在盤面內且未被其他方塊佔用；可行就繼續下一步，
// 不可行就停在上一步的位置。只停不推——不會移動其他方塊。
// 門/離場判定不在此函式範圍內（見 09），盤面邊界一律視同牆壁。
export function maxSlideSteps(
  floorCells: CellCoord[],
  blocks: SlideableBlock[],
  blockId: string,
  direction: Direction,
): number {
  const movingBlock = blocks.find((block) => block.id === blockId);
  if (!movingBlock) {
    throw new Error(`maxSlideSteps: unknown block id "${blockId}"`);
  }

  const floor = new Set(floorCells.map(([r, c]) => cellKey(r, c)));
  const occupied = new Set<string>();
  for (const block of blocks) {
    if (block.id === blockId) continue;
    for (const [r, c] of block.cells) occupied.add(cellKey(r, c));
  }

  const [dr, dc] = DIRECTION_DELTA[direction];
  let current = movingBlock.cells;
  let steps = 0;
  for (;;) {
    const next: CellCoord[] = current.map(([r, c]) => [r + dr, c + dc]);
    const canAdvance = next.every(([r, c]) => floor.has(cellKey(r, c)) && !occupied.has(cellKey(r, c)));
    if (!canAdvance) return steps;
    current = next;
    steps += 1;
  }
}

// 把一組格子座標依方向整體平移固定的步數，不做任何碰撞檢查——呼叫端需自行
// 保證 `steps` 沒有超過 maxSlideSteps() 算出的可行範圍。
export function translateCells(cells: CellCoord[], direction: Direction, steps: number): CellCoord[] {
  const [dr, dc] = DIRECTION_DELTA[direction];
  return cells.map(([r, c]) => [r + dr * steps, c + dc * steps]);
}

// 方塊往指定方向一路滑到最遠可行位置（等同 maxSlideSteps 步之後的座標）。
export function slideBlock(
  floorCells: CellCoord[],
  blocks: SlideableBlock[],
  blockId: string,
  direction: Direction,
): CellCoord[] {
  const movingBlock = blocks.find((block) => block.id === blockId);
  if (!movingBlock) {
    throw new Error(`slideBlock: unknown block id "${blockId}"`);
  }
  const steps = maxSlideSteps(floorCells, blocks, blockId, direction);
  return translateCells(movingBlock.cells, direction, steps);
}
