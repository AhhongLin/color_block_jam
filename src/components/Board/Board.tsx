import {
  Fragment,
  useLayoutEffect,
  useRef,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { CellCoord, Color, Door, Level, LevelBlock, Side } from "../../types/level";
import type { Direction } from "../../game/slide";
import { isLevelComplete } from "../../game/exit";
import { playSound } from "../../audio/sound";
import { buildBlockClipPath, computeShineAnchor } from "./blockShape";
import { buildWallBandClipPath } from "./wallBandShape";
import { useExitAnimation, type CrumbDot } from "./useExitAnimation";
import { useDragGesture, measureCellPitch } from "./useDragGesture";
import { computeStackRanks } from "./stackOrder";
import styles from "./Board.module.css";

interface BoardProps {
  level: Level;
  onComplete?: () => void;
  // 「回選單」連結由呼叫端（LevelPage）決定內容——Board 本身是純遊戲盤面
  // 元件，不該直接依賴 react-router 的 Link，改成插槽讓呼叫端自己塞。
  backLink?: ReactNode;
}

// 跟 Board.module.css 的 --block-color（透過 Board.tsx 內聯設在
// .blockShapeGroup 上）同一套色票——離場粉粒是獨立於方塊本體的元素（方塊
// 消失動畫播完就從 DOM 移除），沒辦法用 CSS 繼承拿到顏色，只能在 JS 這邊
// 也留一份對照表，內聯成 --dot-color 傳給每一顆粒子。
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

// useExitAnimation 回傳的是原始幾何數值（距離／角度／旋轉／尺寸，見該檔案
// CrumbDot 的註解），字串化（換算成 --dx/--dy 的 px 位移、加上單位）是渲染
// 層的職責，這裡才做。
function crumbDotStyle(dot: CrumbDot): CSSProperties {
  return {
    "--dx": `${(Math.cos(dot.angleRad) * dot.distancePx).toFixed(1)}px`,
    "--dy": `${(Math.sin(dot.angleRad) * dot.distancePx).toFixed(1)}px`,
    "--rot": `${dot.rotationDeg}deg`,
    "--size": `${dot.sizePx.toFixed(1)}px`,
  } as CSSProperties;
}

// 方塊的立體卡通材質疊三層畫（陰影／底座／填色，見 Board.module.css 的
// .blockShadow/.blockBase/.blockFill）：底座是跟填色層同形狀、往外推
// BLOCK_OUTSET_PX 的大一號輪廓（蓋住兩層間可能露出的縫），填色層本身再往上
// 位移做出厚度感（位移量寫在 CSS 裡）。BLOCK_CORNER_RADIUS_RATIO 是圓角
// 半徑相對格距的比例。
const BLOCK_OUTSET_PX = 2;
const BLOCK_CORNER_RADIUS_RATIO = 0.28;

function minMax(values: number[]): [min: number, max: number] {
  return [Math.min(...values), Math.max(...values)];
}

// 離場中的方塊、拖曳中的方塊都要蓋過一般靜置中的方塊（離場方塊本來就要
// 飛出画面、拖曳中的方塊使用者正抓著看，兩者都該在最上層），用比
// computeStackRanks() 算出的名次（0 起跳、最多就是方塊數量）大上一截的
// 常數區間表示，兩個區間之間留足夠差距，不會被一般名次追上。
const EXITING_Z_INDEX = 1000;
const DRAGGING_Z_INDEX = 2000;

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

// 牆是一整條連續的色帶（見 wallBandShape.ts），不再逐格畫——門才是逐格畫
// 的：門疊在色帶上面，只是換色的一段，所以門的定位還是沿用「相對格子邊
// 界、往外凸出固定厚度」這套座標系統（跟 blockWrapper 共用，單位是「幾個
// 格子」乘上 --cell-size + --cell-gap）。
function doorKey(row: number, col: number, side: Side): string {
  return `${row},${col},${side}`;
}

// 色帶/門共用的凸出厚度——跟 wallBandShape.ts 算色帶 clip-path 用的
// BOUNDARY_THICKNESS_RATIO 是同一個比例，數值分別用 CSS calc（門的定位）
// 跟量出來的 px（色帶 clip-path 的座標系統）各自表示一份。
const BOUNDARY_THICKNESS = "calc(var(--cell-size) * 0.22)";
const BOUNDARY_THICKNESS_RATIO = 0.22;

// 色帶本身圓角的比例（相對量出來的 cellPitchPx），色帶是唯一還有圓角的
// 元素——門疊上去時用直角（見 doorStyle()），才不會在門的邊緣露出色帶的
// 圓角缺口。跟 Board.module.css 的 .floor { border-radius: 10% } 用同一個
// 比例，色帶轉角跟背景灰格轉角才會是一致的圓潤程度。
const BAND_CORNER_RADIUS_RATIO = 0.1;

// 門跟同色的鄰接門段連成一體時，往「下一段」補上 --cell-gap 蓋住縫隙（門
// 本身用直角，不需要再算圓角要留在哪一側，見下方 doorStyle()）。
function edgeNeighborKey(row: number, col: number, side: Side, direction: "prev" | "next"): string {
  const step = direction === "prev" ? -1 : 1;
  return side === "top" || side === "bottom" ? doorKey(row, col + step, side) : doorKey(row + step, col, side);
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

export function Board({ level, onComplete, backLink }: BoardProps) {
  const [blocks, setBlocks] = useState<LevelBlock[]>(level.blocks);
  // 方塊是單一剪影（clip-path 沿格子邊界描出的多邊形，見 blockShape.ts），
  // clip-path 的 SVG path 只能吃字面數字，不能塞 var(--cell-size) 這種 calc
  // 表達式，所以要另外量出目前實際渲染的格距 px 值——量法跟 useDragGesture
  // 的 measureCellPitch() 共用，只是這裡要在畫面尺寸改變時（RWD）持續重量，
  // 不是只在按下拖曳那一刻量一次。
  const [cellPitchPx, setCellPitchPx] = useState(0);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const floorSet = new Set(level.cells.map(([r, c]) => cellKey(r, c)));
  const doorColorByKey = new Map(level.doors.map((door) => [doorKey(door.row, door.col, door.side), door.color]));

  // 門疊在色帶上只是換色的一段，用直角（"0"）——色帶本身已經是無縫的一整圈
  // （見 wallBandShape.ts），門只要跟同色鄰接門段往「下一段」補上 --cell-gap
  // 蓋住縫隙即可，不需要再算圓角要留在哪一側。
  function doorStyle(door: Door): CSSProperties {
    const connectedNext = doorColorByKey.get(edgeNeighborKey(door.row, door.col, door.side, "next")) === door.color;
    return edgeStyle(door.row, door.col, door.side, connectedNext, "0");
  }

  // 「方塊離場」這整件事（從 blocks 移除、播音效、滑出動畫、粉粒排程）都收
  // 在 useExitAnimation 裡（見該檔案），Board 只需要把穩定協作者
  // （floorSet／removeBlock）傳進去，換回渲染需要的狀態與單一進入點
  // startExit()。
  function removeBlock(blockId: string) {
    setBlocks((prev) => prev.filter((block) => block.id !== blockId));
  }
  const { exitingBlocks, bursts, startExit, reset: resetExitAnimation } = useExitAnimation(floorSet, removeBlock);

  const [, maxRow] = minMax(level.cells.map(([r]) => r));
  const [, maxCol] = minMax(level.cells.map(([, c]) => c));
  const rows = maxRow + 1;
  const cols = maxCol + 1;

  function handleMove(blockId: string, nextCells: CellCoord[]) {
    setBlocks((prev) => prev.map((block) => (block.id === blockId ? { ...block, cells: nextCells } : block)));
  }
  function handleExit(block: LevelBlock, direction: Direction) {
    startExit(block, direction, COLOR_HEX[block.color]);
  }
  const {
    dragOffset,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    reset: resetDrag,
  } = useDragGesture({
    levelCells: level.cells,
    levelDoors: level.doors,
    blocks,
    cols,
    rows,
    boardRef,
    onMove: handleMove,
    onExit: handleExit,
  });

  // 用 useLayoutEffect（不是 useEffect）同步量測，讓瀏覽器正式畫出畫面前
  // cellPitchPx 就已經有值——避免掛載那一瞬間方塊因為量不到格距而不畫、
  // 下一個 tick 才「彈」出來的閃爍。RWD 改變 --cell-size 時（min(15vw,64px)）
  // 要重新量，不然視窗縮放後方塊形狀會跟盤面格線對不齊。
  useLayoutEffect(() => {
    const boardEl = boardRef.current;
    if (!boardEl) return;
    function measure() {
      if (!boardEl) return;
      const { colPitch, rowPitch } = measureCellPitch(boardEl, cols, rows);
      setCellPitchPx((colPitch + rowPitch) / 2);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(boardEl);
    return () => observer.disconnect();
  }, [cols, rows]);

  // 離場動畫還在播放時，方塊在遊戲規則上已經算離場了（blocks 已經不含它），
  // 但畫面上要等它滑出去才顯示「過關」，感覺才像玩家親眼看到最後一個方塊
  // 離開盤面。不等粉粒完全飛散完（bursts）——粉粒尾韻長達 CRUMB_FLY_MS
  // （2200ms），等它完全清空才彈出過關橫幅會讓玩家覺得「明明方塊都不見了
  // 卻遲遲沒過關」（使用者反饋：離場後到過關橫幅的間隔過長）；粉粒可以在
  // 過關橫幅顯示後繼續在背景飛散收尾，不影響觀感。
  const isComplete = isLevelComplete(blocks) && exitingBlocks.length === 0;

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

  function resetLevel() {
    playSound("click");
    resetExitAnimation();
    resetDrag();
    setBlocks(level.blocks);
  }

  function renderBlockWrapper(
    block: LevelBlock,
    options: {
      interactive: boolean;
      extraClassName?: string;
      popDelayMs?: number;
      slideMs?: number;
      zIndex?: number;
    },
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
    const baseStyle: CSSProperties = {
      "--anchor-row": anchorRow,
      "--anchor-col": anchorCol,
      "--pop-delay": `${options.popDelayMs ?? 0}ms`,
      // 疊放順序見 computeStackRanks() 註解——只用 z-index 表達，不重排
      // DOM 順序，拖曳中的方塊固定蓋過其他所有方塊。
      zIndex: isDragging ? DRAGGING_Z_INDEX : options.zIndex,
      // 離場滑行總時長每次可能不同（見 ExitingBlock/computeExitClearSteps()），
      // 內聯設在這個 wrapper 上覆寫 Board.module.css `.blockWrapper.exiting`
      // 的預設值。
      ...(options.slideMs !== undefined ? { "--exit-slide-ms": `${options.slideMs}ms` } : {}),
      ...(isDragging && dragOffset
        ? { "--drag-offset-x": `${dragOffset.offsetXPx}px`, "--drag-offset-y": `${dragOffset.offsetYPx}px` }
        : {}),
    } as CSSProperties;

    // 整個方塊只用一組疊層畫（陰影／底座／填色，見 Board.module.css 的
    // .blockShadow/.blockBase/.blockFill），全部共用同一份幾何（沿格子邊界
    // 描出的一整圈輪廓，見 blockShape.ts）。底座層不是疊 filter 位移色塊
    // 做出來的——那個做法在 Chrome 實測會被 clip-path 整個吃掉（clip-path
    // 套用在 filter 算完的結果上，超出原輪廓的部分直接不見）——而是老實
    // 算一份「整圈往外推 BLOCK_OUTSET_PX」的大一號多邊形，蓋在填色層底下。
    // wrapper 尺寸改用量出來的 px 格距直接算，不再依賴 CSS grid 的欄寬。
    const localCells: CellCoord[] = block.cells.map(([r, c]) => [r - anchorRow, c - anchorCol]);
    const cornerRadiusPx = cellPitchPx * BLOCK_CORNER_RADIUS_RATIO;
    const clipPath = cellPitchPx > 0 ? buildBlockClipPath(localCells, cellPitchPx, cornerRadiusPx) : undefined;
    const clipPathOutset =
      cellPitchPx > 0 ? buildBlockClipPath(localCells, cellPitchPx, cornerRadiusPx, BLOCK_OUTSET_PX) : undefined;
    const shine = computeShineAnchor(localCells, cellPitchPx);
    return (
      <div
        key={block.id}
        data-block-wrapper-id={block.id}
        className={className}
        style={{ ...baseStyle, width: `${shapeCols * cellPitchPx}px`, height: `${shapeRows * cellPitchPx}px` }}
        {...pointerHandlers}
      >
        {clipPath && clipPathOutset && (
          // --block-color 在這一層設一次，三個子層都是它的子元素，靠 CSS
          // 繼承拿到同一個顏色值，不用每個顏色各寫一條 CSS class。
          <div
            className={styles.blockShapeGroup}
            style={
              {
                "--block-color": COLOR_HEX[block.color],
                // 見 blockShape.ts 的 computeShineAnchor() 註解，供
                // .blockFill::before 的高光定位用。
                "--shine-x": `${shine.xPx}px`,
                "--shine-y": `${shine.yPx}px`,
                "--shine-w": `${shine.widthPx}px`,
              } as CSSProperties
            }
          >
            <div
              className={`${styles.blockShapeLayer} ${styles.blockShadow}`}
              style={{ "--block-clip": clipPathOutset } as CSSProperties}
            />
            <div
              className={`${styles.blockShapeLayer} ${styles.blockBase}`}
              style={{ "--block-clip": clipPathOutset } as CSSProperties}
            />
            <div
              data-block-id={block.id}
              className={`${styles.blockShapeLayer} ${styles.blockFill}`}
              style={{ "--block-clip": clipPath } as CSSProperties}
            />
          </div>
        )}
      </div>
    );
  }

  const stackRanks = computeStackRanks(blocks);

  // 整條色帶（牆＋門的底色，見 wallBandShape.ts）用量出來的 cellPitchPx 換算
  // 成 px 幾何，才能跟 blockShape.ts 那套 clip-path 算法共用同一個座標系統。
  // wallBandMarginPx 是色帶容器要往外多留多少 px 才能完整包住往外推出去的
  // 部分（見 wallBandShape.ts 的 origin 參數），跟往外推的量（thickness）
  // 一樣多就夠。
  const wallBandThicknessPx = cellPitchPx * BOUNDARY_THICKNESS_RATIO;
  const wallBandCornerRadiusPx = cellPitchPx * BAND_CORNER_RADIUS_RATIO;
  const wallBandMarginPx = wallBandThicknessPx;
  const wallBandClipPath =
    cellPitchPx > 0
      ? buildWallBandClipPath(level.cells, cellPitchPx, wallBandCornerRadiusPx, wallBandThicknessPx)
      : "";
  // wallBandClipPath 用的多邊形演算法沿用 blockShape.ts 那套「合併地板格子
  // 間縫隙」的簡化（見 wallBandShape.ts 開頭說明）——對方塊來說縫隙消失是
  // 想要的效果，但對色帶而言，色帶的底色不該吃掉地板格子之間本來就有的
  // 2px 縫隙（那些縫隙該露出 .board 本身的灰色背景，不是色帶顏色）。這裡
  // 額外算一份「完全貼齊地板、不往外推」（outsetPx=0）的同一份多邊形，蓋
  // 在色帶上面、地板格子下面，把色帶「挖空」回地板的真實範圍，縫隙才能
  // 露出灰色而不是色帶色。
  const wallBandHoleClipPath = cellPitchPx > 0 ? buildWallBandClipPath(level.cells, cellPitchPx, 0, 0) : "";

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
          {/* 整條色帶：牆＋門共用的底色，一整圈連續多邊形，門只是疊在上面
              換色的區塊（見下面 level.doors.map），不會在門/牆交界處露出
              縫隙（見 wallBandShape.ts 開頭說明）。要蓋在地板格子「下面」
              ——地板格子本身不透明，會蓋掉色帶內側，只露出往外凸出地板
              以外的那一圈。 */}
          {wallBandClipPath && (
            <div
              className={styles.wallBand}
              style={{
                left: `${-wallBandMarginPx}px`,
                top: `${-wallBandMarginPx}px`,
                width: `${cols * cellPitchPx + 2 * wallBandMarginPx}px`,
                height: `${rows * cellPitchPx + 2 * wallBandMarginPx}px`,
                clipPath: wallBandClipPath,
              }}
            />
          )}

          {/* 把色帶「挖空」回地板的真實範圍（見上面 wallBandHoleClipPath 的
              註解），蓋在色帶之上、地板格子之下，讓地板格子間的縫隙露出
              .board 本身的灰色，不是色帶顏色。 */}
          {wallBandHoleClipPath && (
            <div
              className={styles.wallBandHole}
              style={{
                left: 0,
                top: 0,
                width: `${cols * cellPitchPx}px`,
                height: `${rows * cellPitchPx}px`,
                clipPath: wallBandHoleClipPath,
              }}
            />
          )}

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
              style={doorStyle(door)}
            />
          ))}

          {/* 方塊本體（可拖曳中＋離場中）都關在這一層裡，讓 Board.module.css
              的 .blockClipLayer 用 clip-path 卡出門的範圍——超出這個範圍就
              整個看不見，是實際的空間邊界，不是猜時間淡出（見該 class 的
              註解）。門、牆、地板、粉粒都留在這層外面，才不會被一起裁掉。 */}
          <div className={styles.blockClipLayer}>
            {blocks.map((block, index) =>
              renderBlockWrapper(block, {
                interactive: true,
                popDelayMs: index * 60,
                zIndex: stackRanks.get(block.id),
              }),
            )}
            {exitingBlocks.map((block) =>
              renderBlockWrapper(block, {
                interactive: false,
                extraClassName: styles.exiting,
                slideMs: block.slideMs,
                zIndex: EXITING_Z_INDEX,
              }),
            )}
          </div>

          {bursts.map((burst) => (
            <Fragment key={`burst-${burst.id}`}>
              {/* 整塊方塊共用一次閃光，強化「爆炸」的第一擊；下面每格各自噴發
                  的粉粒才是持續飛散的碎屑，兩層疊在一起才夠誇張。 */}
              <div
                className={styles.crumbBurst}
                style={{ ...cellCenterStyle(burst.center.row, burst.center.col), "--dot-color": burst.color } as CSSProperties}
              >
                <span className={styles.crumbFlash} />
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
                      style={{ ...crumbDotStyle(dot), "--dot-color": burst.color } as CSSProperties}
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
