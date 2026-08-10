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

export const levels: Level[] = [sampleLevel, levelTwo, levelThree];
