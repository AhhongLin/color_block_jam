import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExitAnimation } from "./useExitAnimation";
import { playSound } from "../../audio/sound";
import type { LevelBlock } from "../../types/level";

// jsdom 沒有實作 HTMLMediaElement.play()，跟這裡要測的 timer 排程與幾何無關，
// 直接 mock 掉整個音效模組，順便讓下面能斷言真的播了 exit 音效。
vi.mock("../../audio/sound", () => ({ playSound: vi.fn() }));

// 一整排地板 (0,0)~(0,2)，方塊停在最右格 (0,2)，往 right 離場——
// 手算得到 clearSteps=1、slideMs=500，門格對齊 (0,2)，方便斷言。
const FLOOR_ROW = new Set(["0,0", "0,1", "0,2"]);
const BLOCK: LevelBlock = { id: "b1", color: "red", cells: [[0, 2]] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(playSound).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useExitAnimation", () => {
  it("startExit 立刻移除方塊、播放 exit 音效，並把方塊掛進 exitingBlocks（格子還沒平移）", () => {
    const removeBlock = vi.fn();
    const { result } = renderHook(() => useExitAnimation(FLOOR_ROW, removeBlock));

    act(() => {
      result.current.startExit(BLOCK, "right", "#e6453f");
    });

    expect(removeBlock).toHaveBeenCalledWith("b1");
    expect(playSound).toHaveBeenCalledWith("exit");
    expect(result.current.exitingBlocks).toEqual([{ id: "b1", color: "red", cells: [[0, 2]], slideMs: 500 }]);
  });

  it("EXIT_SLIDE_START_DELAY_MS（20ms）後，離場方塊的格子才換成滑出後的位置", () => {
    const { result } = renderHook(() => useExitAnimation(FLOOR_ROW, vi.fn()));
    act(() => {
      result.current.startExit(BLOCK, "right", "#e6453f");
    });
    expect(result.current.exitingBlocks[0].cells).toEqual([[0, 2]]);

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(result.current.exitingBlocks[0].cells).toEqual([[0, 3]]);
  });

  it("slideMs + 20ms 後，方塊從 exitingBlocks 移除", () => {
    const { result } = renderHook(() => useExitAnimation(FLOOR_ROW, vi.fn()));
    act(() => {
      result.current.startExit(BLOCK, "right", "#e6453f");
    });
    act(() => {
      vi.advanceTimersByTime(500 + 20 - 1);
    });
    expect(result.current.exitingBlocks).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.exitingBlocks).toHaveLength(0);
  });

  it("在 slideMs 內排出固定數量的粉粒波次，每波幾何都落在門外合理範圍內", () => {
    const { result } = renderHook(() => useExitAnimation(FLOOR_ROW, vi.fn()));
    act(() => {
      result.current.startExit(BLOCK, "right", "#e6453f");
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // waveCount = max(clearSteps=1, round(500 / 140)) = max(1, 4) = 4
    expect(result.current.bursts).toHaveLength(4);
    for (const burst of result.current.bursts) {
      expect(burst.color).toBe("#e6453f");
      // 門格 (0,2) 沿 right 方向再往外推 0.72 格（DOOR_BURST_OFFSET_CELLS）。
      expect(burst.center.row).toBeCloseTo(0);
      expect(burst.center.col).toBeCloseTo(2.72);
      expect(burst.cells).toHaveLength(1);
      for (const dot of burst.cells[0].dots) {
        expect(dot.distancePx).toBeGreaterThanOrEqual(26 * 2.1);
        expect(dot.distancePx).toBeLessThanOrEqual(58 * 2.1);
        expect(dot.sizePx).toBeGreaterThanOrEqual(5 * 1.55);
        expect(dot.sizePx).toBeLessThanOrEqual(10 * 1.55);
        // 噴發方向以 direction="right"（angleRad 0）為中心，130° 扇形 + 20° 抖動，
        // 總張角上限是 (130/2 + 20/2)° = 75°。
        expect(Math.abs(dot.angleRad)).toBeLessThanOrEqual((75 * Math.PI) / 180 + 1e-9);
        expect(dot.rotationDeg).toBeGreaterThanOrEqual(-180);
        expect(dot.rotationDeg).toBeLessThan(180);
      }
    }
  });

  it("每一波粉粒各自在 CRUMB_FLY_MS 之後清空", () => {
    const { result } = renderHook(() => useExitAnimation(FLOOR_ROW, vi.fn()));
    act(() => {
      result.current.startExit(BLOCK, "right", "#e6453f");
    });
    act(() => {
      vi.advanceTimersByTime(500 + 2200 + 100);
    });
    expect(result.current.bursts).toHaveLength(0);
  });

  it("reset() 立刻清空狀態，且取消所有尚未執行的 timer", () => {
    const { result } = renderHook(() => useExitAnimation(FLOOR_ROW, vi.fn()));
    act(() => {
      result.current.startExit(BLOCK, "right", "#e6453f");
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.exitingBlocks).toHaveLength(0);
    expect(result.current.bursts).toHaveLength(0);

    // reset 之後把時間快轉過所有原本該觸發的時機點，狀態應該維持清空——
    // 代表 reset 真的取消了 timer，不是只清了當下的 state。
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.exitingBlocks).toHaveLength(0);
    expect(result.current.bursts).toHaveLength(0);
  });

  it("floorSet／removeBlock 每次 render 傳新的參照時，startExit 用的是呼叫當下最新的一份", () => {
    const removeBlockA = vi.fn();
    const removeBlockB = vi.fn();
    const { result, rerender } = renderHook(({ removeBlock }) => useExitAnimation(FLOOR_ROW, removeBlock), {
      initialProps: { removeBlock: removeBlockA },
    });

    rerender({ removeBlock: removeBlockB });

    act(() => {
      result.current.startExit(BLOCK, "right", "#e6453f");
    });

    expect(removeBlockA).not.toHaveBeenCalled();
    expect(removeBlockB).toHaveBeenCalledWith("b1");
  });
});
