# GitHub Pages 深層連結用 404.html 暫存 + bundle 內還原

GitHub Pages 沒有 server-side rewrite，直接開 `/level/5` 這種深層網址會回 404。我們維持既有作法：build 時 emit 一份 `404.html`，它把 `location.href` 塞進 `sessionStorage` 後 meta refresh 回 base，由 app bundle 在 `createRoot` 之前把網址還原回去，React Router 才開始讀 `location`。

## Considered Options

- **HashRouter** — 整套 404 機制可以直接刪掉，但網址會變成 `/#/level/5`。那是產品面的倒退，不值得拿來換工程面的省事。
- **query-param 編碼**（`?/level/5`，rafgraph/spa-github-pages 那一套）— 相對於 sessionStorage 的唯一實質優勢，是在 sessionStorage 被封鎖的情境下仍能運作。那不是這個遊戲的目標情境。

未來的架構檢視不需要再重提這兩個選項，除非上述前提改變。

## Consequences

- `import.meta.env.BASE_URL` 全 codebase 只有一個入口（出貨路徑 module）。basename、資產路徑、404.html 的 redirect target 全部由它產生——留任何一個例外，症狀會是「路由對但素材 404」這種最難查的組合。
- `404.html` 與還原邏輯之間的契約是那個 `sessionStorage` key。兩邊共用同一個 module 檔（`vite.config.ts` 直接匯入），編譯期綁住，不靠事後斷言。
- 因此 `tsconfig.node.json` 的 `include` 必須列出那個共用檔，否則 `tsc -b` 會回 `TS6307: File ... is not listed within the file list of project`。這條是實測出來的，不是推論。
- base 的值本身編譯期驗不到（它只是個字串），所以另外有一支 post-build 斷言腳本去驗產物：`404.html` 存在、它的 meta refresh url 等於 base、`index.html` 的 asset 路徑全部以 base 開頭。
