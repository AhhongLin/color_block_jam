import type { Level } from "../types/level";

const STORAGE_KEY = "color-block-jam:completed-levels";

// spec.md 4.3／09 節：過關進度存在 localStorage，重新整理頁面不遺失。
// 接受注入的 Storage（而不是直接抓全域 localStorage）方便單元測試用假物件，
// 也讓呼叫端（LevelPage/LevelSelect）決定要不要真的碰瀏覽器 API。
export function readCompletedLevelIds(storage: Storage): Set<string> {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeCompletedLevelIds(storage: Storage, ids: Set<string>): void {
  storage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

// 把某一關標記為已完成並立刻寫回 storage，回傳更新後的完整集合，讓呼叫端
// 不需要再多讀一次 storage 就能更新畫面。
export function markLevelCompleted(storage: Storage, levelId: string): Set<string> {
  const completed = readCompletedLevelIds(storage);
  completed.add(levelId);
  writeCompletedLevelIds(storage, completed);
  return completed;
}

// spec.md 4.3 只規定「未解鎖關卡呈灰階、不可點擊」，沒有定義解鎖條件；這裡採用
// 路徑地圖式選單常見的「循序解鎖」規則（完成上一關才解鎖下一關）作為實作階段的
// 合理預設：第一關（index 0）永遠解鎖，之後每一關要前一關的 id 在已完成集合裡
// 才算解鎖。
export function isLevelUnlocked(levelIndex: number, levels: Level[], completedIds: Set<string>): boolean {
  if (levelIndex === 0) return true;
  const previousLevel = levels[levelIndex - 1];
  return previousLevel !== undefined && completedIds.has(previousLevel.id);
}
