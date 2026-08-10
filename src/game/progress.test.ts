import { describe, expect, it } from "vitest";
import { isLevelUnlocked, markLevelCompleted, readCompletedLevelIds } from "./progress";
import type { Level } from "../types/level";

// 簡單的記憶體版 Storage 假物件，行為對齊 localStorage 的 getItem/setItem
// 介面，測試不需要真的碰瀏覽器 API。
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

describe("readCompletedLevelIds", () => {
  it("尚未儲存過任何進度時回傳空集合", () => {
    expect(readCompletedLevelIds(fakeStorage())).toEqual(new Set());
  });

  it("讀出先前寫入的已完成關卡 id", () => {
    const storage = fakeStorage({ "color-block-jam:completed-levels": JSON.stringify(["01", "02"]) });
    expect(readCompletedLevelIds(storage)).toEqual(new Set(["01", "02"]));
  });

  it("儲存內容損毀（非合法 JSON 陣列）時視同沒有進度，不拋出例外", () => {
    const storage = fakeStorage({ "color-block-jam:completed-levels": "{not json" });
    expect(readCompletedLevelIds(storage)).toEqual(new Set());
  });
});

describe("markLevelCompleted", () => {
  it("把關卡 id 加進已完成集合並寫回 storage", () => {
    const storage = fakeStorage();
    const result = markLevelCompleted(storage, "01");
    expect(result).toEqual(new Set(["01"]));
    expect(readCompletedLevelIds(storage)).toEqual(new Set(["01"]));
  });

  it("重複標記同一關不會產生重複項目", () => {
    const storage = fakeStorage({ "color-block-jam:completed-levels": JSON.stringify(["01"]) });
    const result = markLevelCompleted(storage, "01");
    expect(result).toEqual(new Set(["01"]));
  });

  it("標記新關卡時保留先前已完成的關卡", () => {
    const storage = fakeStorage({ "color-block-jam:completed-levels": JSON.stringify(["01"]) });
    const result = markLevelCompleted(storage, "02");
    expect(result).toEqual(new Set(["01", "02"]));
  });
});

describe("isLevelUnlocked", () => {
  const levels: Level[] = [
    { id: "01", name: "第 1 關", cells: [], doors: [], blocks: [] },
    { id: "02", name: "第 2 關", cells: [], doors: [], blocks: [] },
    { id: "03", name: "第 3 關", cells: [], doors: [], blocks: [] },
  ];

  it("第一關永遠解鎖，不需要任何完成紀錄", () => {
    expect(isLevelUnlocked(0, levels, new Set())).toBe(true);
  });

  it("前一關尚未完成時，後面的關卡維持鎖定", () => {
    expect(isLevelUnlocked(1, levels, new Set())).toBe(false);
    expect(isLevelUnlocked(2, levels, new Set(["01"]))).toBe(false);
  });

  it("前一關完成後，下一關解鎖", () => {
    expect(isLevelUnlocked(1, levels, new Set(["01"]))).toBe(true);
  });

  it("完成關卡本身不影響它自己的解鎖狀態（解鎖只看前一關）", () => {
    expect(isLevelUnlocked(2, levels, new Set(["01", "02"]))).toBe(true);
  });
});
