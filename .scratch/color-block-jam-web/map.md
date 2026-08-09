# Color Block Jam 網頁版規格地圖

## Destination

一份可交付、可迭代的**規格文件**（遊戲設計 + 技術規格），涵蓋核心玩法規則、盤面/方塊/關卡資料格式、UI 流程與技術架構，交付後可直接用 `/implement` 或 `/tdd` 開始實作。目的地是「規格」，不是完成的遊戲本身。

**已交付**：[spec.md](spec.md) — 彙整下方六個決策的正式規格文件。

## Notes

- **領域**：瀏覽器版的顏色方塊推箱子解謎遊戲（Color Block Jam 類型）——點擊方塊使其沿方向滑動直到撞牆或其他方塊，滑到同色門即可離開盤面，清空所有方塊即過關。
- **MVP 範圍**：核心玩法優先——滑動方塊、任意多格子形狀的方塊、任意不規則盤面形狀、邊界門（同色可多門）、過關判定、簡單關卡選單 + `localStorage` 進度儲存。原版的箭頭方塊、冰凍方塊、計時器、生命值、金幣/道具、廣告續命、關卡編輯器**不在此範圍**（見「Out of scope」）。
- **技術棧**：Vite + React 18 + TypeScript、React 內建 `useState`/`useReducer`、CSS Modules、CSS transition 做滑動動畫、React Router（`BrowserRouter`）做每關/畫面的 URL 路由。
- **關卡資料**：手工撰寫的 JSON 關卡檔，先寫幾關範例；不做關卡編輯器。
- **測試策略**：核心遊戲邏輯（滑動、碰撞、過關判定）之後用 `/tdd` 開發。
- 「怎麼看/怎麼動」類的問題用 `/prototype` 做低保真原型；其餘決策用 `/grilling`。
- UI 需要一個「重設關卡」按鈕（因為 MVP 不做死局偵測，玩家卡死時要能自行重來）。

## Decisions so far

- [核心滑動與碰撞規則精確化](issues/01-core-sliding-collision-rules.md) — 拖曳指定方向滑動；撞方塊只停不推；多格方塊逐格模擬碰撞；離場需整個前緣對齊同色門；MVP 不做死局偵測，改用「重設關卡」按鈕。
- [視覺美術風格原型](issues/02-visual-art-style-prototype.md) — 選定 Variant B「圓潤活潑」：大圓角糖果色漸層方塊、暖色系盤面、圓角膠囊發光門、路徑地圖式關卡選單（含星級）。原型碼在 throwaway 分支 `prototype/visual-style`。
- [音效範圍決策](issues/03-audio-scope-decision.md) — 只做互動音效（方塊離場、過關），不做背景音樂；素材用免費音效庫（CC 授權）。
- [關卡數量與難度曲線設計](issues/04-level-count-difficulty-curve.md) — MVP 8 關，線性遞進難度曲線（1-2 教學、3-5 加入 L 形/不規則盤面、6-8 高複雜度）；不做額外教學 UI，靠關卡設計本身教會玩家。
- [響應式與裝置支援範圍](issues/05-responsive-device-support.md) — 桌面 + 行動裝置都支援（Pointer Events 統一處理拖曳），不做替代輸入方式，需要 RWD（手機到桌面寬螢幕都適配）。
- [部署與瀏覽器支援範圍](issues/06-deployment-browser-support.md) — 僅現代瀏覽器；部署到 GitHub Pages；每關/畫面有自己的 URL，用 React Router `BrowserRouter` + `404.html` trick 處理 GitHub Pages 的 SPA fallback。

## Not yet specified

- 個別關卡的實際內容設計（每一關放哪些方塊、門在哪）——待核心規則與難度曲線決策後，可能不需要另開地圖，直接由實作 session 產出。

## Out of scope

- 箭頭方塊、冰凍方塊、計時器、生命值、金幣/道具、廣告續命——原版機制，MVP 明確排除，聚焦核心滑動玩法。
- 關卡編輯器 UI——MVP 用手工 JSON 關卡檔，不需要可視化編輯工具。
