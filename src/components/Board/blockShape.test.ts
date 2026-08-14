import { describe, expect, it } from "vitest";
import { buildBlockClipPath } from "./blockShape";

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
