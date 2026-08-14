import { useEffect, useRef, useState } from "react";
import type { CellCoord, LevelBlock } from "../../types/level";
import { DIRECTION_DELTA, translateCells, type Direction } from "../../game/slide";
import { playSound } from "../../audio/sound";

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
// 每格噴發的粉粒數量（多格方塊離場時分批噴發，見 startExit()
// 的 dotsPerWave 換算）。
const CRUMB_DOTS_PER_CELL = 56;
// 粉粒飛散距離／尺寸的倍率——1 是最初的手感，這裡刻意誇張放大，噴更遠、
// 顆粒更大才夠有份量。
const CRUMB_SPREAD_SCALE = 2.1;
// 離場方塊掛進 exitingBlocks 後，隔多久才把格子改成 exitedCells、觸發真正
// 的滑出 transition（見 startExit()）。夠短、人眼感覺不到延遲，
// 但夠讓瀏覽器先畫出一幀起點畫面，CSS transition 才有「起點」可以動畫。
const EXIT_SLIDE_START_DELAY_MS = 20;

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

// 粉粒的噴發錨點要落在「門外一點點」，不是門內側最後一格地板的正中心——
// 使用者反饋：門本身就該像碎木機的出口，粉屑一噴出來就已經在門外，不是從
// 門裡面噴出來。0.5 是從格子中心走到格子邊界（地板跟門交界處）的距離；
// 0.22 是門本身往外凸出的厚度比例（跟 Board.tsx 的 BOUNDARY_THICKNESS_RATIO
// 同一個數字），加上去剛好落在門的外緣。
const DOOR_BURST_OFFSET_CELLS = 0.5 + 0.22;

// 粉粒的幾何用原始數值表示（距離／角度／旋轉／尺寸），不是格式化好的 CSS
// 字串——字串化（toFixed、加單位）留給呼叫端的 render 層做，這個 hook 只
// 負責「離場動畫的幾何結果」這份資料，也讓測試可以直接對數值範圍做斷言，
// 不用剝開字串。
export interface CrumbDot {
  distancePx: number;
  angleRad: number;
  rotationDeg: number;
  sizePx: number;
}

export interface CrumbCellBurst {
  row: number;
  col: number;
  dots: CrumbDot[];
}

export interface CrumbBurst {
  id: string;
  color: string;
  // 整個方塊（可能多格）的幾何中心，拿來放「炸開的閃光/衝擊波」——跟下面
  // 逐格噴發的粉粒是不同層次的效果，中心用平均值即可，不需要對齊到整數格。
  center: { row: number; col: number };
  cells: CrumbCellBurst[];
}

// 離場中的方塊除了格子（滑到哪）還要記住這一次滑行總共花多久（slideMs），
// 每次離場滑行的格數可能不同（見 computeExitClearSteps()），沒辦法像
// CRUMB_FLY_MS 那樣全域共用一個常數值，要跟著方塊一起存。
export interface ExitingBlock extends LevelBlock {
  slideMs: number;
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
// canExit() 判斷門的投影邏輯是同一套：沿 direction 方向投影到剛好離開地板
// 前的最後一格地板，就是這一路（column/row）對齊的門格。用 Set 去重——
// 同一路（同一 row 或 col）上如果方塊有不只一格（例如 L 形的短臂跟長臂在
// 同一路上），這些格子投影出來會落在同一個門格，只留一份。
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

// 把 computeDoorAlignedCells() 算出的門格座標，沿著 direction 方向再往外
// 推 DOOR_BURST_OFFSET_CELLS，得到粉粒真正的噴發錨點。
function offsetPastDoor(cells: CellCoord[], direction: Direction): CellCoord[] {
  const [dr, dc] = DIRECTION_DELTA[direction];
  return cells.map(([row, col]) => [row + dr * DOOR_BURST_OFFSET_CELLS, col + dc * DOOR_BURST_OFFSET_CELLS]);
}

// 一格炸開的粉粒角度在「出門方向」為中心的扇形內平均分佈、再加隨機抖動，
// 距離/大小也各自帶一點隨機——避免看起來像複製貼上的規律圖案，而是碎屑
// 四散的手感。距離/尺寸都刻意誇張一點（超出格子本身範圍不少），效果才會
// 夠明顯，不會一閃即逝看不清楚。
function createCrumbCellDots(dotsPerCell: number, direction: Direction): CrumbDot[] {
  const baseAngle = EXIT_DIRECTION_ANGLE_RAD[direction];
  const denom = Math.max(dotsPerCell - 1, 1);
  // size 的倍率刻意比 distance 溫和，不然 CRUMB_SPREAD_SCALE 拉到 2 倍時
  // 顆粒會腫成一坨看不出碎屑感，噴更遠但顆粒不用等比例變大。
  const sizeScale = 1 + (CRUMB_SPREAD_SCALE - 1) * 0.5;
  return Array.from({ length: dotsPerCell }, (_, i) => {
    const spread = (i / denom - 0.5) * CRUMB_SPRAY_CONE_RAD;
    const jitter = (Math.random() - 0.5) * ((20 * Math.PI) / 180);
    return {
      distancePx: (26 + Math.random() * 32) * CRUMB_SPREAD_SCALE,
      angleRad: baseAngle + spread + jitter,
      rotationDeg: Math.floor(Math.random() * 360) - 180,
      sizePx: (5 + Math.random() * 5) * sizeScale,
    };
  });
}

// 每個離場方塊自己的格子都各自炸開一圈粉粒（不是整個方塊共用一個爆點），
// 多格方塊看起來才會像「整塊碎開」而不是從單一個點噴出來；所有格子共用
// 同一個出門方向，噴發扇形才會一致朝門外散開。
function createCrumbBurst(id: string, color: string, cells: CellCoord[], dotsPerCell: number, direction: Direction): CrumbBurst {
  const rows = cells.map(([row]) => row);
  const cols = cells.map(([, col]) => col);
  return {
    id,
    color,
    center: {
      row: rows.reduce((sum, row) => sum + row, 0) / rows.length,
      col: cols.reduce((sum, col) => sum + col, 0) / cols.length,
    },
    cells: cells.map(([row, col]) => ({
      row,
      col,
      dots: createCrumbCellDots(dotsPerCell, direction),
    })),
  };
}

// 把「方塊離場」這整件事收在一個 interface 底下：移除方塊、播 exit 音效、
// 滑出動畫、粉粒噴發的排程與清理，呼叫端只需要呼叫 startExit() 一次，
// 不用記得同時做好幾件各自獨立的事。
//
// floorSet／removeBlock 是跨多次 startExit() 呼叫都穩定的協作者（同一個
// Board 生命週期內不太會變，除非換關卡），用 ref 存最新值，讓呼叫端每次
// render 傳新的參照進來也不會有問題，同時不會被當成 effect 依賴。
export function useExitAnimation(floorSet: Set<string>, removeBlock: (blockId: string) => void) {
  const [exitingBlocks, setExitingBlocks] = useState<ExitingBlock[]>([]);
  const [bursts, setBursts] = useState<CrumbBurst[]>([]);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const floorSetRef = useRef(floorSet);
  floorSetRef.current = floorSet;
  const removeBlockRef = useRef(removeBlock);
  removeBlockRef.current = removeBlock;

  function clearTimers() {
    timersRef.current.forEach((timerId) => clearTimeout(timerId));
    timersRef.current.clear();
  }

  useEffect(() => clearTimers, []);

  // 方塊滑到同色門對齊的邊界時觸發的離場動畫：整塊持續往門外滑到完全離開
  // 地板才消失（見 computeExitClearSteps()），但粉粒噴發的位置固定釘在門外
  // 一點點（見 computeDoorAlignedCells()／offsetPastDoor()），不跟著方塊
  // 移動——做出「東西從門口塞進去、門就是碎木機的出口，粉屑一噴出來就已經
  // 在門外」的觀感，而不是方塊自己邊滑邊掉屑（使用者反饋）。滑幾步就噴幾
  // 波，只是每一波的落點都是同一批門外錨點。
  function startExit(block: LevelBlock, direction: Direction, color: string) {
    playSound("exit");
    removeBlockRef.current(block.id);

    const floorSetNow = floorSetRef.current;
    const clearSteps = computeExitClearSteps(floorSetNow, block.cells, direction);
    const exitedCells = translateCells(block.cells, direction, clearSteps);
    const doorCells = offsetPastDoor(computeDoorAlignedCells(floorSetNow, block.cells, direction), direction);
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
      timersRef.current.delete(startSlideTimerId);
      setExitingBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, cells: exitedCells } : b)));
    }, EXIT_SLIDE_START_DELAY_MS);
    timersRef.current.add(startSlideTimerId);

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
        timersRef.current.delete(spawnTimerId);
        const newBurst = createCrumbBurst(waveId, color, doorCells, dotsPerWave, direction);
        setBursts((prev) => [...prev, newBurst]);
        const removeTimerId = setTimeout(() => {
          setBursts((prev) => prev.filter((b) => b.id !== waveId));
          timersRef.current.delete(removeTimerId);
        }, CRUMB_FLY_MS + CRUMB_BURST_REMOVE_BUFFER_MS);
        timersRef.current.add(removeTimerId);
      }, (wave - 1) * CRUMB_WAVE_INTERVAL_MS);
      timersRef.current.add(spawnTimerId);
    }

    const wrapperTimerId = setTimeout(() => {
      setExitingBlocks((prev) => prev.filter((b) => b.id !== block.id));
      timersRef.current.delete(wrapperTimerId);
    }, slideMs + EXIT_SLIDE_START_DELAY_MS);
    timersRef.current.add(wrapperTimerId);
  }

  function reset() {
    clearTimers();
    setExitingBlocks([]);
    setBursts([]);
  }

  return { exitingBlocks, bursts, startExit, reset };
}
