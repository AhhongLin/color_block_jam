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

export const levels: Level[] = [sampleLevel];
