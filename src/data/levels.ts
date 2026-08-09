import type { Level } from "../types/level";

// Placeholder content — same irregular board layout validated in the
// visual-style prototype (throwaway branch `prototype/visual-style`).
// Ticket 11 replaces this with the real 8-level set.
export const sampleLevel: Level = {
  id: "01",
  name: "第 1 關",
  cells: [
    [0, 0], [0, 1], [0, 2], [0, 3],
    [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
    [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
    [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6],
    [4, 2], [4, 3], [4, 4], [4, 5], [4, 6],
    [5, 3], [5, 4], [5, 5], [5, 6],
  ],
  doors: [
    { row: 1, col: 0, side: "left", color: "red" },
    { row: 0, col: 1, side: "top", color: "blue" },
    { row: 2, col: 6, side: "right", color: "green" },
    { row: 5, col: 6, side: "bottom", color: "yellow" },
  ],
  blocks: [
    { id: "b1", color: "red", cells: [[2, 2]] },
    { id: "b2", color: "blue", cells: [[0, 1], [1, 1]] },
    { id: "b3", color: "green", cells: [[3, 3], [3, 4], [4, 3]] },
    { id: "b4", color: "yellow", cells: [[1, 3], [1, 4], [1, 5]] },
  ],
};

export const levels: Level[] = [sampleLevel];
