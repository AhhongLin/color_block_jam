import type { Level } from "../types/level";

// 依 level_pic/level_1.png 手繪關卡圖還原的第 1 關：5x6 規則矩形盤面。
// 解法：藍色直接上滑出場 → 紅色（原本被藍色堵住）左滑出場 → 黃色先右移
// 一格對齊右下門柱、再下滑出場。
export const sampleLevel: Level = {
  id: "01",
  name: "第 1 關",
  cells: [
    [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
    [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4],
  ],
  doors: [
    { row: 0, col: 0, side: "top", color: "blue" },
    { row: 0, col: 1, side: "top", color: "blue" },
    { row: 2, col: 0, side: "left", color: "red" },
    { row: 3, col: 0, side: "left", color: "red" },
    { row: 2, col: 4, side: "right", color: "red" },
    { row: 3, col: 4, side: "right", color: "red" },
    { row: 5, col: 3, side: "bottom", color: "yellow" },
    { row: 5, col: 4, side: "bottom", color: "yellow" },
  ],
  blocks: [
    { id: "b1", color: "blue", cells: [[1, 0], [1, 1], [2, 0], [3, 0]] },
    { id: "b2", color: "red", cells: [[2, 2], [3, 2]] },
    { id: "b3", color: "yellow", cells: [[2, 3], [3, 3], [4, 2], [4, 3]] },
  ],
};

// 依 level_pic/level_2.png 手繪關卡圖還原的第 2 關：5x6 規則矩形盤面。
// 解法：橘色左滑出場 → 紅色右滑出場（兩者互不相依，先後皆可）→ 藍色（原本
// 被橘紅兩色堵在中間直行）下滑到底出場 → 綠色（左側）先上移兩格、再右移
// 三格與右上綠色門對齊出場 → 紫紅色（右側）上移兩格、再左移三格與左上
// 紫紅色門對齊出場——綠色跟紫紅色的門在盤面對角，兩者需要互換位置才能
// 各自出場。
export const levelTwo: Level = {
  id: "02",
  name: "第 2 關",
  cells: [
    [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
    [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4],
  ],
  doors: [
    { row: 0, col: 0, side: "top", color: "pink" },
    { row: 0, col: 1, side: "top", color: "pink" },
    { row: 0, col: 3, side: "top", color: "green" },
    { row: 0, col: 4, side: "top", color: "green" },
    { row: 4, col: 0, side: "left", color: "orange" },
    { row: 5, col: 0, side: "left", color: "orange" },
    { row: 4, col: 4, side: "right", color: "red" },
    { row: 5, col: 4, side: "right", color: "red" },
    { row: 5, col: 1, side: "bottom", color: "blue" },
    { row: 5, col: 2, side: "bottom", color: "blue" },
    { row: 5, col: 3, side: "bottom", color: "blue" },
  ],
  blocks: [
    { id: "b1", color: "blue", cells: [[0, 2], [1, 2], [2, 2]] },
    { id: "b2", color: "green", cells: [[2, 0], [2, 1], [3, 0], [3, 1]] },
    { id: "b3", color: "pink", cells: [[2, 3], [2, 4], [3, 3], [3, 4]] },
    { id: "b4", color: "orange", cells: [[4, 1], [4, 2], [4, 3]] },
    { id: "b5", color: "red", cells: [[5, 1], [5, 2], [5, 3]] },
  ],
};

// 依 level_pic/level_3.png 手繪關卡圖還原的第 3 關：6x6 規則矩形盤面。
export const levelThree: Level = {
  id: "03",
  name: "第 3 關",
  cells: [
    [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
    [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5],
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5],
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5],
  ],
  doors: [
    { row: 0, col: 0, side: "top", color: "purple" },
    { row: 0, col: 1, side: "top", color: "purple" },
    { row: 0, col: 2, side: "top", color: "purple" },
    { row: 0, col: 3, side: "top", color: "red" },
    { row: 0, col: 4, side: "top", color: "red" },
    { row: 0, col: 5, side: "top", color: "red" },
    { row: 2, col: 0, side: "left", color: "darkgreen" },
    { row: 3, col: 0, side: "left", color: "darkgreen" },
    { row: 2, col: 5, side: "right", color: "green" },
    { row: 3, col: 5, side: "right", color: "green" },
    { row: 5, col: 0, side: "bottom", color: "blue" },
    { row: 5, col: 1, side: "bottom", color: "blue" },
    { row: 5, col: 3, side: "bottom", color: "yellow" },
    { row: 5, col: 4, side: "bottom", color: "yellow" },
    { row: 5, col: 5, side: "bottom", color: "yellow" },
  ],
  blocks: [
    { id: "b1", color: "red", cells: [[1, 0], [1, 1], [1, 2]] },
    { id: "b2", color: "purple", cells: [[1, 3], [1, 4], [1, 5]] },
    { id: "b3", color: "yellow", cells: [[2, 0], [3, 0]] },
    { id: "b4", color: "green", cells: [[2, 2], [2, 3], [2, 4]] },
    { id: "b5", color: "blue", cells: [[2, 5], [3, 5]] },
    { id: "b6", color: "darkgreen", cells: [[3, 1], [3, 2], [3, 3]] },
    { id: "b7", color: "blue", cells: [[4, 1], [5, 1], [5, 2]] },
    { id: "b8", color: "yellow", cells: [[4, 3], [4, 4], [5, 4]] },
  ],
};

// 第 4 關：6x6 規則矩形盤面，首次出現 L 形方塊（紅色）。
// 解法：四個方塊互不相依，各自一步到位——紅色左滑出場、藍色上滑出場、
// 綠色下滑兩格出場、黃色右滑出場，任意順序皆可。
export const levelFour: Level = {
  id: "04",
  name: "第 4 關",
  cells: [
    [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
    [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5],
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5],
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5],
  ],
  doors: [
    { row: 1, col: 0, side: "left", color: "red" },
    { row: 2, col: 0, side: "left", color: "red" },
    { row: 0, col: 4, side: "top", color: "blue" },
    { row: 5, col: 1, side: "bottom", color: "green" },
    { row: 5, col: 2, side: "bottom", color: "green" },
    { row: 4, col: 5, side: "right", color: "yellow" },
    { row: 5, col: 5, side: "right", color: "yellow" },
  ],
  blocks: [
    { id: "b1", color: "red", cells: [[1, 1], [1, 2], [2, 1]] },
    { id: "b2", color: "blue", cells: [[1, 4], [2, 4], [3, 4]] },
    { id: "b3", color: "green", cells: [[3, 1], [3, 2]] },
    { id: "b4", color: "yellow", cells: [[4, 3], [4, 4], [5, 3], [5, 4]] },
  ],
};

// 第 5 關：首次出現不規則盤面——右上角挖掉 2x2，盤面呈 L 形。
// 解法：黃色（原本堵在紫色 L 形方塊的必經之路上）先下滑出場，讓出紫色
// 往左的通道；紫色再左滑三格出場；橘色、深綠色互不相依，各自一步出場。
export const levelFive: Level = {
  id: "05",
  name: "第 5 關",
  cells: [
    [0, 0], [0, 1], [0, 2], [0, 3],
    [1, 0], [1, 1], [1, 2], [1, 3],
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5],
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5],
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5],
  ],
  doors: [
    { row: 2, col: 0, side: "left", color: "purple" },
    { row: 3, col: 0, side: "left", color: "purple" },
    { row: 0, col: 1, side: "top", color: "orange" },
    { row: 0, col: 2, side: "top", color: "orange" },
    { row: 4, col: 5, side: "right", color: "darkgreen" },
    { row: 5, col: 5, side: "right", color: "darkgreen" },
    { row: 5, col: 1, side: "bottom", color: "yellow" },
    { row: 5, col: 2, side: "bottom", color: "yellow" },
  ],
  blocks: [
    { id: "b1", color: "purple", cells: [[2, 3], [2, 4], [3, 3]] },
    { id: "b2", color: "orange", cells: [[1, 1], [1, 2]] },
    { id: "b3", color: "darkgreen", cells: [[4, 4], [5, 4]] },
    { id: "b4", color: "yellow", cells: [[3, 1], [3, 2], [4, 1], [4, 2]] },
  ],
};

// 第 6 關：7x6 盤面、右上角挖掉 2x2，方塊數量提高到 5 個，首次出現 T 形
// 方塊。兩組相依關係：紫色（堵住紅色 T 形方塊往上的通道）要先左滑出場，
// 紅色才能上滑兩格出場；橘色（堵住藍色 L 形方塊的目的地）要先下滑兩格
// 出場，藍色才能右滑一格出場。綠色不受影響，隨時可下滑出場。
export const levelSix: Level = {
  id: "06",
  name: "第 6 關",
  cells: [
    [0, 0], [0, 1], [0, 2], [0, 3],
    [1, 0], [1, 1], [1, 2], [1, 3],
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5],
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5],
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5],
    [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  ],
  doors: [
    { row: 0, col: 1, side: "top", color: "red" },
    { row: 0, col: 2, side: "top", color: "red" },
    { row: 0, col: 3, side: "top", color: "red" },
    { row: 3, col: 5, side: "right", color: "blue" },
    { row: 4, col: 5, side: "right", color: "blue" },
    { row: 6, col: 1, side: "bottom", color: "green" },
    { row: 6, col: 2, side: "bottom", color: "green" },
    { row: 1, col: 0, side: "left", color: "purple" },
    { row: 6, col: 5, side: "bottom", color: "orange" },
  ],
  blocks: [
    { id: "b1", color: "red", cells: [[2, 1], [2, 2], [2, 3], [3, 2]] },
    { id: "b2", color: "blue", cells: [[3, 3], [3, 4], [4, 4]] },
    { id: "b3", color: "green", cells: [[4, 1], [4, 2], [5, 1], [5, 2]] },
    { id: "b4", color: "purple", cells: [[1, 1], [1, 2], [1, 3]] },
    { id: "b5", color: "orange", cells: [[3, 5], [4, 5]] },
  ],
};

// 第 7 關：7x7 盤面、右上角挖掉 2x2，方塊數量提高到 6 個。兩組相依關係：
// 粉紅色（堵住黃色直向方塊的目的地）要先上滑出場（利用缺角形成的內側
// 邊界，貼齊粉紅色門），黃色才能右滑兩格出場；紫色（堵住綠色方塊的目的
// 地）要先右滑出場，綠色才能下滑出場。紅色 T 形方塊、藍色 L 形方塊不受
// 影響，可隨時出場。
export const levelSeven: Level = {
  id: "07",
  name: "第 7 關",
  cells: [
    [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
    [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6],
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6],
    [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6],
  ],
  doors: [
    { row: 0, col: 1, side: "top", color: "red" },
    { row: 0, col: 2, side: "top", color: "red" },
    { row: 0, col: 3, side: "top", color: "red" },
    { row: 3, col: 0, side: "left", color: "blue" },
    { row: 4, col: 0, side: "left", color: "blue" },
    { row: 6, col: 2, side: "bottom", color: "green" },
    { row: 6, col: 3, side: "bottom", color: "green" },
    { row: 2, col: 6, side: "right", color: "yellow" },
    { row: 3, col: 6, side: "right", color: "yellow" },
    { row: 4, col: 6, side: "right", color: "yellow" },
    { row: 6, col: 6, side: "right", color: "purple" },
    { row: 2, col: 6, side: "top", color: "pink" },
  ],
  blocks: [
    { id: "b1", color: "red", cells: [[1, 1], [1, 2], [1, 3], [2, 2]] },
    { id: "b2", color: "blue", cells: [[3, 1], [3, 2], [4, 1]] },
    { id: "b3", color: "green", cells: [[4, 2], [4, 3], [5, 2], [5, 3]] },
    { id: "b4", color: "yellow", cells: [[2, 4], [3, 4], [4, 4]] },
    { id: "b5", color: "purple", cells: [[6, 3], [6, 4], [6, 5]] },
    { id: "b6", color: "pink", cells: [[3, 6], [4, 6]] },
  ],
};

// 第 8 關：7x7 盤面、右上角挖掉 2x2、正中偏右再挖一個單格坑洞（(5,5)），
// 盤面複雜度最高。紅色是本作第一個需要「兩段式」操作的方塊：先右滑一格
// （被藍色暫時擋住，純粹調整對齊位置，不出場)，再下滑到底——下滑時形狀
// 缺角的那一短臂（原本在上排）雖然本身碰不到底部邊界，仍要把它沿下滑方向
// 投影到它自己對齊的那條邊界線（col3, row6）上比對同色門，所以底部除了長臂
// 對齊的 (6,2) 有紅色門，短臂投影對齊的 (6,3) 也要有紅色門，方塊才整個出場。
// 另有一組相依關係：黃色（暫時佔住藍色的目的地）要先上滑出場（利用缺角
// 邊界），藍色才能右滑兩格出場。綠色、紫色、橘色不受影響，可隨時出場。
export const levelEight: Level = {
  id: "08",
  name: "第 8 關",
  cells: [
    [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
    [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6],
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 6],
    [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6],
  ],
  doors: [
    { row: 6, col: 2, side: "bottom", color: "red" },
    { row: 6, col: 3, side: "bottom", color: "red" },
    { row: 2, col: 6, side: "right", color: "blue" },
    { row: 3, col: 6, side: "right", color: "blue" },
    { row: 6, col: 0, side: "bottom", color: "green" },
    { row: 6, col: 1, side: "bottom", color: "green" },
    { row: 2, col: 5, side: "top", color: "yellow" },
    { row: 0, col: 0, side: "left", color: "purple" },
    { row: 6, col: 6, side: "right", color: "orange" },
  ],
  blocks: [
    { id: "b1", color: "red", cells: [[2, 1], [2, 2], [3, 1]] },
    { id: "b2", color: "blue", cells: [[2, 4], [3, 4]] },
    { id: "b3", color: "green", cells: [[4, 0], [4, 1], [5, 0], [5, 1]] },
    { id: "b4", color: "yellow", cells: [[3, 5], [4, 5]] },
    { id: "b5", color: "purple", cells: [[0, 1], [0, 2], [0, 3]] },
    { id: "b6", color: "orange", cells: [[6, 4], [6, 5]] },
  ],
};

export const levels: Level[] = [
  sampleLevel,
  levelTwo,
  levelThree,
  levelFour,
  levelFive,
  levelSix,
  levelSeven,
  levelEight,
];
