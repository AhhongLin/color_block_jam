import type { Direction } from "./slide";

// 把一段 pointer 拖曳位移向量轉成上下左右其中一個方向。位移量未達 threshold
// 視為未拖曳（回傳 null），避免誤觸；水平/垂直位移量相等時以垂直為準。
export function directionFromDrag(deltaX: number, deltaY: number, threshold: number): Direction | null {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < threshold) {
    return null;
  }
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0 ? "right" : "left";
  }
  return deltaY > 0 ? "down" : "up";
}

export type Axis = "horizontal" | "vertical";

export interface AxisTracker {
  axis: Axis | null;
  anchorX: number;
  anchorY: number;
}

// 判斷拖曳目前主要是水平還是垂直在動。刻意不是用「從拖曳起點累積的位移」
// 來比較，而是用「相對於上一次判定點的位移」——否則一旦某一軸已經累積很
// 大的位移，之後想切到另一軸就必須贏過那個累積值，幾乎切不過去，實測起來
// 就是「切軸時好時壞」。每次判定出主軸後，把錨點重置到目前位置（ratchet），
// 讓下一次判定只看「最近」的位移，才能穩定偵測方向切換。
// 未達門檻時維持原本的 tracker 不變（axis 可能還是 null，或維持上次判定的軸）。
export function updateAxisTracker(tracker: AxisTracker, clientX: number, clientY: number, threshold: number): AxisTracker {
  const direction = directionFromDrag(clientX - tracker.anchorX, clientY - tracker.anchorY, threshold);
  if (!direction) return tracker;
  return {
    axis: direction === "left" || direction === "right" ? "horizontal" : "vertical",
    anchorX: clientX,
    anchorY: clientY,
  };
}

// 把拖曳沿著方向軸的像素距離換算成離散的滑動格數：四捨五入到最近的整數格，
// 並鉗制在 [0, maxSteps] 之間——負距離（往回拖）視同沒有前進，超過 maxSteps
// 的距離視同貼著障礙物（不會滑過障礙物）。
export function clampedStepsFromDistance(distancePx: number, cellPitchPx: number, maxSteps: number): number {
  if (cellPitchPx <= 0) return 0;
  const steps = Math.round(distancePx / cellPitchPx);
  return Math.max(0, Math.min(maxSteps, steps));
}
