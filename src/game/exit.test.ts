import { describe, expect, it } from "vitest";
import { canExit, findExitDirection, isLevelComplete } from "./exit";
import type { CellCoord, Door } from "../types/level";

// 3x3 開放盤面，方便手算邊界位置。
const OPEN_3X3: CellCoord[] = [
  [0, 0], [0, 1], [0, 2],
  [1, 0], [1, 1], [1, 2],
  [2, 0], [2, 1], [2, 2],
];

describe("canExit", () => {
  it("單格方塊前緣對齊同色門時可以離場", () => {
    const doors: Door[] = [{ row: 1, col: 2, side: "right", color: "red" }];
    const block = { color: "red" as const, cells: [[1, 2]] as CellCoord[] };
    expect(canExit(OPEN_3X3, doors, block, "right")).toBe(true);
  });

  it("對齊的門顏色不符時不可離場（視同撞牆）", () => {
    const doors: Door[] = [{ row: 1, col: 2, side: "right", color: "red" }];
    const block = { color: "blue" as const, cells: [[1, 2]] as CellCoord[] };
    expect(canExit(OPEN_3X3, doors, block, "right")).toBe(false);
  });

  it("在盤面邊界但該格沒有門時不可離場", () => {
    const doors: Door[] = [{ row: 0, col: 2, side: "right", color: "red" }];
    const block = { color: "red" as const, cells: [[1, 2]] as CellCoord[] }; // row1 沒有門
    expect(canExit(OPEN_3X3, doors, block, "right")).toBe(false);
  });

  it("門存在但方向（side）不符時不可離場", () => {
    const doors: Door[] = [{ row: 1, col: 2, side: "bottom", color: "red" }];
    const block = { color: "red" as const, cells: [[1, 2]] as CellCoord[] };
    expect(canExit(OPEN_3X3, doors, block, "right")).toBe(false);
  });

  it("方塊前緣還沒到盤面邊界時不可離場（即使該格本身有門）", () => {
    const doors: Door[] = [{ row: 1, col: 2, side: "right", color: "red" }];
    const block = { color: "red" as const, cells: [[1, 1]] as CellCoord[] }; // 還沒滑到 col2
    expect(canExit(OPEN_3X3, doors, block, "right")).toBe(false);
  });

  it("多格方塊部分前緣沒對齊同色門時，整個方塊都不可離場", () => {
    // 2 格垂直方塊佔滿 col2 的兩列，只有 row0 那一格有門。
    const doors: Door[] = [{ row: 0, col: 2, side: "right", color: "red" }];
    const block = { color: "red" as const, cells: [[0, 2], [1, 2]] as CellCoord[] };
    expect(canExit(OPEN_3X3, doors, block, "right")).toBe(false);
  });

  it("多格方塊每個前緣格都對齊同色門時可以離場", () => {
    const doors: Door[] = [
      { row: 0, col: 2, side: "right", color: "red" },
      { row: 1, col: 2, side: "right", color: "red" },
    ];
    const block = { color: "red" as const, cells: [[0, 2], [1, 2]] as CellCoord[] };
    expect(canExit(OPEN_3X3, doors, block, "right")).toBe(true);
  });

  it("同一種顏色在盤面上有多個門時，方塊靠任一個同色門都能離場", () => {
    const doors: Door[] = [
      { row: 0, col: 0, side: "left", color: "red" },
      { row: 2, col: 2, side: "right", color: "red" },
    ];
    const leftBlock = { color: "red" as const, cells: [[0, 0]] as CellCoord[] };
    const rightBlock = { color: "red" as const, cells: [[2, 2]] as CellCoord[] };
    expect(canExit(OPEN_3X3, doors, leftBlock, "left")).toBe(true);
    expect(canExit(OPEN_3X3, doors, rightBlock, "right")).toBe(true);
  });

  it("L 形方塊：每個形狀前緣格（依方向定義，不只一格）都要各自對齊同色門", () => {
    // 不規則盤面：row0 只到 col1，row1 到 col2，形成 L 形凹角。
    const lShapedBoard: CellCoord[] = [
      [0, 0], [0, 1],
      [1, 0], [1, 1], [1, 2],
    ];
    const doors: Door[] = [
      { row: 0, col: 1, side: "right", color: "green" },
      { row: 1, col: 2, side: "right", color: "green" },
    ];
    // 方塊本身形狀貼齊這個 L 形凹角的邊界：(0,1) 與 (1,1),(1,2)。
    const block = { color: "green" as const, cells: [[0, 1], [1, 1], [1, 2]] as CellCoord[] };
    expect(canExit(lShapedBoard, doors, block, "right")).toBe(true);

    // 拿掉其中一個門，L 形的另一個前緣格就對不齊了，整個方塊不能離場。
    const partialDoors: Door[] = [{ row: 1, col: 2, side: "right", color: "green" }];
    expect(canExit(lShapedBoard, partialDoors, block, "right")).toBe(false);
  });

  it("凹形方塊（形狀本身較短的那一格）只在長臂那格開門時不可離場——短臂也要在它自己投影對齊的邊界上有門", () => {
    // L 形方塊：(1,0)(1,1) 這一排，加上 (2,1) 多凸出去一格——(1,0) 這一列
    // 因為形狀本身較短，往下永遠會停在 (2,0) 這格空地板前面，不代表方塊還
    // 沒滑到底，但依然要把它投影到 (2,0)（它自己這條線的邊界）比對同色門；
    // 這裡只在長臂 (2,1) 開了門，短臂那條線沒有門，整個方塊仍不可離場。
    const doors: Door[] = [{ row: 2, col: 1, side: "bottom", color: "red" }];
    const block = { color: "red" as const, cells: [[1, 0], [1, 1], [2, 1]] as CellCoord[] };
    expect(canExit(OPEN_3X3, doors, block, "down")).toBe(false);
  });

  it("凹形方塊的短臂投影到的邊界也開了同色門時，整個方塊可以離場", () => {
    const doors: Door[] = [
      { row: 2, col: 1, side: "bottom", color: "red" },
      { row: 2, col: 0, side: "bottom", color: "red" },
    ];
    const block = { color: "red" as const, cells: [[1, 0], [1, 1], [2, 1]] as CellCoord[] };
    expect(canExit(OPEN_3X3, doors, block, "down")).toBe(true);
  });

  it("凹形方塊短臂投影路徑上被其他方塊佔住時，視同撞到東西，不可離場", () => {
    const doors: Door[] = [
      { row: 2, col: 1, side: "bottom", color: "red" },
      { row: 2, col: 0, side: "bottom", color: "red" },
    ];
    const block = { color: "red" as const, cells: [[1, 0], [1, 1], [2, 1]] as CellCoord[] };
    const otherBlocksCells: CellCoord[] = [[2, 0]];
    expect(canExit(OPEN_3X3, doors, block, "down", otherBlocksCells)).toBe(false);
  });

  it("往左、往上、往下離場時，門的方向與位置也要正確判定", () => {
    const doors: Door[] = [
      { row: 1, col: 0, side: "left", color: "blue" },
      { row: 0, col: 1, side: "top", color: "blue" },
      { row: 2, col: 1, side: "bottom", color: "blue" },
    ];
    expect(canExit(OPEN_3X3, doors, { color: "blue" as const, cells: [[1, 0]] }, "left")).toBe(true);
    expect(canExit(OPEN_3X3, doors, { color: "blue" as const, cells: [[0, 1]] }, "up")).toBe(true);
    expect(canExit(OPEN_3X3, doors, { color: "blue" as const, cells: [[2, 1]] }, "down")).toBe(true);
  });
});

describe("findExitDirection", () => {
  it("方塊貼齊的同色門邊，跟剛剛的移動方向不同也能離場", () => {
    // 門在右側，但方塊是被「往下滑」帶到這個位置的——判定不該管移動方向，
    // 只看方塊目前的位置有沒有貼齊同色門。
    const doors: Door[] = [{ row: 1, col: 2, side: "right", color: "red" }];
    const block = { color: "red" as const, cells: [[1, 2]] as CellCoord[] };
    expect(findExitDirection(OPEN_3X3, doors, block)).toBe("right");
  });

  it("方塊沒有貼齊任何同色門時回傳 null", () => {
    const doors: Door[] = [{ row: 1, col: 2, side: "right", color: "red" }];
    const block = { color: "red" as const, cells: [[1, 1]] as CellCoord[] };
    expect(findExitDirection(OPEN_3X3, doors, block)).toBeNull();
  });

  it("方塊同時貼齊多個方向的同色門時，回傳其中一個可離場的方向", () => {
    const doors: Door[] = [
      { row: 0, col: 0, side: "top", color: "blue" },
      { row: 0, col: 0, side: "left", color: "blue" },
    ];
    const block = { color: "blue" as const, cells: [[0, 0]] as CellCoord[] };
    expect(["up", "left"]).toContain(findExitDirection(OPEN_3X3, doors, block));
  });

  it("otherBlocksCells 會傳遞給 canExit，擋住凹形方塊短臂投影路徑上的格子", () => {
    const doors: Door[] = [
      { row: 2, col: 1, side: "bottom", color: "red" },
      { row: 2, col: 0, side: "bottom", color: "red" },
    ];
    const block = { color: "red" as const, cells: [[1, 0], [1, 1], [2, 1]] as CellCoord[] };
    expect(findExitDirection(OPEN_3X3, doors, block)).toBe("down");
    expect(findExitDirection(OPEN_3X3, doors, block, [[2, 0]])).toBeNull();
  });
});

describe("isLevelComplete", () => {
  it("盤面上還有方塊時尚未過關", () => {
    expect(isLevelComplete([{ id: "a" }])).toBe(false);
  });

  it("盤面上所有方塊都離場（陣列為空）時判定過關", () => {
    expect(isLevelComplete([])).toBe(true);
  });
});
