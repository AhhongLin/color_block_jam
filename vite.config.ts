import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// TODO(ticket 14 — GitHub Pages 上線驗證): confirm this matches the actual
// GitHub repo name once the repo exists and is pushed. Local dev and
// `vite preview` always use "/" regardless of this value.
const GITHUB_PAGES_BASE = "/color-block-jam/";

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? GITHUB_PAGES_BASE : "/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
