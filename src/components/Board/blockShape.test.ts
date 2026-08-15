import { describe, expect, it } from "vitest";
import { buildBlockClipPath, computeShineAnchor } from "./blockShape";

// blockShape.ts 只是 outlineGeometry.ts 的薄 wrapper（見該檔案的測試取得完整
// 幾何覆蓋），這裡只確認接線正確：包成 clip-path: path(...)、無效輸入回傳
// 空字串。
describe("buildBlockClipPath", () => {
  it("回傳包成 clip-path: path(...) 格式的字串", () => {
    const clipPath = buildBlockClipPath([[0, 0]], 10, 2);
    expect(clipPath.startsWith('path("')).toBe(true);
    expect(clipPath.endsWith('")')).toBe(true);
    expect(clipPath).toContain("A 2 2 0 0 1");
  });

  it("cellPitchPx <= 0 時回傳空字串", () => {
    expect(buildBlockClipPath([[0, 0]], 0, 2)).toBe("");
  });

  it("outsetPx 預設為 0，不影響凸角半徑", () => {
    const clipPath = buildBlockClipPath([[0, 0]], 10, 2);
    expect(clipPath).toBe(buildBlockClipPath([[0, 0]], 10, 2, 0));
  });
});

describe("computeShineAnchor", () => {
  it("單一格子：錨點就是那一格，寬度是一格", () => {
    expect(computeShineAnchor([[0, 0]], 20)).toEqual({ xPx: 0, yPx: 0, widthPx: 20 });
  });

  it("矩形方塊：錨點是最上排最左格，寬度跨滿整排", () => {
    expect(
      computeShineAnchor(
        [
          [0, 0],
          [0, 1],
        ],
        20,
      ),
    ).toEqual({ xPx: 0, yPx: 0, widthPx: 40 });
  });

  it("bounding box 左上角不屬於形狀時（L 形缺角），錨點改挑最上排真正存在的最左格", () => {
    // (0,0) 是缺角，形狀實際是 (0,1) / (1,0) / (1,1)——最上排（row0）只有
    // col1 這一格，錨點該是 (0,1)，不是不存在的 (0,0)。
    const anchor = computeShineAnchor(
      [
        [0, 1],
        [1, 0],
        [1, 1],
      ],
      10,
    );
    expect(anchor).toEqual({ xPx: 10, yPx: 0, widthPx: 10 });
  });

  it("頂端好幾格寬的形狀（T 形），高光寬度跨滿整排，不會誤縮成一格", () => {
    const anchor = computeShineAnchor(
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 1],
      ],
      10,
    );
    expect(anchor).toEqual({ xPx: 0, yPx: 0, widthPx: 30 });
  });

  it("最上排格子不連續時，寬度只算到第一個缺口為止，不會跳過空隙往後數", () => {
    const anchor = computeShineAnchor(
      [
        [0, 0],
        [0, 2],
      ],
      10,
    );
    expect(anchor).toEqual({ xPx: 0, yPx: 0, widthPx: 10 });
  });
});
