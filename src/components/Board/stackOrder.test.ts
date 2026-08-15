import { describe, expect, it } from "vitest";
import { computeStackRanks } from "./stackOrder";
import type { LevelBlock } from "../../types/level";

function block(id: string, cells: LevelBlock["cells"]): LevelBlock {
  return { id, color: "red", cells };
}

describe("computeStackRanks", () => {
  it("最下緣 row 較大的方塊名次較後（畫面上蓋住較上面的方塊）", () => {
    const top = block("top", [[0, 0]]);
    const bottom = block("bottom", [[2, 0]]);
    const ranks = computeStackRanks([top, bottom]);
    expect(ranks.get("bottom")!).toBeGreaterThan(ranks.get("top")!);
  });

  it("兩塊方塊沒有共用欄位時，直接比整塊最下緣", () => {
    // 左右不相鄰：a 在 col 0，b 在 col 5，即使 a 的最下緣比較深，
    // 兩者互不咬合，仍然照最下緣排序。
    const a = block("a", [[3, 0]]);
    const b = block("b", [[1, 5]]);
    const ranks = computeStackRanks([a, b]);
    expect(ranks.get("a")!).toBeGreaterThan(ranks.get("b")!);
  });

  it("整體最下緣同高時，改看共用欄位裡誰比較深，由那一塊蓋住對方（tiebreak）", () => {
    // a：col0 到 row2、col1 到 row1 → 整塊最下緣 = 2。
    // b：col1 到 row0、col2 到 row2 → 整塊最下緣 = 2。
    // 兩塊「整體最下緣」打平，只看這個會分不出誰該蓋住誰；但共用的 col1
    // 裡 a 比 b 深（row1 > row0），真正互相咬合的地方是 a 蓋住 b。
    const a = block("a", [
      [2, 0],
      [1, 1],
    ]);
    const b = block("b", [
      [0, 1],
      [2, 2],
    ]);
    const naiveBottomRow = (blk: LevelBlock) => blk.cells.reduce((max, [row]) => Math.max(max, row), -Infinity);
    expect(naiveBottomRow(a)).toBe(naiveBottomRow(b)); // 整體最下緣確實打平

    const ranks = computeStackRanks([a, b]);
    expect(ranks.get("a")!).toBeGreaterThan(ranks.get("b")!);
  });

  it("回傳的名次是 0 起跳、不重複的連續整數", () => {
    const blocks = [block("a", [[0, 0]]), block("b", [[1, 1]]), block("c", [[2, 2]])];
    const ranks = computeStackRanks(blocks);
    expect(new Set(ranks.values())).toEqual(new Set([0, 1, 2]));
  });

  it("空陣列回傳空 Map", () => {
    expect(computeStackRanks([]).size).toBe(0);
  });
});
