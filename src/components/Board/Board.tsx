import { Fragment, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { CellCoord, Color, Door, Level, LevelBlock, Side } from "../../types/level";
import { maxSlideSteps, translateCells, type Direction } from "../../game/slide";
import { clampedStepsFromDistance, updateAxisTracker, type Axis, type AxisTracker } from "../../game/dragDirection";
import { findExitDirection, isLevelComplete } from "../../game/exit";
import { playSound } from "../../audio/sound";
import styles from "./Board.module.css";

interface BoardProps {
  level: Level;
  onComplete?: () => void;
  // 「回選單」連結由呼叫端（LevelPage）決定內容——Board 本身是純遊戲盤面
  // 元件，不該直接依賴 react-router 的 Link，改成插槽讓呼叫端自己塞。
  backLink?: ReactNode;
}

// 位移量小於此門檻視為未拖曳（避免手指/滑鼠微小晃動被誤判成滑動）。
const DRAG_THRESHOLD_PX = 12;

// 方塊離場時，讓它視覺上再往外滑一步、同時炸開成粉粒消失的動畫時長。
// EXIT_ANIMATION_MS 要跟 Board.module.css 的 `.blockWrapper` transition
// 時長、`.blockWrapper.exiting .block` 的 blockPopOut 動畫時長一致；
// BURST_ANIMATION_MS 要跟 `.crumb` 的 crumbFly 動畫時長一致——粉粒要比
// 方塊本體晚一點消失，才有「爆開的粉塵還飄在空中」的尾韻，不是兩者同時
// 瞬間消失。
const EXIT_ANIMATION_MS = 460;
const BURST_ANIMATION_MS = 1050;

// 跟 Board.module.css 的 .block.red/.blue/.green/.yellow 的 --block-color
// 同一套色票——離場粉粒是獨立於方塊本體的元素（方塊消失動畫播完就從 DOM
// 移除），沒辦法用 CSS class 繼承顏色，只能在 JS 這邊也留一份對照表，內聯
// 成 --dot-color 傳給每一顆粒子。
const COLOR_HEX: Record<Color, string> = {
  red: "#e6453f",
  blue: "#3b6fe0",
  green: "#2fae66",
  yellow: "#e6b800",
  pink: "#d94fc0",
  orange: "#e8842b",
  darkgreen: "#1f7a3a",
  purple: "#7c58df",
};

const BURST_DOTS_PER_CELL = 9;

interface CrumbDot {
  dx: string;
  dy: string;
  rot: string;
  size: string;
}

interface CrumbCellBurst {
  row: number;
  col: number;
  dots: CrumbDot[];
}

interface CrumbBurst {
  id: string;
  color: string;
  // 整個方塊（可能多格）的幾何中心，拿來放「炸開的閃光/衝擊波」——跟下面
  // 逐格噴發的粉粒是不同層次的效果，中心用平均值即可，不需要對齊到整數格。
  center: { row: number; col: number };
  cells: CrumbCellBurst[];
}

// 一格炸開的粉粒角度沿一整圈平均分佈、再加隨機抖動，距離/大小也各自帶一點
// 隨機——避免看起來像複製貼上的規律圖案，而是碎屑四散的手感。距離/尺寸都
// 刻意誇張一點（超出格子本身範圍不少），效果才會夠明顯，不會一閃即逝看不清楚。
function createCrumbCellDots(): CrumbDot[] {
  return Array.from({ length: BURST_DOTS_PER_CELL }, (_, i) => {
    const angle = (Math.PI * 2 * i) / BURST_DOTS_PER_CELL + (Math.random() - 0.5) * 0.6;
    const distance = 26 + Math.random() * 32;
    return {
      dx: `${(Math.cos(angle) * distance).toFixed(1)}px`,
      dy: `${(Math.sin(angle) * distance).toFixed(1)}px`,
      rot: `${Math.floor(Math.random() * 360) - 180}deg`,
      size: `${(5 + Math.random() * 5).toFixed(1)}px`,
    };
  });
}

// 每個離場方塊自己的格子都各自炸開一圈粉粒（不是整個方塊共用一個爆點），
// 多格方塊看起來才會像「整塊碎開」而不是從單一個點噴出來。
function createCrumbBurst(block: LevelBlock): CrumbBurst {
  const rows = block.cells.map(([row]) => row);
  const cols = block.cells.map(([, col]) => col);
  return {
    id: block.id,
    color: COLOR_HEX[block.color],
    center: {
      row: rows.reduce((sum, row) => sum + row, 0) / rows.length,
      col: cols.reduce((sum, col) => sum + col, 0) / cols.length,
    },
    cells: block.cells.map(([row, col]) => ({ row, col, dots: createCrumbCellDots() })),
  };
}

// 粉粒的爆點是格子正中央，跟 edgeStyle() 共用同一套座標系統（相對於
// .board 左上角），只是多加了半格去對齊中心而不是格子邊緣。
function cellCenterStyle(row: number, col: number): CSSProperties {
  return {
    left: `calc(${col} * (var(--cell-size) + var(--cell-gap)) + var(--cell-size) / 2)`,
    top: `calc(${row} * (var(--cell-size) + var(--cell-gap)) + var(--cell-size) / 2)`,
  };
}

function cellKey(row: number, col: number) {
  return `${row},${col}`;
}

function minMax(values: number[]): [min: number, max: number] {
  return [Math.min(...values), Math.max(...values)];
}

function boundingBox(cells: CellCoord[]) {
  const [anchorRow, maxRow] = minMax(cells.map(([r]) => r));
  const [anchorCol, maxCol] = minMax(cells.map(([, c]) => c));
  return {
    anchorRow,
    anchorCol,
    shapeRows: maxRow - anchorRow + 1,
    shapeCols: maxCol - anchorCol + 1,
  };
}

// Pointer capture 讓拖曳中途離開方塊範圍時仍收得到後續的 move/up 事件。
// 部分測試環境（jsdom）未實作這組 API，忽略失敗即可，不影響實際瀏覽器行為。
function safelyCapturePointer(target: HTMLElement, pointerId: number, capture: boolean) {
  try {
    if (capture) target.setPointerCapture(pointerId);
    else target.releasePointerCapture(pointerId);
  } catch {
    // 忽略未實作 pointer capture 的環境。
  }
}

// 量測盤面一格的實際像素間距（含 gap）。用整個盤面容器的 rect 除以格數，而不
// 是量測單一格子，這樣不管 CSS 用 vw/px 哪種單位都能量出目前實際渲染的大小。
function measureCellPitch(boardEl: HTMLElement, cols: number, rows: number): { colPitch: number; rowPitch: number } {
  const rect = boardEl.getBoundingClientRect();
  return {
    colPitch: cols > 0 ? rect.width / cols : 0,
    rowPitch: rows > 0 ? rect.height / rows : 0,
  };
}

// 盤面的每一格都要被「牆」或「門」包住：格子邊界（鄰格不是地板）沒有門的
// 那一側補一段牆，讓不規則盤面的外圍描出一圈完整輪廓，門則是輪廓上開的口。
// 座標系統跟 blockWrapper 共用（相對於 .board 左上角，單位是「幾個格子」
// 乘上 --cell-size + --cell-gap）。
const SIDES: Side[] = ["top", "right", "bottom", "left"];
const SIDE_DELTA: Record<Side, CellCoord> = {
  top: [-1, 0],
  right: [0, 1],
  bottom: [1, 0],
  left: [0, -1],
};

function doorKey(row: number, col: number, side: Side): string {
  return `${row},${col},${side}`;
}

interface WallSegment {
  row: number;
  col: number;
  side: Side;
}

// 找出所有「地板邊界、但沒有門」的邊——這些邊要補一段牆。
function boundaryWalls(cells: CellCoord[], floorSet: Set<string>, doors: Door[]): WallSegment[] {
  const doorSides = new Set(doors.map((d) => doorKey(d.row, d.col, d.side)));
  const walls: WallSegment[] = [];
  for (const [r, c] of cells) {
    for (const side of SIDES) {
      const [dr, dc] = SIDE_DELTA[side];
      if (floorSet.has(cellKey(r + dr, c + dc))) continue; // 內部邊，不是外圍
      if (doorSides.has(doorKey(r, c, side))) continue; // 這裡是門，不補牆
      walls.push({ row: r, col: c, side });
    }
  }
  return walls;
}

// 門跟牆是同一圈輪廓上的兩種段落（一種是實牆、一種是開口），幾何算法完全
// 一樣：緊貼格子邊界、跟所在格子等寬、往外凸出同樣的厚度，只有顏色/樣式
// class 不同，所以共用同一個定位函式。
const BOUNDARY_THICKNESS = "calc(var(--cell-size) * 0.22)";

// 牆一律連成一體；門則是同色才連成一體——兩者的圓角都只留在「這一串真正
// 的頭尾」，串中間彼此相鄰的兩端接成直角，長度也順勢補上 --cell-gap 蓋住
// 縫隙，讀起來才會像一整段牆/一整個門，不是一格格獨立的膠囊貼在一起。
const WALL_RADIUS = "4px";
const DOOR_RADIUS = "6px";

// 牆/門的「相鄰段」定義：top/bottom 沿著同一 row 往左右找（col-1/col+1），
// left/right 沿著同一 col 往上下找（row-1/row+1）——跟格子本身怎麼排列
// 無關，只看沿著這個邊所在的方向。
function edgeNeighborKey(row: number, col: number, side: Side, direction: "prev" | "next"): string {
  const step = direction === "prev" ? -1 : 1;
  return side === "top" || side === "bottom" ? doorKey(row, col + step, side) : doorKey(row + step, col, side);
}

// 依連接狀態算出四角圓角：橫向段（top/bottom）用左右兩側判斷，縱向段
// （left/right）用頭尾兩側判斷；接到同類段落的那一側收成直角（0），沒接到
// 的維持原本圓角，做出「一串只有頭尾是圓的」效果。
function edgeRadius(side: Side, radius: string, connectedPrev: boolean, connectedNext: boolean): string {
  const start = connectedPrev ? "0" : radius;
  const end = connectedNext ? "0" : radius;
  return side === "top" || side === "bottom" ? `${start} ${end} ${end} ${start}` : `${start} ${start} ${end} ${end}`;
}

function edgeStyle(row: number, col: number, side: Side, connectedNext: boolean, borderRadius: string): CSSProperties {
  const cellLeft = `calc(${col} * (var(--cell-size) + var(--cell-gap)))`;
  const cellTop = `calc(${row} * (var(--cell-size) + var(--cell-gap)))`;
  // 只往「下一段」的方向補長度：上一段接到這裡時，會是它自己補長度蓋住
  // 縫隙，兩邊都補會重複多算一份 --cell-gap。
  const runLength = connectedNext ? "calc(var(--cell-size) + var(--cell-gap))" : "var(--cell-size)";

  switch (side) {
    case "top":
      return { left: cellLeft, top: `calc(${cellTop} - ${BOUNDARY_THICKNESS})`, width: runLength, height: BOUNDARY_THICKNESS, borderRadius };
    case "bottom":
      return { left: cellLeft, top: `calc(${cellTop} + var(--cell-size))`, width: runLength, height: BOUNDARY_THICKNESS, borderRadius };
    case "left":
      return { left: `calc(${cellLeft} - ${BOUNDARY_THICKNESS})`, top: cellTop, width: BOUNDARY_THICKNESS, height: runLength, borderRadius };
    case "right":
      return { left: `calc(${cellLeft} + var(--cell-size))`, top: cellTop, width: BOUNDARY_THICKNESS, height: runLength, borderRadius };
  }
}

interface DragState {
  blockId: string;
  pointerId: number;
  startX: number;
  startY: number;
  colPitch: number;
  rowPitch: number;
  axisTracker: AxisTracker;
  // 這次拖曳手勢目前為止已經結算（committed）的方塊格子——不是 React state，
  // 是拖曳過程中的即時真相來源，因為同一次拖曳中途切軸時需要立刻結算上一段
  // 再開始算下一段，而 setBlocks 是非同步的，同一個事件處理常式裡讀不到剛
  // setBlocks 進去的新值。
  currentCells: CellCoord[];
}

interface DragResult {
  direction: Direction;
  steps: number;
  offsetXPx: number;
  offsetYPx: number;
}

interface DragOffset {
  blockId: string;
  offsetXPx: number;
  offsetYPx: number;
}

// 把「從按下到目前」的原始像素位移（沿著已判定的軸），換算成：實際方向、
// 放開當下會停在第幾格（鉗制在 maxSlideSteps 算出的可行範圍內)，以及拖曳中
// 即時跟手用的像素位移（同樣鉗制，讓方塊視覺上不會被拖過障礙物）。
//
// 方向的正負號固定用「從拖曳起點累積的位移」（dx/dy）判斷，不是用 axis 判定
// 當下那一小段位移的正負號——否則像「往右拖 300px 後，手指往回收一點但仍
// 停在起點右側 250px」這種情況，會被誤判成「往左」而讓方塊瞬間跳回原地。
function computeDragResult(
  levelCells: CellCoord[],
  blocks: LevelBlock[],
  blockId: string,
  axis: Axis,
  dx: number,
  dy: number,
  colPitch: number,
  rowPitch: number,
): DragResult {
  const isHorizontal = axis === "horizontal";
  const direction: Direction = isHorizontal ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "down" : "up";
  const pitch = isHorizontal ? colPitch : rowPitch;
  const steps = maxSlideSteps(levelCells, blocks, blockId, direction);

  const forwardPx = direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
  const clampedForwardPx = pitch > 0 ? Math.max(0, Math.min(steps * pitch, forwardPx)) : 0;
  const signedOffsetPx = direction === "left" || direction === "up" ? -clampedForwardPx : clampedForwardPx;

  return {
    direction,
    steps: clampedStepsFromDistance(forwardPx, pitch, steps),
    offsetXPx: isHorizontal ? signedOffsetPx : 0,
    offsetYPx: isHorizontal ? 0 : signedOffsetPx,
  };
}

// 把某個方塊在 blocks 陣列裡的格子換成 override（用來在拖曳過程中，讓碰撞
// 判定看到「目前已經結算到哪」而不是 React state 裡還沒更新的舊位置）。
function blocksWithOverride(blocks: LevelBlock[], blockId: string, cells: CellCoord[]): LevelBlock[] {
  return blocks.map((block) => (block.id === blockId ? { ...block, cells } : block));
}

export function Board({ level, onComplete, backLink }: BoardProps) {
  const [blocks, setBlocks] = useState<LevelBlock[]>(level.blocks);
  const [exitingBlocks, setExitingBlocks] = useState<LevelBlock[]>([]);
  const [bursts, setBursts] = useState<CrumbBurst[]>([]);
  const [dragOffset, setDragOffset] = useState<DragOffset | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const exitTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  function clearExitTimers() {
    exitTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    exitTimersRef.current.clear();
  }

  useEffect(() => clearExitTimers, []);

  const floorSet = new Set(level.cells.map(([r, c]) => cellKey(r, c)));
  const walls = boundaryWalls(level.cells, floorSet, level.doors);
  const wallKeySet = new Set(walls.map((wall) => doorKey(wall.row, wall.col, wall.side)));
  const doorColorByKey = new Map(level.doors.map((door) => [doorKey(door.row, door.col, door.side), door.color]));

  function wallStyle(wall: WallSegment): CSSProperties {
    const connectedPrev = wallKeySet.has(edgeNeighborKey(wall.row, wall.col, wall.side, "prev"));
    const connectedNext = wallKeySet.has(edgeNeighborKey(wall.row, wall.col, wall.side, "next"));
    return edgeStyle(wall.row, wall.col, wall.side, connectedNext, edgeRadius(wall.side, WALL_RADIUS, connectedPrev, connectedNext));
  }

  // 門只跟「同色」的鄰接門段連成一體——不同顏色的門即使緊貼在一起，也要維持
  // 各自獨立的圓角，讀起來才分得出是兩個不同顏色的門，不是同一個門。
  function doorStyle(door: Door): CSSProperties {
    const connectedPrev = doorColorByKey.get(edgeNeighborKey(door.row, door.col, door.side, "prev")) === door.color;
    const connectedNext = doorColorByKey.get(edgeNeighborKey(door.row, door.col, door.side, "next")) === door.color;
    return edgeStyle(door.row, door.col, door.side, connectedNext, edgeRadius(door.side, DOOR_RADIUS, connectedPrev, connectedNext));
  }

  const [, maxRow] = minMax(level.cells.map(([r]) => r));
  const [, maxCol] = minMax(level.cells.map(([, c]) => c));
  const rows = maxRow + 1;
  const cols = maxCol + 1;
  // 離場動畫還在播放時，方塊在遊戲規則上已經算離場了（blocks 已經不含它），
  // 但畫面上要等它滑出去、炸開的粉粒也飛散完才顯示「過關」，感覺才像玩家
  // 親眼看到最後一個方塊離開盤面，而不是粉塵還在飛就先跳出過關橫幅。
  const isComplete = isLevelComplete(blocks) && exitingBlocks.length === 0 && bursts.length === 0;

  // 用 ref 存放最新的 onComplete，effect 的依賴只放 isComplete——這樣「進入
  // 過關狀態」只通知一次，不會因為父層每次 render 傳進來新的箭頭函式參照
  // 就重複觸發（10 節：過關要寫入 localStorage 一次，不是每次 render 都寫）。
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    if (isComplete) {
      playSound("complete");
      onCompleteRef.current?.();
    }
  }, [isComplete]);

  // 方塊滑到同色門對齊的邊界時觸發：把它從 blocks 移除（往後的碰撞判定視同
  // 它已經不在盤面上），讓它以目前方向再往外滑一步、同時在滑到的位置炸開
  // 一圈粉粒，短暫顯示後移除，做出「滑出盤面、爆成碎屑消失」的動畫，而不是
  // 瞬間憑空不見。
  function exitBlock(block: LevelBlock, direction: Direction) {
    playSound("exit");
    setBlocks((prev) => prev.filter((b) => b.id !== block.id));
    const exitedCells = translateCells(block.cells, direction, 1);
    setExitingBlocks((prev) => [...prev, { ...block, cells: exitedCells }]);
    setBursts((prev) => [...prev, createCrumbBurst({ ...block, cells: exitedCells })]);

    const wrapperTimerId = setTimeout(() => {
      setExitingBlocks((prev) => prev.filter((b) => b.id !== block.id));
      exitTimersRef.current.delete(wrapperTimerId);
    }, EXIT_ANIMATION_MS);
    exitTimersRef.current.add(wrapperTimerId);

    const burstTimerId = setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== block.id));
      exitTimersRef.current.delete(burstTimerId);
    }, BURST_ANIMATION_MS);
    exitTimersRef.current.add(burstTimerId);
  }

  function resetLevel() {
    playSound("click");
    clearExitTimers();
    dragRef.current = null;
    setDragOffset(null);
    setExitingBlocks([]);
    setBursts([]);
    setBlocks(level.blocks);
  }

  // 把 drag 目前這一段（沿著 axis，從 drag.startX/Y 到 clientX/clientY）結算
  // 進 drag.currentCells + React state，並把下一段的起點重置到目前指標位置。
  // 中途切軸時（先水平拖再改垂直拖）靠這個函式讓上一段的移動先落地，玩家才
  // 會覺得方塊全程都跟著滑鼠走，而不是等放開才算、或切軸時瞬間跳掉。
  //
  // 回傳這一段是否讓方塊離場了——離場後方塊已經不在 blocks 裡，呼叫端不能
  // 再拿 drag 繼續算下一段。
  function commitSegment(drag: DragState, axis: Axis, clientX: number, clientY: number): boolean {
    const effectiveBlocks = blocksWithOverride(blocks, drag.blockId, drag.currentCells);
    const result = computeDragResult(
      level.cells,
      effectiveBlocks,
      drag.blockId,
      axis,
      clientX - drag.startX,
      clientY - drag.startY,
      drag.colPitch,
      drag.rowPitch,
    );
    let exited = false;
    if (result.steps > 0) {
      const nextCells = translateCells(drag.currentCells, result.direction, result.steps);
      const draggedBlock = blocks.find((block) => block.id === drag.blockId);
      const movedBlock = draggedBlock && { ...draggedBlock, cells: nextCells };
      const otherBlocksCells = blocks.filter((block) => block.id !== drag.blockId).flatMap((block) => block.cells);
      const exitDirection = movedBlock
        ? findExitDirection(level.cells, level.doors, movedBlock, otherBlocksCells)
        : null;
      if (movedBlock && exitDirection) {
        exitBlock(movedBlock, exitDirection);
        exited = true;
      } else {
        playSound("move");
        drag.currentCells = nextCells;
        setBlocks((prev) => prev.map((block) => (block.id === drag.blockId ? { ...block, cells: nextCells } : block)));
      }
    }
    drag.startX = clientX;
    drag.startY = clientY;
    return exited;
  }

  function handlePointerDown(blockId: string) {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const { colPitch, rowPitch } = boardRef.current
        ? measureCellPitch(boardRef.current, cols, rows)
        : { colPitch: 0, rowPitch: 0 };
      const draggedBlock = blocks.find((block) => block.id === blockId);
      dragRef.current = {
        blockId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        colPitch,
        rowPitch,
        axisTracker: { axis: null, anchorX: event.clientX, anchorY: event.clientY },
        currentCells: draggedBlock ? draggedBlock.cells : [],
      };
      safelyCapturePointer(event.currentTarget, event.pointerId, true);
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const previousAxis = drag.axisTracker.axis;
    drag.axisTracker = updateAxisTracker(drag.axisTracker, event.clientX, event.clientY, DRAG_THRESHOLD_PX);
    const axis = drag.axisTracker.axis;
    if (!axis) {
      setDragOffset(null);
      return;
    }

    if (previousAxis && axis !== previousAxis) {
      const exited = commitSegment(drag, previousAxis, event.clientX, event.clientY);
      if (exited) {
        dragRef.current = null;
        setDragOffset(null);
        return;
      }
    }

    const effectiveBlocks = blocksWithOverride(blocks, drag.blockId, drag.currentCells);
    const result = computeDragResult(
      level.cells,
      effectiveBlocks,
      drag.blockId,
      axis,
      event.clientX - drag.startX,
      event.clientY - drag.startY,
      drag.colPitch,
      drag.rowPitch,
    );
    setDragOffset({ blockId: drag.blockId, offsetXPx: result.offsetXPx, offsetYPx: result.offsetYPx });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    safelyCapturePointer(event.currentTarget, event.pointerId, false);
    return drag;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = endDrag(event);
    setDragOffset(null);
    if (!drag) return;

    const previousAxis = drag.axisTracker.axis;
    drag.axisTracker = updateAxisTracker(drag.axisTracker, event.clientX, event.clientY, DRAG_THRESHOLD_PX);
    const axis = drag.axisTracker.axis;
    if (!axis) return;

    // 放開這一刻如果剛好切了軸，新軸這一段的位移必然是 0（切換點就是放開點），
    // 所以只要結算「切換前」那一段就好，不用再多結算一次 0 位移的新軸。
    commitSegment(drag, previousAxis && axis !== previousAxis ? previousAxis : axis, event.clientX, event.clientY);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    endDrag(event);
    setDragOffset(null);
  }

  function renderBlockWrapper(
    block: LevelBlock,
    options: { interactive: boolean; extraClassName?: string; popDelayMs?: number },
  ) {
    const { anchorRow, anchorCol, shapeRows, shapeCols } = boundingBox(block.cells);
    const isDragging = options.interactive && dragOffset?.blockId === block.id;
    const className = [styles.blockWrapper, isDragging ? styles.dragging : null, options.extraClassName]
      .filter(Boolean)
      .join(" ");
    const pointerHandlers = options.interactive
      ? {
          onPointerDown: handlePointerDown(block.id),
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerCancel,
        }
      : {};
    return (
      <div
        key={block.id}
        data-block-wrapper-id={block.id}
        className={className}
        style={
          {
            "--anchor-row": anchorRow,
            "--anchor-col": anchorCol,
            "--pop-delay": `${options.popDelayMs ?? 0}ms`,
            ...(isDragging && dragOffset
              ? { "--drag-offset-x": `${dragOffset.offsetXPx}px`, "--drag-offset-y": `${dragOffset.offsetYPx}px` }
              : {}),
            gridTemplateColumns: `repeat(${shapeCols}, var(--cell-size))`,
            gridTemplateRows: `repeat(${shapeRows}, var(--cell-size))`,
          } as CSSProperties
        }
        {...pointerHandlers}
      >
        {block.cells.map(([r, c]) => (
          <div
            key={`${block.id}-${cellKey(r, c)}`}
            data-block-id={block.id}
            className={`${styles.block} ${styles[block.color]}`}
            style={{ gridRow: r - anchorRow + 1, gridColumn: c - anchorCol + 1 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        {backLink}
        <h1 className={styles.title}>{level.name}</h1>
        <button type="button" className={styles.resetButton} onClick={resetLevel}>
          重設關卡
        </button>
      </div>

      {isComplete && (
        <p className={styles.completeBanner} role="status">
          🎉 過關啦！🎉
        </p>
      )}

      <div className={styles.boardFrame}>
        <div
          ref={boardRef}
          className={styles.board}
          style={{
            gridTemplateColumns: `repeat(${cols}, var(--cell-size))`,
            gridTemplateRows: `repeat(${rows}, var(--cell-size))`,
          }}
        >
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => (
              <div
                key={cellKey(r, c)}
                className={floorSet.has(cellKey(r, c)) ? styles.floor : styles.hole}
                style={{ gridRow: r + 1, gridColumn: c + 1 }}
              />
            )),
          )}

          {walls.map((wall) => (
            <div key={`wall-${wall.row}-${wall.col}-${wall.side}`} className={styles.wall} style={wallStyle(wall)} />
          ))}

          {level.doors.map((door) => (
            <div
              key={`door-${door.row}-${door.col}`}
              data-door-color={door.color}
              className={`${styles.door} ${styles[door.color]}`}
              style={doorStyle(door)}
            />
          ))}

          {blocks.map((block, index) =>
            renderBlockWrapper(block, { interactive: true, popDelayMs: index * 60 }),
          )}
          {exitingBlocks.map((block) =>
            renderBlockWrapper(block, { interactive: false, extraClassName: styles.exiting }),
          )}

          {bursts.map((burst) => (
            <Fragment key={`burst-${burst.id}`}>
              {/* 整塊方塊共用一次閃光＋衝擊波，強化「爆炸」的第一擊；下面每格
                  各自噴發的粉粒才是持續飛散的碎屑，兩層疊在一起才夠誇張。 */}
              <div
                className={styles.crumbBurst}
                style={{ ...cellCenterStyle(burst.center.row, burst.center.col), "--dot-color": burst.color } as CSSProperties}
              >
                <span className={styles.crumbFlash} />
                <span className={styles.crumbRing} />
              </div>

              {burst.cells.map((cell) => (
                <div
                  key={`${burst.id}-${cell.row}-${cell.col}`}
                  className={styles.crumbBurst}
                  style={cellCenterStyle(cell.row, cell.col)}
                >
                  {cell.dots.map((dot, dotIndex) => (
                    <span
                      key={dotIndex}
                      className={styles.crumb}
                      style={
                        {
                          "--dx": dot.dx,
                          "--dy": dot.dy,
                          "--rot": dot.rot,
                          "--size": dot.size,
                          "--dot-color": burst.color,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
