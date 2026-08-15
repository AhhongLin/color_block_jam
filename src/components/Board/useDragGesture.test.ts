import { describe, expect, it } from "vitest";
import { computeDragResult } from "./useDragGesture";
import type { CellCoord, LevelBlock } from "../../types/level";

// 5x5 開放地板，方塊固定停在正中央 (2,2)——四個方向都還有 2 格空間可以滑，
// 方便手算 maxSlideSteps 之後的鉗制結果。
const OPEN_5X5: CellCoord[] = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => [r, c] as CellCoord)).flat();
const CENTER_BLOCK: LevelBlock = { id: "a", color: "red", cells: [[2, 2]] };
const PITCH = 50; // px per cell

describe("computeDragResult", () => {
  it("水平軸：dx 為正判定為 right，位移／格數都照 pitch 換算", () => {
    const result = computeDragResult(OPEN_5X5, [CENTER_BLOCK], "a", "horizontal", 120, 0, PITCH, PITCH);
    // maxSlideSteps 往右 = 2（col2 -> col4），120px = 2.4 格，四捨五入到 2，
    // 但視覺位移鉗制在 steps*pitch = 100px（不會被拖過障礙物／邊界）。
    expect(result).toEqual({ direction: "right", steps: 2, offsetXPx: 100, offsetYPx: 0 });
  });

  it("水平軸：dx 為負判定為 left，offsetXPx 是負值", () => {
    const result = computeDragResult(OPEN_5X5, [CENTER_BLOCK], "a", "horizontal", -40, 0, PITCH, PITCH);
    expect(result).toEqual({ direction: "left", steps: 1, offsetXPx: -40, offsetYPx: 0 });
  });

  it("垂直軸：dy 為正判定為 down，offsetYPx 是正值", () => {
    const result = computeDragResult(OPEN_5X5, [CENTER_BLOCK], "a", "vertical", 0, 70, PITCH, PITCH);
    expect(result).toEqual({ direction: "down", steps: 1, offsetXPx: 0, offsetYPx: 70 });
  });

  it("垂直軸：dy 為負判定為 up，offsetYPx 是負值", () => {
    const result = computeDragResult(OPEN_5X5, [CENTER_BLOCK], "a", "vertical", 0, -90, PITCH, PITCH);
    // 90px = 1.8 格，四捨五入到 2（maxSlideSteps 往上剛好也是 2，不需要鉗制格數）。
    expect(result).toEqual({ direction: "up", steps: 2, offsetXPx: 0, offsetYPx: -90 });
  });

  it("位移量遠超過可行範圍時，視覺位移跟格數都鉗制在 maxSlideSteps，不會被拖過障礙物", () => {
    const result = computeDragResult(OPEN_5X5, [CENTER_BLOCK], "a", "horizontal", 500, 0, PITCH, PITCH);
    expect(result).toEqual({ direction: "right", steps: 2, offsetXPx: 100, offsetYPx: 0 });
  });

  it("方塊已經貼著邊界、完全沒有空間可滑時，即使拖了一段距離，格數跟位移都是 0（不會卡在半路）", () => {
    // 這正是「Fix block getting stuck after being dragged once」那次 bug 的
    // 場景：方塊已經在邊界，往同方向再拖一次不該有任何位移殘留。
    const edgeBlock: LevelBlock = { id: "a", color: "red", cells: [[2, 4]] };
    const result = computeDragResult(OPEN_5X5, [edgeBlock], "a", "horizontal", 80, 0, PITCH, PITCH);
    expect(result).toEqual({ direction: "right", steps: 0, offsetXPx: 0, offsetYPx: 0 });
  });

  it("方向的正負號用整段累積位移（dx/dy）判斷，不是瞬時增量——手指往回收一點但仍在起點右側時，方向不會被誤判成反向", () => {
    // dx=250 累積下來仍在起點右側，即使跟上一刻比起來變小了，這裡直接傳
    // 累積值本來就該判定成 right，不會瞬間跳回起點（見 commitSegment 呼叫端
    // 註解：dx/dy 永遠是「從拖曳起點累積」的位移，不是這一小段的位移）。
    const result = computeDragResult(OPEN_5X5, [CENTER_BLOCK], "a", "horizontal", 250, 0, PITCH, PITCH);
    expect(result.direction).toBe("right");
    expect(result.offsetXPx).toBeGreaterThanOrEqual(0);
  });

  it("cellPitchPx 還沒量到（<=0）時，格數跟位移都回傳 0，不會除以 0", () => {
    const result = computeDragResult(OPEN_5X5, [CENTER_BLOCK], "a", "horizontal", 500, 0, 0, 0);
    expect(result).toEqual({ direction: "right", steps: 0, offsetXPx: 0, offsetYPx: 0 });
  });
});
