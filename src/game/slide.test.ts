import { describe, expect, it } from "vitest";
import { maxSlideSteps, slideBlock, translateCells } from "./slide";
import type { CellCoord } from "../types/level";

// 3x3 開放盤面，[0,0]~[2,2]，方便手算撞牆位置。
const OPEN_3X3: CellCoord[] = [
  [0, 0], [0, 1], [0, 2],
  [1, 0], [1, 1], [1, 2],
  [2, 0], [2, 1], [2, 2],
];

describe("slideBlock", () => {
  it("單格方塊往右滑到底，停在盤面邊界前", () => {
    const blocks = [{ id: "a", cells: [[1, 0]] as CellCoord[] }];
    const result = slideBlock(OPEN_3X3, blocks, "a", "right");
    expect(result).toEqual([[1, 2]]);
  });

  it("單格方塊已貼著邊界時，往該方向滑動不移動", () => {
    const blocks = [{ id: "a", cells: [[1, 2]] as CellCoord[] }];
    const result = slideBlock(OPEN_3X3, blocks, "a", "right");
    expect(result).toEqual([[1, 2]]);
  });

  it("單格方塊撞到另一個方塊時，停在緊鄰前一格，不推動對方", () => {
    const blocks = [
      { id: "a", cells: [[1, 0]] as CellCoord[] },
      { id: "b", cells: [[1, 2]] as CellCoord[] },
    ];
    const result = slideBlock(OPEN_3X3, blocks, "a", "right");
    expect(result).toEqual([[1, 1]]);
    // 對方沒有被推動
    expect(blocks[1].cells).toEqual([[1, 2]]);
  });

  it("多格方塊（2x1 直向）整體往下滑到底", () => {
    const blocks = [{ id: "a", cells: [[0, 0], [1, 0]] as CellCoord[] }];
    const result = slideBlock(OPEN_3X3, blocks, "a", "down");
    expect(result).toEqual([[1, 0], [2, 0]]);
  });

  it("多格方塊碰撞判定：只要其中一格被擋住，整體都不前進", () => {
    // b 擋在 [2,1]，a 是水平 2x1 在 row 0 往下滑，理論上會被 row2 的 b 擋住
    const blocks = [
      { id: "a", cells: [[0, 0], [0, 1]] as CellCoord[] },
      { id: "b", cells: [[2, 1]] as CellCoord[] },
    ];
    const result = slideBlock(OPEN_3X3, blocks, "a", "down");
    // a 可以先滑到 row1（[1,0],[1,1]），再往下一步 [2,0],[2,1] 因 [2,1] 被佔用而不可行
    expect(result).toEqual([[1, 0], [1, 1]]);
  });

  it("L 形方塊往左滑到底，停在盤面邊界前", () => {
    // L 形： (0,1) (1,1) (1,2)
    const blocks = [{ id: "a", cells: [[0, 1], [1, 1], [1, 2]] as CellCoord[] }];
    const result = slideBlock(OPEN_3X3, blocks, "a", "left");
    expect(result).toEqual([[0, 0], [1, 0], [1, 1]]);
  });

  it("L 形方塊被另一方塊擋住其中一支腳，整體停在上一步", () => {
    // L 形： (0,1) (1,1) (1,2)，往左滑；b 佔用 (0,0) 擋住 L 的上緣那一格
    const blocks = [
      { id: "a", cells: [[0, 1], [1, 1], [1, 2]] as CellCoord[] },
      { id: "b", cells: [[0, 0]] as CellCoord[] },
    ];
    const result = slideBlock(OPEN_3X3, blocks, "a", "left");
    expect(result).toEqual([[0, 1], [1, 1], [1, 2]]);
  });

  it("不規則盤面（有挖洞）視同邊界，方塊會停在洞前", () => {
    const boardWithHole: CellCoord[] = [
      [0, 0], [0, 1], [0, 2],
      // [1,1] 是洞
      [1, 0], [1, 2],
      [2, 0], [2, 1], [2, 2],
    ];
    const blocks = [{ id: "a", cells: [[1, 0]] as CellCoord[] }];
    const result = slideBlock(boardWithHole, blocks, "a", "right");
    expect(result).toEqual([[1, 0]]);
  });

  it("往上、往下方向也正確運作", () => {
    const blocks = [{ id: "a", cells: [[1, 1]] as CellCoord[] }];
    expect(slideBlock(OPEN_3X3, blocks, "a", "up")).toEqual([[0, 1]]);
    expect(slideBlock(OPEN_3X3, blocks, "a", "down")).toEqual([[2, 1]]);
  });

  it("找不到對應 id 的方塊時拋出錯誤", () => {
    const blocks = [{ id: "a", cells: [[1, 1]] as CellCoord[] }];
    expect(() => slideBlock(OPEN_3X3, blocks, "missing", "up")).toThrow();
  });
});

describe("maxSlideSteps", () => {
  it("單格方塊回傳可滑到邊界前的步數", () => {
    const blocks = [{ id: "a", cells: [[1, 0]] as CellCoord[] }];
    expect(maxSlideSteps(OPEN_3X3, blocks, "a", "right")).toBe(2);
  });

  it("已貼著邊界時回傳 0", () => {
    const blocks = [{ id: "a", cells: [[1, 2]] as CellCoord[] }];
    expect(maxSlideSteps(OPEN_3X3, blocks, "a", "right")).toBe(0);
  });

  it("被另一方塊擋住時，回傳到對方前一格的步數", () => {
    const blocks = [
      { id: "a", cells: [[1, 0]] as CellCoord[] },
      { id: "b", cells: [[1, 2]] as CellCoord[] },
    ];
    expect(maxSlideSteps(OPEN_3X3, blocks, "a", "right")).toBe(1);
  });

  it("L 形方塊被部分擋住時，回傳可行的步數", () => {
    const blocks = [
      { id: "a", cells: [[0, 1], [1, 1], [1, 2]] as CellCoord[] },
      { id: "b", cells: [[0, 0]] as CellCoord[] },
    ];
    expect(maxSlideSteps(OPEN_3X3, blocks, "a", "left")).toBe(0);
  });

  it("找不到對應 id 的方塊時拋出錯誤", () => {
    const blocks = [{ id: "a", cells: [[1, 1]] as CellCoord[] }];
    expect(() => maxSlideSteps(OPEN_3X3, blocks, "missing", "up")).toThrow();
  });
});

describe("translateCells", () => {
  it("依方向平移指定步數", () => {
    expect(translateCells([[1, 0]], "right", 2)).toEqual([[1, 2]]);
    expect(translateCells([[1, 0]], "down", 1)).toEqual([[2, 0]]);
    expect(translateCells([[1, 1]], "up", 1)).toEqual([[0, 1]]);
    expect(translateCells([[1, 1]], "left", 1)).toEqual([[1, 0]]);
  });

  it("平移多格形狀時，所有格子一起移動", () => {
    expect(
      translateCells(
        [
          [0, 1],
          [1, 1],
          [1, 2],
        ],
        "left",
        1,
      ),
    ).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });

  it("步數為 0 時回傳原座標", () => {
    expect(translateCells([[1, 0]], "right", 0)).toEqual([[1, 0]]);
  });
});
