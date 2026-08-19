// build 產物的斷言：驗 base 對不對。
//
// base 是個字串，編譯期驗不到——它錯了（例如 repo 叫 color_block_jam 卻寫成
// color-block-jam）的症狀是「本機一切正常、正式站整片空白加全部素材 404」。
// 這支腳本把那個症狀變成 build 之後就能抓到的失敗。
//
// 用法：npm run build && npm run verify:build
// 決策紀錄見 docs/adr/0001-github-pages-deep-link.md。

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DIST = resolve(process.cwd(), "dist");
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? `\n      ${detail}` : ""}`);
    console.log(`  ✗ ${label}`);
  }
}

// --- 產物存在 ---------------------------------------------------------------

const indexPath = resolve(DIST, "index.html");
const fallbackPath = resolve(DIST, "404.html");

if (!existsSync(indexPath)) {
  console.error("dist/index.html 不存在——先跑 npm run build。");
  process.exit(1);
}

console.log("驗證 dist/ 的出貨路徑：");
check("dist/404.html 存在（GitHub Pages 的深層連結全靠它接住）", existsSync(fallbackPath));

const indexHtml = readFileSync(indexPath, "utf8");
const fallbackHtml = existsSync(fallbackPath) ? readFileSync(fallbackPath, "utf8") : "";

// --- 從產物反推 base --------------------------------------------------------

// Vite 把 bundle 產物放在 <base>assets/ 底下，所以第一個 assets 路徑就帶著
// 實際烤進去的 base。
const assetMatch = indexHtml.match(/(?:src|href)="([^"]*\/assets\/[^"]*)"/);
if (!assetMatch) {
  console.error("dist/index.html 裡找不到任何 assets/ 路徑，無法反推 base。");
  process.exit(1);
}
const base = assetMatch[1].slice(0, assetMatch[1].indexOf("assets/"));
console.log(`  · 產物烤進去的 base：${base}`);

// --- base 與 repo 名一致 ----------------------------------------------------

// 這條是這支腳本存在的主要理由：GitHub Pages 的 project site 網址就是
// /<repo>/，base 跟 repo 名對不上就是整站壞掉。
let repoName = null;
try {
  const remote = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  repoName = remote.replace(/\.git$/, "").split("/").pop() ?? null;
} catch {
  console.log("  · 沒有 git remote origin，跳過 base 與 repo 名的比對");
}

if (repoName) {
  if (base === "/") {
    console.log(`  · base 是 "/"（user site 或自訂網域），跳過與 repo 名的比對`);
  } else {
    check(
      `base 等於 /${repoName}/（GitHub Pages project site 的實際路徑）`,
      base === `/${repoName}/`,
      `產物是 ${base}，remote 的 repo 名是 ${repoName}`,
    );
  }
}

// --- index.html 的資產路徑全部帶 base ---------------------------------------

const rootRelative = [...indexHtml.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
const stray = rootRelative.filter((url) => !url.startsWith(base));
check(
  `index.html 的根相對資產路徑全部以 base 開頭（共 ${rootRelative.length} 條）`,
  stray.length === 0,
  stray.length ? `不以 base 開頭的：${stray.join(", ")}` : "",
);

// --- 404.html 的 meta refresh 指向 base -------------------------------------

if (fallbackHtml) {
  const refresh = fallbackHtml.match(/content="0;\s*url=([^"]*)"/);
  check(
    "404.html 的 meta refresh 指向 base（指錯就是深層連結轉到空白頁）",
    refresh?.[1] === base,
    refresh ? `404.html 指向 ${refresh[1]}，產物 base 是 ${base}` : "404.html 裡找不到 meta refresh",
  );

  check(
    "404.html 有寫入 sessionStorage（沒有的話深層網址在跳轉時就掉了）",
    /sessionStorage\.setItem\(/.test(fallbackHtml),
  );
}

// --- 結果 -------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\n出貨路徑驗證失敗（${failures.length} 項）：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("\n出貨路徑驗證通過。");
