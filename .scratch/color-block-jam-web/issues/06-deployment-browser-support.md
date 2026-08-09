# 部署與瀏覽器支援範圍

Type: grilling
Status: resolved

## Question

技術規格是否要載明目標瀏覽器支援範圍（例如僅現代瀏覽器）與部署平台（例如 Vercel/GitHub Pages）？或這階段不決定，留給實作 session 自行判斷？

## Answer

1. **瀏覽器支援**：僅現代瀏覽器（evergreen Chrome/Edge/Firefox/Safari），不考慮 IE 或舊版相容、不需額外 polyfill。
2. **部署平台**：GitHub Pages。
3. **路由**：每關/畫面都有自己的 URL（如 `/level/3`），用 React Router 的 `BrowserRouter` + GitHub Pages 的 `404.html` 重定向 trick 模擬 SPA fallback；`vite.config` 需設定對應的 `base` path。這連帶把「需要 React Router」加進技術棧決定（原本 Notes 沒有路由函式庫）。
