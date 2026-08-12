import "@testing-library/jest-dom/vitest";

// jsdom 沒有實作 ResizeObserver——Board 用它量測盤面格距去算方塊的
// clip-path（見 src/components/Board/Board.tsx），stub 成「observe 什麼都不
// 做」就夠了，測試不需要真的觀察到尺寸變化，只需要 `new ResizeObserver(...)`
// 不要丟 ReferenceError。
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
