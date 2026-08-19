import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fallbackHtml } from "./src/launch/launchPath";

// GitHub Pages 的 project site 掛在 /<repo>/ 底下，所以這個值必須等於 GitHub
// 上的 repo 名稱（AhhongLin/color_block_jam，底線不是連字號）——錯了就是整站
// 空白加全部素材 404。`npm run verify:build` 會拿 git remote 推出來的 repo 名
// 去對這份產物，不再只靠人記得。
//
// 本機 dev 與 `vite preview` 見下方 `command === "build"` 判斷。
const GITHUB_PAGES_BASE = "/color_block_jam/";

// GitHub Pages 沒有 server-side rewrite，深層連結（/level/5）會直接 404。這個
// plugin 在 build 時 emit 一份 404.html 接住它——內容由 src/launch/launchPath.ts
// 產生，跟 app 端負責還原的 restoreDeepLink() 共用同一把 sessionStorage key，
// 兩邊在編譯期綁死。決策紀錄見 docs/adr/0001-github-pages-deep-link.md。
function githubPages404Fallback(base: string): Plugin {
  return {
    name: "github-pages-404-fallback",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "404.html", source: fallbackHtml(base) });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? GITHUB_PAGES_BASE : "/",
  plugins: [react(), githubPages404Fallback(GITHUB_PAGES_BASE)],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // 只跑專案自己的測試。`.scratch/` 底下是關卡產生器原型的一次性窮盡驗證
    // （單檔就要跑好幾分鐘，且需要 node 環境而非 jsdom），沒有 include 的話
    // vitest 的預設 glob 會把它們一起吃進來，`npm test` 就變成十幾分鐘。
    // 那些原型測試有自己的設定檔：
    //   npx vitest run --config .scratch/level-generator/prototype/vitest.config.ts
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
}));
