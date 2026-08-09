# 07 — 專案骨架、路由與靜態盤面渲染

**What to build:** 建立 Vite + React 18 + TypeScript 專案骨架，接上 GitHub Pages 部署所需的路由設定，並渲染一個寫死（hardcoded）的關卡盤面，套用選定的視覺風格，確認整條「資料 → 畫面」的渲染管線可行。此階段盤面純靜態、方塊還不能拖動。

**Blocked by:** None — can start immediately

- [ ] Vite + React 18 + TypeScript + CSS Modules 專案可以 `npm run dev` 正常啟動
- [ ] `vite.config` 設定對應 GitHub Pages 的 `base` path
- [ ] 接上 `react-router` 的 `BrowserRouter`，至少有一個關卡路由（如 `/level/:id`）
- [ ] 加入 GitHub Pages 的 `404.html` 重定向 trick，讓深層路由可以直接被存取（本機可先驗證邏輯，正式環境驗證留給 08）
- [ ] 依 spec.md 第 3 節的 Level JSON schema，寫一份寫死的範例關卡資料
- [ ] 畫面渲染出盤面格子（含不規則形狀）、方塊（含多格形狀）、門，套用 spec.md 第 4 節 Variant B 視覺風格（圓角、糖果色漸層、色票）
- [ ] 此階段方塊不可拖動、無任何互動邏輯

```ts
// 取自 spec.md 第 3 節，Level JSON schema（第一版）
type Color = "red" | "blue" | "green" | "yellow";

interface Level {
  id: string;
  name: string;
  cells: [number, number][];
  doors: {
    row: number;
    col: number;
    side: "top" | "right" | "bottom" | "left";
    color: Color;
  }[];
  blocks: {
    id: string;
    color: Color;
    cells: [number, number][];
  }[];
}
```

**Status:** ready-for-agent
