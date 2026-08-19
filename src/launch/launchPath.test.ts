import { describe, expect, it } from "vitest";
import { DEEP_LINK_STORAGE_KEY, assetUrl, basePath, fallbackHtml, restoreDeepLink } from "./launchPath";

// 這一組測試的重點全在「同一段邏輯在 dev 的 "/" 與 GitHub Pages 的
// "/color_block_jam/" 底下各是什麼行為」——那正是過去只能部署上去才驗得到、
// 本機永遠看不到的那一段。
const DEV_BASE = "/";
const PAGES_BASE = "/color_block_jam/";

class FakeStorage implements Storage {
  private map = new Map<string, string>();

  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

function fakeLocation(href: string): Location {
  const url = new URL(href);
  return { href: url.href, origin: url.origin } as Location;
}

function fakeHistory() {
  const replaced: string[] = [];
  const history = {
    replaceState(_data: unknown, _unused: string, url?: string | URL | null) {
      replaced.push(String(url));
    },
  } as unknown as History;
  return { history, replaced };
}

describe("basePath", () => {
  it("原樣回傳 base——BrowserRouter 的 basename 要的就是這個字串", () => {
    expect(basePath(PAGES_BASE)).toBe(PAGES_BASE);
    expect(basePath(DEV_BASE)).toBe(DEV_BASE);
  });
});

describe("assetUrl", () => {
  it("在 GitHub Pages 的 base 底下，資產路徑帶上 repo 前綴", () => {
    expect(assetUrl("sounds/move.mp3", PAGES_BASE)).toBe("/color_block_jam/sounds/move.mp3");
  });

  it("在 dev 的 base 底下就是根路徑，不多一層", () => {
    expect(assetUrl("sounds/move.mp3", DEV_BASE)).toBe("/sounds/move.mp3");
  });

  it("path 開頭帶斜線也不會接出兩條斜線（呼叫端寫 /sounds/… 是很自然的手滑）", () => {
    expect(assetUrl("/sounds/move.mp3", PAGES_BASE)).toBe("/color_block_jam/sounds/move.mp3");
    expect(assetUrl("/sounds/move.mp3", DEV_BASE)).toBe("/sounds/move.mp3");
  });
});

describe("restoreDeepLink", () => {
  it("把 404.html 暫存的深層網址還原回網址列", () => {
    const storage = new FakeStorage();
    storage.setItem(DEEP_LINK_STORAGE_KEY, "https://ahhonglin.github.io/color_block_jam/level/05");
    const { history, replaced } = fakeHistory();

    restoreDeepLink(storage, fakeLocation("https://ahhonglin.github.io/color_block_jam/"), history);

    expect(replaced).toEqual(["https://ahhonglin.github.io/color_block_jam/level/05"]);
  });

  it("還原後清掉暫存，避免下一次重新整理又被拉回同一個深層網址", () => {
    const storage = new FakeStorage();
    storage.setItem(DEEP_LINK_STORAGE_KEY, "https://ahhonglin.github.io/color_block_jam/level/05");
    const { history } = fakeHistory();

    restoreDeepLink(storage, fakeLocation("https://ahhonglin.github.io/color_block_jam/"), history);

    expect(storage.getItem(DEEP_LINK_STORAGE_KEY)).toBeNull();
  });

  it("沒有暫存時什麼都不做——一般開首頁的路徑不該被動到", () => {
    const storage = new FakeStorage();
    const { history, replaced } = fakeHistory();

    restoreDeepLink(storage, fakeLocation("https://ahhonglin.github.io/color_block_jam/"), history);

    expect(replaced).toEqual([]);
  });

  it("暫存值就等於目前網址時不重複 replaceState", () => {
    const storage = new FakeStorage();
    const href = "https://ahhonglin.github.io/color_block_jam/";
    storage.setItem(DEEP_LINK_STORAGE_KEY, href);
    const { history, replaced } = fakeHistory();

    restoreDeepLink(storage, fakeLocation(href), history);

    expect(replaced).toEqual([]);
  });

  it("暫存值跨源時不還原也不拋例外（replaceState 對跨源會丟 SecurityError）", () => {
    const storage = new FakeStorage();
    storage.setItem(DEEP_LINK_STORAGE_KEY, "https://evil.example.com/level/05");
    const { history, replaced } = fakeHistory();

    expect(() =>
      restoreDeepLink(storage, fakeLocation("https://ahhonglin.github.io/color_block_jam/"), history),
    ).not.toThrow();
    expect(replaced).toEqual([]);
    expect(storage.getItem(DEEP_LINK_STORAGE_KEY)).toBeNull();
  });
});

describe("fallbackHtml", () => {
  it("meta refresh 指向傳進來的 base", () => {
    expect(fallbackHtml(PAGES_BASE)).toContain('content="0; url=/color_block_jam/"');
  });

  it("寫入的 key 就是 restoreDeepLink 讀的那一把（兩邊同一個常數，這裡把契約釘住）", () => {
    expect(fallbackHtml(PAGES_BASE)).toContain(`sessionStorage.setItem("${DEEP_LINK_STORAGE_KEY}"`);
  });
});
