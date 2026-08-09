import { describe, expect, it } from "vitest";
import { clampedStepsFromDistance, directionFromDrag, updateAxisTracker, type AxisTracker } from "./dragDirection";

describe("directionFromDrag", () => {
  it("位移量小於 threshold 時回傳 null（視為未拖曳）", () => {
    expect(directionFromDrag(3, -2, 10)).toBeNull();
  });

  it("水平位移量較大且為正時回傳 right", () => {
    expect(directionFromDrag(20, 5, 10)).toBe("right");
  });

  it("水平位移量較大且為負時回傳 left", () => {
    expect(directionFromDrag(-20, 5, 10)).toBe("left");
  });

  it("垂直位移量較大且為正時回傳 down", () => {
    expect(directionFromDrag(5, 20, 10)).toBe("down");
  });

  it("垂直位移量較大且為負時回傳 up", () => {
    expect(directionFromDrag(5, -20, 10)).toBe("up");
  });

  it("水平垂直位移量相等時，以垂直為準", () => {
    expect(directionFromDrag(15, 15, 10)).toBe("down");
    expect(directionFromDrag(15, -15, 10)).toBe("up");
  });

  it("剛好等於 threshold 時視為已達門檻", () => {
    expect(directionFromDrag(10, 0, 10)).toBe("right");
  });
});

describe("clampedStepsFromDistance", () => {
  it("距離四捨五入到最近的整數格數", () => {
    expect(clampedStepsFromDistance(29, 60, 5)).toBe(0);
    expect(clampedStepsFromDistance(31, 60, 5)).toBe(1);
    expect(clampedStepsFromDistance(150, 60, 5)).toBe(3);
  });

  it("距離為負（往回拖）時鉗制在 0", () => {
    expect(clampedStepsFromDistance(-40, 60, 5)).toBe(0);
  });

  it("距離超過可移動上限時鉗制在 maxSteps", () => {
    expect(clampedStepsFromDistance(1000, 60, 2)).toBe(2);
  });

  it("maxSteps 為 0 時（完全被擋住）永遠回傳 0", () => {
    expect(clampedStepsFromDistance(500, 60, 0)).toBe(0);
  });

  it("cellPitchPx 不合法（<=0）時安全回傳 0", () => {
    expect(clampedStepsFromDistance(500, 0, 5)).toBe(0);
    expect(clampedStepsFromDistance(500, -10, 5)).toBe(0);
  });
});

describe("updateAxisTracker", () => {
  const threshold = 12;

  it("位移未達門檻時，維持原本的 tracker 不變", () => {
    const tracker: AxisTracker = { axis: null, anchorX: 0, anchorY: 0 };
    const next = updateAxisTracker(tracker, 5, 0, threshold);
    expect(next).toEqual(tracker);
  });

  it("第一次決定出主軸時，依主導方向設定 axis，並把錨點重置到目前位置", () => {
    const tracker: AxisTracker = { axis: null, anchorX: 0, anchorY: 0 };
    const next = updateAxisTracker(tracker, 20, 0, threshold);
    expect(next).toEqual({ axis: "horizontal", anchorX: 20, anchorY: 0 });
  });

  it("垂直位移較大時，主軸判定為 vertical", () => {
    const tracker: AxisTracker = { axis: null, anchorX: 0, anchorY: 0 };
    const next = updateAxisTracker(tracker, 0, 20, threshold);
    expect(next.axis).toBe("vertical");
  });

  it("即使水平方向已經累積很大的位移，只要最近一段位移明顯偏垂直，仍能切到垂直軸", () => {
    // 模擬玩家持續往右拖曳，錨點每次都棘輪前進（ratchet）到目前位置。
    let tracker: AxisTracker = { axis: null, anchorX: 0, anchorY: 0 };
    for (let x = 15; x <= 300; x += 15) {
      tracker = updateAxisTracker(tracker, x, 0, threshold);
    }
    expect(tracker.axis).toBe("horizontal");
    expect(tracker.anchorX).toBe(300);

    // 水平方向累積位移高達 300px，但接下來只往下移動 50px（遠小於 300）。
    // 若用「從拖曳起點累積」的位移判斷，300 > 50 永遠切不到垂直；
    // 用「相對於上一次判定點」的位移判斷，(0, 50) 明顯偏垂直，應該要能切換。
    const next = updateAxisTracker(tracker, 300, 50, threshold);
    expect(next.axis).toBe("vertical");
  });

  it("同一軸內位移未達門檻時，維持原本判定的軸與錨點", () => {
    const tracker: AxisTracker = { axis: "horizontal", anchorX: 100, anchorY: 0 };
    const next = updateAxisTracker(tracker, 105, 3, threshold);
    expect(next).toEqual(tracker);
  });
});
