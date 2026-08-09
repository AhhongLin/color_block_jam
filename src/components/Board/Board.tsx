import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { CellCoord, Level, LevelBlock, Side } from "../../types/level";
import { maxSlideSteps, translateCells, type Direction } from "../../game/slide";
import { clampedStepsFromDistance, updateAxisTracker, type Axis, type AxisTracker } from "../../game/dragDirection";
import { canExit, isLevelComplete } from "../../game/exit";
import styles from "./Board.module.css";

interface BoardProps {
  level: Level;
}

// 位移量小於此門檻視為未拖曳（避免手指/滑鼠微小晃動被誤判成滑動）。
const DRAG_THRESHOLD_PX = 12;

// 方塊離場時，讓它視覺上再往外滑一步、淡出消失的動畫時長。要跟
// Board.module.css 的 `.blockWrapper` transition 時長（160ms）一致。
const EXIT_ANIMATION_MS = 160;

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

const DOOR_STYLE_BY_SIDE: Record<Side, Pick<CSSProperties, "alignSelf" | "justifySelf" | "width" | "height">> = {
  top: { alignSelf: "start", justifySelf: "center", width: "70%", height: "14%" },
  bottom: { alignSelf: "end", justifySelf: "center", width: "70%", height: "14%" },
  left: { alignSelf: "center", justifySelf: "start", width: "14%", height: "70%" },
  right: { alignSelf: "center", justifySelf: "end", width: "14%", height: "70%" },
};

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

export function Board({ level }: BoardProps) {
  const [blocks, setBlocks] = useState<LevelBlock[]>(level.blocks);
  const [exitingBlocks, setExitingBlocks] = useState<LevelBlock[]>([]);
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
  const [, maxRow] = minMax(level.cells.map(([r]) => r));
  const [, maxCol] = minMax(level.cells.map(([, c]) => c));
  const rows = maxRow + 1;
  const cols = maxCol + 1;
  // 離場動畫還在播放時，方塊在遊戲規則上已經算離場了（blocks 已經不含它），
  // 但畫面上要等它滑出去、淡出完才顯示「過關」，感覺才像玩家親眼看到最後
  // 一個方塊離開盤面。
  const isComplete = isLevelComplete(blocks) && exitingBlocks.length === 0;

  // 方塊滑到同色門對齊的邊界時觸發：把它從 blocks 移除（往後的碰撞判定視同
  // 它已經不在盤面上），並讓它以目前方向再往外滑一步、短暫顯示後移除，做出
  // 「滑出盤面消失」的動畫，而不是瞬間憑空不見。
  function exitBlock(block: LevelBlock, direction: Direction) {
    setBlocks((prev) => prev.filter((b) => b.id !== block.id));
    setExitingBlocks((prev) => [...prev, { ...block, cells: translateCells(block.cells, direction, 1) }]);
    const timerId = setTimeout(() => {
      setExitingBlocks((prev) => prev.filter((b) => b.id !== block.id));
      exitTimersRef.current.delete(timerId);
    }, EXIT_ANIMATION_MS);
    exitTimersRef.current.add(timerId);
  }

  function resetLevel() {
    clearExitTimers();
    dragRef.current = null;
    setDragOffset(null);
    setExitingBlocks([]);
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
      if (movedBlock && canExit(level.cells, level.doors, movedBlock, result.direction)) {
        exitBlock(movedBlock, result.direction);
        exited = true;
      } else {
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

  function renderBlockWrapper(block: LevelBlock, options: { interactive: boolean; extraClassName?: string }) {
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
        <h1 className={styles.title}>{level.name}</h1>
        <button type="button" className={styles.resetButton} onClick={resetLevel}>
          重設關卡
        </button>
      </div>

      {isComplete && (
        <p className={styles.completeBanner} role="status">
          🎉 過關！
        </p>
      )}

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

        {level.doors.map((door) => (
          <div
            key={`door-${door.row}-${door.col}`}
            data-door-color={door.color}
            className={`${styles.door} ${styles[door.color]}`}
            style={{
              gridRow: door.row + 1,
              gridColumn: door.col + 1,
              ...DOOR_STYLE_BY_SIDE[door.side],
            }}
          />
        ))}

        {blocks.map((block) => renderBlockWrapper(block, { interactive: true }))}
        {exitingBlocks.map((block) => renderBlockWrapper(block, { interactive: false, extraClassName: styles.exiting }))}
      </div>
    </div>
  );
}
