import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// Single source of truth for the GitHub Pages base path — also drives the
// generated 404.html fallback below, so the two never drift out of sync.
// TODO(ticket 14 — GitHub Pages 上線驗證): confirm this matches the actual
// GitHub repo name once the repo exists and is pushed. Local dev and
// `vite preview` always use "/" regardless of this value.
const GITHUB_PAGES_BASE = "/color-block-jam/";

// GitHub Pages has no server-side rewrites, so it 404s on deep links like
// /level/3. This emits a build-only 404.html that stashes the real URL in
// sessionStorage and redirects to index.html, which restores it (see the
// inline script in index.html).
function githubPages404Fallback(base: string): Plugin {
  return {
    name: "github-pages-404-fallback",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "404.html",
        source: `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <title>Color Block Jam</title>
    <script>
      sessionStorage.redirect = location.href;
    </script>
    <meta http-equiv="refresh" content="0; url=${base}" />
  </head>
  <body></body>
</html>
`,
      });
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
  },
}));
