// 出貨路徑：「這個 app 掛在哪個路徑下」這件事的唯一入口。
//
// GitHub Pages 把 project site 掛在 /<repo>/ 底下，所以 base 不是 "/"，而
// 本機開發跟 vite dev 一律是 "/"。過去 base 的知識散在四個地方各自展開
// （vite.config.ts 的 404.html 樣板、index.html 的還原 script、main.tsx 的
// basename、sound.ts 的四個音檔路徑），任何一處漏掉，症狀都是只在正式站才
// 出現的 404——本機永遠看不到。這個 module 把 import.meta.env.BASE_URL 收成
// 單一入口，其他檔案一律不准直接讀它。
//
// 決策紀錄見 docs/adr/0001-github-pages-deep-link.md。

// 404.html 寫入、restoreDeepLink() 讀出的那把 key——是這兩者之間唯一的契約。
// vite.config.ts 直接匯入這個檔去產生 404.html（因此 tsconfig.node.json 的
// include 必須列出本檔，否則 tsc -b 會回 TS6307），兩邊在編譯期就綁在一起，
// 不靠事後斷言。命名沿用 progress.ts 的 "color-block-jam:" 前綴。
export const DEEP_LINK_STORAGE_KEY = "color-block-jam:deep-link";

// Vite 在 build 時把 import.meta.env.BASE_URL 換成字面值。下面幾個函式的
// `base` 參數只給測試用（正式呼叫端一律不傳），讓「同一段邏輯在 "/" 與
// "/color_block_jam/" 底下各是什麼行為」變成可以直接斷言的事，而不是只能
// 部署上去用眼睛看。
//
// 注意：讀 env 的動作一律留在函式體內，不要提到 module 頂層——vite.config.ts
// 會在 Node 底下匯入本檔，那裡沒有 import.meta.env，頂層求值會直接炸掉。

// 給 BrowserRouter 當 basename 用。
export function basePath(base: string = import.meta.env.BASE_URL): string {
  return base;
}

// public/ 底下的靜態資產（音效，之後的圖片也一樣）的實際網址。傳進來的
// path 一律當成「相對 public/ 根目錄」，開頭有沒有斜線都接受。
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  return `${base}${path.replace(/^\/+/, "")}`;
}

// 404.html 把使用者原本要開的深層網址暫存起來、跳回 base 之後，由這裡把網址
// 還原回去。呼叫時機在 main.tsx 的 createRoot() 之前——React Router 是在
// render 當下才讀 location，所以那時還原來得及。
//
// 一定會把暫存清掉（即使沒有真的還原），否則使用者接下來在站內正常導覽時，
// 下一次重新整理會被舊的暫存值拉回去。
export function restoreDeepLink(storage: Storage, location: Location, history: History): void {
  const stashed = storage.getItem(DEEP_LINK_STORAGE_KEY);
  storage.removeItem(DEEP_LINK_STORAGE_KEY);

  if (!stashed || stashed === location.href) return;
  // 暫存值是我們自己的 404.html 寫的，本來就同源；但 replaceState 對跨源網址
  // 會丟 SecurityError，多這一道檢查讓這個函式永遠不拋例外。
  if (!stashed.startsWith(`${location.origin}/`)) return;

  history.replaceState(null, "", stashed);
}

// build 時 emit 成 dist/404.html。GitHub Pages 沒有 server-side rewrite，直接
// 開 /level/5 會回 404，這一頁就是那個 404：把原本的網址暫存下來，再 meta
// refresh 回 base 讓 SPA 正常載入。
//
// 這裡刻意不引用任何 app 的 CSS/JS——它只活幾十毫秒，載入越少跳轉越快。
export function fallbackHtml(base: string): string {
  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <title>Color Block Jam</title>
    <script>
      sessionStorage.setItem(${JSON.stringify(DEEP_LINK_STORAGE_KEY)}, location.href);
    </script>
    <meta http-equiv="refresh" content="0; url=${base}" />
  </head>
  <body></body>
</html>
`;
}
