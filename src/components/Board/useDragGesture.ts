import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { CellCoord, Door, LevelBlock } from "../../types/level";
import { maxSlideSteps, translateCells, type Direction } from "../../game/slide";
import { clampedStepsFromDistance, updateAxisTracker, type Axis, type AxisTracker } from "../../game/dragDirection";
import { findExitDirection } from "../../game/exit";
import { playSound } from "../../audio/sound";

// 位移量小於此門檻視為未拖曳（避免手指/滑鼠微小晃動被誤判成滑動）。
const DRAG_THRESHOLD_PX = 12;

// 量測盤面一格的實際像素間距（含 gap）。用整個盤面容器的 rect 除以格數，而不
// 是量測單一格子，這樣不管 CSS 用 vw/px 哪種單位都能量出目前實際渲染的大小。
// 拖曳（handlePointerDown）跟 Board.tsx 渲染方塊形狀用的 cellPitchPx 各自
// 獨立呼叫這個函式，兩邊的量法必須完全一致，所以放在這裡匯出，Board.tsx
// 反過來從這裡 import，不要各自維護一份會逐漸分岔的複製。
export function measureCellPitch(
  boardEl: HTMLElement,
  cols: number,
  rows: number,
): { colPitch: number; rowPitch: number } {
  const rect = boardEl.getBoundingClientRect();
  return {
    colPitch: cols > 0 ? rect.width / cols : 0,
    rowPitch: rows > 0 ? rect.height / rows : 0,
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
  // 再開始算下一段，而 onMove 觸發的 setBlocks 是非同步的，同一個事件處理
  // 常式裡讀不到剛更新進去的新值。
  currentCells: CellCoord[];
}

interface DragResult {
  direction: Direction;
  steps: number;
  offsetXPx: number;
  offsetYPx: number;
}

export interface DragOffset {
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
//
// 匯出成測試專用的 named export——Board.tsx 不會直接用到它，真正的介面是
// useDragGesture()，但這段方向/鉗制數學值得有自己的聚焦測試（「Fix block
// getting stuck after being dragged once」那次 bug 就出在這一帶），不該只
// 靠整個 DOM 模擬間接測到。
export function computeDragResult(
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

interface UseDragGestureParams {
  levelCells: CellCoord[];
  levelDoors: Door[];
  // 每次 render 都傳目前最新的一份——這個 hook 每次 render 都會重新定義
  // 底下的 handler closure（不是像 useExitAnimation 那樣被 setTimeout 延遲
  // 呼叫），所以不需要額外用 ref 存最新值，直接吃參數就是最新的。
  blocks: LevelBlock[];
  cols: number;
  rows: number;
  boardRef: RefObject<HTMLDivElement | null>;
  onMove: (blockId: string, nextCells: CellCoord[]) => void;
  onExit: (block: LevelBlock, direction: Direction) => void;
}

// 把「拖曳一個方塊」這整件事收在一個 interface 底下：軸判定、鉗制範圍、
// pointer capture、切軸時的分段結算、播 move 音效、以及「這段移動最後是
// 滑動還是直接離場」的判斷（呼叫端只需要接住 onMove／onExit 兩種結局）。
export function useDragGesture({ levelCells, levelDoors, blocks, cols, rows, boardRef, onMove, onExit }: UseDragGestureParams) {
  const [dragOffset, setDragOffset] = useState<DragOffset | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // 把 drag 目前這一段（沿著 axis，從 drag.startX/Y 到 clientX/clientY）結算
  // 進 drag.currentCells，並把下一段的起點重置到目前指標位置。中途切軸時
  // （先水平拖再改垂直拖）靠這個函式讓上一段的移動先落地，玩家才會覺得
  // 方塊全程都跟著滑鼠走，而不是等放開才算、或切軸時瞬間跳掉。
  //
  // 回傳這一段是否讓方塊離場了——離場後方塊已經不在 blocks 裡，呼叫端不能
  // 再拿 drag 繼續算下一段。
  function commitSegment(drag: DragState, axis: Axis, clientX: number, clientY: number): boolean {
    const effectiveBlocks = blocksWithOverride(blocks, drag.blockId, drag.currentCells);
    const result = computeDragResult(
      levelCells,
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
        ? findExitDirection(levelCells, levelDoors, movedBlock, otherBlocksCells)
        : null;
      if (movedBlock && exitDirection) {
        onExit(movedBlock, exitDirection);
        exited = true;
      } else {
        playSound("move");
        drag.currentCells = nextCells;
        onMove(drag.blockId, nextCells);
      }
    }
    drag.startX = clientX;
    drag.startY = clientY;
    return exited;
  }

  function handlePointerDown(blockId: string) {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // 擋掉瀏覽器對 pointerdown 的預設行為（文字選取／原生拖曳）。若不擋，
      // 放開後方塊上會留著一段空的文字選取範圍，下一次在同一個方塊上按下時
      // 瀏覽器會把它判定成「拖曳選取範圍」而觸發原生 dragstart，導致
      // pointercancel、方塊卡住拖不動、游標還會變成瀏覽器原生的「禁止」圖示。
      event.preventDefault();
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
      levelCells,
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

  function reset() {
    dragRef.current = null;
    setDragOffset(null);
  }

  return { dragOffset, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, reset };
}
