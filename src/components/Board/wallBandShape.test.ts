import { describe, expect, it } from "vitest";
import { buildWallBandClipPath, WALL_BAND_ORIGIN_MARGIN_RATIO } from "./wallBandShape";
import { buildRoundedPolygonPath, traceOutlines } from "./outlineGeometry";
import type { CellCoord } from "../../types/level";

// wallBandShape.ts 只是 outlineGeometry.ts 的薄 wrapper（見該檔案的測試取得
// 完整幾何覆蓋，含多圈坑洞），這裡只確認接線正確：origin 依 outsetPx 位移、
// 包成 clip-path: path(...)、無效輸入回傳空字串——不重新推導圓角/弧線的
// 數學（那些已經在 outlineGeometry.test.ts 覆蓋）。
describe("buildWallBandClipPath", () => {
  it("origin 依 outsetPx 位移，跟直接呼叫 outlineGeometry 組出來的結果一致", () => {
    const cells: CellCoord[] = [[0, 0]];
    const cellPitchPx = 10;
    const cornerRadiusPx = 2;
    const outsetPx = 5;

    const expectedData = buildRoundedPolygonPath(traceOutlines(cells), cellPitchPx, cornerRadiusPx, outsetPx, {
      x: outsetPx,
      y: outsetPx,
    });

    expect(buildWallBandClipPath(cells, cellPitchPx, cornerRadiusPx, outsetPx)).toBe(`path("${expectedData}")`);
  });

  it("cellPitchPx <= 0 或空 cells 時回傳空字串", () => {
    expect(buildWallBandClipPath([[0, 0]], 0, 2, 3)).toBe("");
    expect(buildWallBandClipPath([], 10, 2, 3)).toBe("");
  });

  it("WALL_BAND_ORIGIN_MARGIN_RATIO 維持既有數值", () => {
    expect(WALL_BAND_ORIGIN_MARGIN_RATIO).toBe(1);
  });
});
