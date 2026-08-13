import {
  Fragment,
  useLayoutEffect,
  useRef,
  useEffect,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { CellCoord, Color, Door, Level, LevelBlock, Side } from "../../types/level";
import { DIRECTION_DELTA, maxSlideSteps, translateCells, type Direction } from "../../game/slide";
import { clampedStepsFromDistance, updateAxisTracker, type Axis, type AxisTracker } from "../../game/dragDirection";
import { findExitDirection, isLevelComplete } from "../../game/exit";
import { playSound } from "../../audio/sound";
import { buildBlockClipPath } from "./blockShape";
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

// 方塊離場時，讓它視覺上一路滑出門外、途中持續噴發粉粒直到整塊消失。
// EXIT_STEP_MS 是「滑出一格」的單位時長——實際滑行總時長＝EXIT_STEP_MS ×
// computeExitClearSteps() 算出的格數（L 形方塊短臂需要多滑幾格才能整塊
// 出界，見該函式註解）。
const EXIT_STEP_MS = 500;
// 粉粒噴發的節奏改用獨立的時間間隔，不再綁在 EXIT_STEP_MS（滑 1 格的時
// 長）上——原本一格只噴一波太稀疏，使用者反饋噴發頻率要高一些。這個間隔
// 只決定「多常補一波」，跟方塊滑行速度無關，滑行總時長（slideMs）不變，
// 只是在同樣的時間內拆成更多、更密的波次。
const CRUMB_WAVE_INTERVAL_MS = 140;
// 粉粒噴發後停留在畫面上的時間，要跟 Board.module.css 的 `.crumb`
// crumbFly 動畫時長一致。
const CRUMB_FLY_MS = 2200;
// 粉粒容器多留在畫面上、才真的移除 DOM 的緩衝時間，讓 CSS 動畫播完才
// 移除，不會被 React 提早卸載切斷尾韻。
const CRUMB_BURST_REMOVE_BUFFER_MS = 100;
// 每格噴發的粉粒數量（多格方塊離場時分批噴發，見 exitBlock()
// 的 dotsPerWave 換算）。
const CRUMB_DOTS_PER_CELL = 56;
// 粉粒飛散距離／尺寸的倍率——1 是最初的手感，這裡刻意誇張放大，噴更遠、
// 顆粒更大才夠有份量。
const CRUMB_SPREAD_SCALE = 2.1;
// 離場方塊掛進 exitingBlocks 後，隔多久才把格子改成 exitedCells、觸發真正
// 的滑出 transition（見 exitBlock()）。夠短、人眼感覺不到延遲，
// 但夠讓瀏覽器先畫出一幀起點畫面，CSS transition 才有「起點」可以動畫。
const EXIT_SLIDE_START_DELAY_MS = 20;

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

// 方塊往哪個方向出門，粉粒的噴發角度基準就對齊那個方向（畫面座標：x 右正、
// y 下正，跟 row/col 的 dx/dy 是同一套系統）。
const EXIT_DIRECTION_ANGLE_RAD: Record<Direction, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

// 粉粒噴發的錐形張角——不是整圈 360° 平均噴發（那是在原地炸開的感覺），
// 只朝「方塊出門的方向」噴一個扇形，才會有「一出門就對著門外炸開」的方向
// 感，不是站在門口原地爆炸。130° 抓一個夠寬的扇形，噴出去還是有炸裂的散開
// 感，不會窄成一直線的雷射感。
const CRUMB_SPRAY_CONE_RAD = (130 * Math.PI) / 180;

// 一格炸開的粉粒角度在「出門方向」為中心的扇形內平均分佈、再加隨機抖動，
// 距離/大小也各自帶一點隨機——避免看起來像複製貼上的規律圖案，而是碎屑
// 四散的手感。距離/尺寸都刻意誇張一點（超出格子本身範圍不少），效果才會
// 夠明顯，不會一閃即逝看不清楚。
function createCrumbCellDots(dotsPerCell: number, direction: Direction = "up"): CrumbDot[] {
  const baseAngle = EXIT_DIRECTION_ANGLE_RAD[direction];
  const denom = Math.max(dotsPerCell - 1, 1);
  // size 的倍率刻意比 distance 溫和，不然 CRUMB_SPREAD_SCALE 拉到 2 倍時
  // 顆粒會腫成一坨看不出碎屑感，噴更遠但顆粒不用等比例變大。
  const sizeScale = 1 + (CRUMB_SPREAD_SCALE - 1) * 0.5;
  return Array.from({ length: dotsPerCell }, (_, i) => {
    const spread = (i / denom - 0.5) * CRUMB_SPRAY_CONE_RAD;
    const jitter = (Math.random() - 0.5) * ((20 * Math.PI) / 180);
    const angle = baseAngle + spread + jitter;
    const distance = (26 + Math.random() * 32) * CRUMB_SPREAD_SCALE;
    return {
      dx: `${(Math.cos(angle) * distance).toFixed(1)}px`,
      dy: `${(Math.sin(angle) * distance).toFixed(1)}px`,
      rot: `${Math.floor(Math.random() * 360) - 180}deg`,
      size: `${((5 + Math.random() * 5) * sizeScale).toFixed(1)}px`,
    };
  });
}

// 每個離場方塊自己的格子都各自炸開一圈粉粒（不是整個方塊共用一個爆點），
// 多格方塊看起來才會像「整塊碎開」而不是從單一個點噴出來；所有格子共用
// 同一個出門方向，噴發扇形才會一致朝門外散開。
function createCrumbBurst(block: LevelBlock, dotsPerCell: number, direction: Direction = "up"): CrumbBurst {
  const rows = block.cells.map(([row]) => row);
  const cols = block.cells.map(([, col]) => col);
  return {
    id: block.id,
    color: COLOR_HEX[block.color],
    center: {
      row: rows.reduce((sum, row) => sum + row, 0) / rows.length,
      col: cols.reduce((sum, col) => sum + col, 0) / cols.length,
    },
    cells: block.cells.map(([row, col]) => ({
      row,
      col,
      dots: createCrumbCellDots(dotsPerCell, direction),
    })),
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

// L 形這類凹形方塊的「短臂」可能還沒真正貼到邊界（見 exit.ts 的
// leadingCells／canExit 註解——只要求前緣至少一格頂到邊界，不強求每一格都
// 頂到）。離場時如果只把整塊平移 1 格，短臂那幾格會還壓在地板上，粉粒就會
// 在門內炸開，而不是門外（使用者反饋）。這裡逐格往 direction 方向投影，
// 找出「這一格自己也離開地板」需要的步數，取所有格子裡最大的那個值，保證
// 平移這麼多步之後，整塊沒有任何一格還壓在地板上。
function computeExitClearSteps(floorSet: Set<string>, cells: CellCoord[], direction: Direction): number {
  const [dr, dc] = DIRECTION_DELTA[direction];
  let maxSteps = 1;
  for (const [r, c] of cells) {
    let row = r;
    let col = c;
    let steps = 0;
    while (floorSet.has(cellKey(row, col))) {
      row += dr;
      col += dc;
      steps += 1;
    }
    maxSteps = Math.max(maxSteps, steps);
  }
  return maxSteps;
}

// 粉粒噴發的初始點要固定在「門」，不是跟著方塊一路滑出去噴（碎木機是東西
// 從門口進去、在門口原地噴出碎屑，不是邊走邊噴）。門格座標跟 exit.ts 的
// canExit() 判斷門的投影邏輯是同一套：沿 direction 方向projections
// 到剛好離開地板前的最後一格地板，就是這一路（column/row）對齊的門格。
// 用 Set 去重——同一路（同一 row 或 col）上如果方塊有不只一格（例如 L 形的
// 短臂跟長臂在同一路上），這些格子投影出來會落在同一個門格，只留一份。
function computeDoorAlignedCells(floorSet: Set<string>, cells: CellCoord[], direction: Direction): CellCoord[] {
  const [dr, dc] = DIRECTION_DELTA[direction];
  const seen = new Set<string>();
  const doorCells: CellCoord[] = [];
  for (const [r, c] of cells) {
    let row = r;
    let col = c;
    while (floorSet.has(cellKey(row, col))) {
      row += dr;
      col += dc;
    }
    row -= dr;
    col -= dc;
    const key = cellKey(row, col);
    if (!seen.has(key)) {
      seen.add(key);
      doorCells.push([row, col]);
    }
  }
  return doorCells;
}

// 粉粒的噴發錨點要落在「門外一點點」，不是門內側最後一格地板的正中心——
// 使用者反饋：門本身就該像碎木機的出口，粉屑一噴出來就已經在門外，不是從
// 門裡面噴出來。0.5 是從格子中心走到格子邊界（地板跟門交界處）的距離；
// 0.22 是門本身往外凸出的厚度比例（跟 Board.module.css 的
// .blockClipLayer／BOUNDARY_THICKNESS 同一個數字），加上去剛好落在門的外
// 緣——不再額外多推一截（原本+0.1），使用者反饋噴發點離門太遠，貼著門
// 外緣就好。
const DOOR_BURST_OFFSET_CELLS = 0.5 + 0.22;

// 把 computeDoorAlignedCells() 算出的門格座標，沿著 direction 方向再往外
// 推 DOOR_BURST_OFFSET_CELLS，得到粉粒真正的噴發錨點（cellCenterStyle()
// 本來就吃 calc() 表達式，小數座標直接可用，不需要另外對齊整數格）。
function offsetPastDoor(cells: CellCoord[], direction: Direction): CellCoord[] {
  const [dr, dc] = DIRECTION_DELTA[direction];
  return cells.map(([row, col]) => [row + dr * DOOR_BURST_OFFSET_CELLS, col + dc * DOOR_BURST_OFFSET_CELLS]);
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

// 離場中的方塊除了格子（滑到哪）還要記住這一次滑行總共花多久（slideMs），
// 每次離場滑行的格數可能不同（見 computeExitClearSteps()），沒辦法像
// CRUMB_FLY_MS 那樣全域共用一個常數值，要跟著方塊一起存。
interface ExitingBlock extends LevelBlock {
  slideMs: number;
}

export function Board({ level, onComplete, backLink }: BoardProps) {
  const [blocks, setBlocks] = useState<LevelBlock[]>(level.blocks);
  const [exitingBlocks, setExitingBlocks] = useState<ExitingBlock[]>([]);
  const [bursts, setBursts] = useState<CrumbBurst[]>([]);
  const [dragOffset, setDragOffset] = useState<DragOffset | null>(null);
  // 方塊是單一剪影（clip-path 沿格子邊界描出的多邊形，見 blockShape.ts），
  // clip-path 的 SVG path 只能吃字面數字，不能塞 var(--cell-size) 這種 calc
  // 表達式，所以要另外量出目前實際渲染的格距 px 值——量法跟既有的
  // measureCellPitch() 共用，只是這裡要在畫面尺寸改變時（RWD）持續重量，
  // 不是只在按下拖曳那一刻量一次。
  const [cellPitchPx, setCellPitchPx] = useState(0);
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

  // 方塊滑到同色門對齊的邊界時觸發的離場動畫：整塊持續往門外滑到完全離開
  // 地板才消失（見 computeExitClearSteps()），但粉粒噴發的位置固定釘在門外
  // 一點點（見 computeDoorAlignedCells()／offsetPastDoor()），不跟著方塊
  // 移動——做出「東西從門口塞進去、門就是碎木機的出口，粉屑一噴出來就已經
  // 在門外」的觀感，而不是方塊自己邊滑邊掉屑（使用者反饋）。滑幾步就噴幾
  // 波，只是每一波的落點都是同一批門外錨點。
  function exitBlock(block: LevelBlock, direction: Direction) {
    playSound("exit");
    setBlocks((prev) => prev.filter((b) => b.id !== block.id));

    const clearSteps = computeExitClearSteps(floorSet, block.cells, direction);
    const exitedCells = translateCells(block.cells, direction, clearSteps);
    const doorCells = offsetPastDoor(computeDoorAlignedCells(floorSet, block.cells, direction), direction);
    const slideMs = EXIT_STEP_MS * clearSteps;

    // 先掛進 exitingBlocks 時，格子維持「還沒平移」的原始位置（跟它在
    // blocks 裡消失前的最後位置完全一樣）——這一幀在畫面上跟前一幀無縫接
    // 上，不會有位置跳動。真正的滑出動畫要等下面用 setTimeout 把格子改成
    // exitedCells 才觸發：因為這是「同一個」exitingBlocks 陣列裡的同一個
    // 項目被更新（不是從 blocks 陣列搬到 exitingBlocks 陣列的全新掛載），
    // React 才會把它當成同一個 DOM 節點的屬性變化，CSS 的 transform
    // transition 才有「起點」可以真正播出滑動過程；如果一開始就直接掛
    // exitedCells，等於方塊在 exitingBlocks 裡是全新掛載，瀏覽器沒有
    // 「上一個位置」可以動畫，畫面上就會直接瞬間出現在終點，不管
    // --exit-slide-ms 設多長都看不到滑動（使用者反饋：500ms 了還是看不到
    // 移動過程，根源就是這個）。原本試過用兩層 requestAnimationFrame 做這
    // 個延遲，但 rAF 在分頁不在前景（例如背景分頁）時不保證會執行，實測
    // 發現這正是「調到 500ms 還是看不到滑動」的真正原因；改用 setTimeout
    // 不依賴分頁是否在前景，才能穩定觸發。
    setExitingBlocks((prev) => [...prev, { ...block, slideMs }]);
    const startSlideTimerId = setTimeout(() => {
      exitTimersRef.current.delete(startSlideTimerId);
      setExitingBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, cells: exitedCells } : b)));
    }, EXIT_SLIDE_START_DELAY_MS);
    exitTimersRef.current.add(startSlideTimerId);

    // 波次間隔用 CRUMB_WAVE_INTERVAL_MS（獨立於滑行速度，見該常數註解），
    // 在整段 slideMs 時間內盡量塞滿波次，才會是持續、高頻的噴發，不是滑一
    // 格才補一下。每一波都噴在同一批門格（doorCells）上，不是跟著方塊那一
    // 步的座標走——碎木機是持續從門口噴屑，不是邊移動邊掉屑。總粉粒數量在
    // 各波之間平分，維持大致固定的總密度，不會因為波次變多而變得過量。
    const waveCount = Math.max(clearSteps, Math.round(slideMs / CRUMB_WAVE_INTERVAL_MS));
    const dotsPerWave = Math.max(3, Math.round(CRUMB_DOTS_PER_CELL / waveCount));
    for (let wave = 1; wave <= waveCount; wave += 1) {
      const waveId = `${block.id}-exit-wave${wave}`;
      const spawnTimerId = setTimeout(() => {
        exitTimersRef.current.delete(spawnTimerId);
        const newBurst = createCrumbBurst({ id: waveId, color: block.color, cells: doorCells }, dotsPerWave, direction);
        setBursts((prev) => [...prev, newBurst]);
        const removeTimerId = setTimeout(() => {
          setBursts((prev) => prev.filter((b) => b.id !== waveId));
          exitTimersRef.current.delete(removeTimerId);
        }, CRUMB_FLY_MS + CRUMB_BURST_REMOVE_BUFFER_MS);
        exitTimersRef.current.add(removeTimerId);
      }, (wave - 1) * CRUMB_WAVE_INTERVAL_MS);
      exitTimersRef.current.add(spawnTimerId);
    }

    const wrapperTimerId = setTimeout(() => {
      setExitingBlocks((prev) => prev.filter((b) => b.id !== block.id));
      exitTimersRef.current.delete(wrapperTimerId);
    }, slideMs + EXIT_SLIDE_START_DELAY_MS);
    exitTimersRef.current.add(wrapperTimerId);
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
    options: { interactive: boolean; extraClassName?: string; popDelayMs?: number; slideMs?: number },
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
          <div className={styles.blockShapeGroup} style={{ "--block-color": COLOR_HEX[block.color] } as CSSProperties}>
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

          {/* 方塊本體（可拖曳中＋離場中）都關在這一層裡，讓 Board.module.css
              的 .blockClipLayer 用 clip-path 卡出門的範圍——超出這個範圍就
              整個看不見，是實際的空間邊界，不是猜時間淡出（見該 class 的
              註解）。門、牆、地板、粉粒都留在這層外面，才不會被一起裁掉。 */}
          <div className={styles.blockClipLayer}>
            {blocks.map((block, index) =>
              renderBlockWrapper(block, { interactive: true, popDelayMs: index * 60 }),
            )}
            {exitingBlocks.map((block) =>
              renderBlockWrapper(block, {
                interactive: false,
                extraClassName: styles.exiting,
                slideMs: block.slideMs,
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
