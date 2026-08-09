# 視覺美術風格原型

Type: prototype
Status: resolved

## Question

用 `/prototype` 做一版低保真 UI 原型，決定：

- 方塊/盤面/門的視覺風格（純色幾何 vs 更精緻的圖形資源）。
- 色彩配色方案（方塊顏色數量、彼此對比度、色盲友善考量）。
- 盤面格子大小與整體版面配置，包含關卡選單畫面的視覺風格。

## Answer

選定 **Variant B — 圓潤活潑（Playful Rounded）**：

- 方塊：大圓角、糖果色漸層填色、底部實色陰影營造立體感、選中時放大 + 白色外框光暈。
- 盤面格：白色半透明圓角格，暖色系背景漸層（米黃到粉）。
- 門：圓角膠囊造型，同色 glow 光暈。
- 關卡選單：路徑地圖風格（類 Candy Crush），圓形關卡節點沿路徑排列，已完成關卡顯示星級評分，未解鎖關卡灰階。

三個變體（A 極簡幾何、B 圓潤活潑、C 深色霓虹）的完整原型碼記錄在 throwaway 分支 `prototype/visual-style`（commit 249a4a9），檔案路徑 `.scratch/color-block-jam-web/prototypes/visual-style-prototype.html`。main 分支只保留這份決策文字，不留原型程式碼。
