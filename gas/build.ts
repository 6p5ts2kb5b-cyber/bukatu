// GAS版を組み立てる（bun build.ts）
//
//  いまのアプリ（../src）の画面と計算のコードを、そのまま使います。
//  Firebase と Next.js の部分だけを、GAS用の部品（src/shim）に差しかえます。
//
//  できるもの（dist/）：
//    Code.gs      … サーバー側（server/Code.gs をそのまま）
//    Index.html   … 画面の入れ物（見た目のCSSも中に入れる）
//    App1.html …  … 画面のプログラム（大きいので、いくつかに分けて Index.html から読み込む）
//    dev.html     … 試す用（偽のサーバーで動く。GASには貼らない）

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { compile } from "tailwindcss";
import * as esbuild from "esbuild";

const GAS = resolve(import.meta.dir);
const ROOT = resolve(GAS, "..");
const APP_SRC = join(ROOT, "src");
const DIST = join(GAS, "dist");
const PART_SIZE = 240_000; // 1つのファイルの大きさの目安（エディタが重くならないように）

const SHIM: Record<string, string> = {
  "@/components/AppShell": join(GAS, "src/AppShell.tsx"),
  "@/components/AuthProvider": join(GAS, "src/AuthProvider.tsx"),
  "@/lib/firebase": join(GAS, "src/shim/firebase-lib.ts"),
  "firebase/firestore": join(GAS, "src/shim/firestore.ts"),
  "firebase/auth": join(GAS, "src/shim/firebase-auth.ts"),
  "next/link": join(GAS, "src/shim/next-link.tsx"),
  "next/navigation": join(GAS, "src/shim/next-navigation.ts"),
};
// いまのアプリの中から "./firebase" のように読まれるものも、差しかえる
const SHIM_BY_FILE: Record<string, string> = {
  [join(APP_SRC, "lib/firebase.ts")]: SHIM["@/lib/firebase"],
  [join(APP_SRC, "components/AppShell.tsx")]: SHIM["@/components/AppShell"],
  [join(APP_SRC, "components/AuthProvider.tsx")]: SHIM["@/components/AuthProvider"],
};

function resolveFile(base: string): string | null {
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

// いまのアプリのコードの、ブラウザの枠の外を使うところだけ GAS 用に置きかえる
function patchSource(path: string, code: string): string {
  let c = code.replace(/^["']use client["'];?\s*/m, "");
  if (!path.startsWith(APP_SRC)) return c;
  const needs: string[] = [];
  if (c.includes("window.location.search")) {
    c = c.replaceAll("window.location.search", "__gasRoute.routeSearch()");
    needs.push(`import * as __gasRoute from "${join(GAS, "src/shim/router.ts")}";`);
  }
  if (c.includes("window.history.replaceState(null, \"\", ")) {
    c = c.replaceAll('window.history.replaceState(null, "", ', "__gasRoute2.routeReplace(");
    needs.push(`import * as __gasRoute2 from "${join(GAS, "src/shim/router.ts")}";`);
  }
  if (c.includes("navigator.clipboard.writeText(")) {
    c = c.replaceAll("navigator.clipboard.writeText(", "__gasCopy.copyText(");
    needs.push(`import * as __gasCopy from "${join(GAS, "src/copy.ts")}";`);
  }
  return needs.length ? needs.join("\n") + "\n" + c : c;
}

// 画面のプログラムでは、React を App1.html（window.__vendor）から使う
const VENDOR_MAP: Record<string, string> = {
  react: "React",
  "react-dom": "ReactDOM",
  "react-dom/client": "ReactDOMClient",
  "react/jsx-runtime": "JSX",
};

const plugin: esbuild.Plugin = {
  name: "gas",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      const p = args.path;
      if (args.kind === "entry-point") return undefined;
      if (SHIM[p]) return { path: SHIM[p] };
      let file: string | null = null;
      if (p.startsWith("@/")) file = resolveFile(join(APP_SRC, p.slice(2)));
      else if (p.startsWith(".") && args.importer) file = resolveFile(resolve(dirname(args.importer), p));
      else if (p.startsWith("/")) file = resolveFile(p);
      if (file) return { path: SHIM_BY_FILE[file] ?? file };
      if (VENDOR_MAP[p] && build.initialOptions.globalName !== "__vendorBuild") return { path: p, namespace: "vendor" };
      if (/^(react|react-dom|scheduler)(\/|$)/.test(p)) return { path: Bun.resolveSync(p, GAS) };
      return undefined;
    });
    build.onLoad({ filter: /.*/, namespace: "vendor" }, (args) => ({
      contents: `module.exports = window.__vendor.${VENDOR_MAP[args.path]};`,
      loader: "js",
    }));
    build.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
      const code = readFileSync(args.path, "utf8");
      return { contents: patchSource(args.path, code), loader: args.path.endsWith("x") ? "tsx" : "ts" };
    });
  },
};

async function bundle(entry: string, vendor = false): Promise<string> {
  // esbuild：小さくしたうえで、1行を短く区切る（Apps Script のエディタが重くならないように）
  const r = await esbuild.build({
    entryPoints: [join(GAS, entry)],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    target: "es2020",
    minify: true,
    lineLimit: 160,
    charset: "utf8",
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    jsx: "automatic",
    plugins: [plugin],
    logLevel: "warning",
    ...(vendor ? { globalName: "__vendorBuild" } : {}),
  });
  return r.outputFiles[0].text;
}

// 使っているクラス名を集めて、Tailwind の代わりのCSSを作る
function collectTokens(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|ts)$/.test(f)) {
        const s = readFileSync(p, "utf8");
        for (const m of s.matchAll(/["'`]([^"'`]*)["'`]/g)) out.push(...m[1].split(/[\s{}$]+/));
      }
    }
  };
  dirs.forEach(walk);
  return out.filter((t) => /^[-a-z0-9:/[\]#().%_]+$/i.test(t));
}

async function css(): Promise<string> {
  // いまのアプリと同じ Tailwind（v4）で、使っているクラス名だけのCSSを作る
  const TW = dirname(Bun.resolveSync("tailwindcss/package.json", GAS));
  const read = (p: string) => readFileSync(p, "utf8");
  const globals = read(join(APP_SRC, "app/globals.css"));
  const compiler = await compile(globals, {
    base: join(APP_SRC, "app"),
    loadStylesheet: async (id: string, base: string) => {
      const path = id === "tailwindcss" ? join(TW, "index.css") : id.startsWith("tailwindcss/") ? join(TW, id.slice(12)) : resolve(base, id);
      return { path, base: dirname(path), content: read(path) };
    },
  });
  const twCss = compiler.build(collectTokens([APP_SRC, join(GAS, "src")]));
  const all = twCss + "\n" + read(join(GAS, "src/gas.css"));
  // 古いiPhoneでも読めるように、入れ子の書き方をほどく
  const tmp = join(DIST, "_all.css");
  writeFileSync(tmp, all);
  const r = await Bun.build({ entrypoints: [tmp], target: "browser", minify: { whitespace: true, syntax: true } } as Parameters<typeof Bun.build>[0]);
  rmSync(tmp);
  if (!r.success) throw new Error("CSSを組み立てられませんでした");
  return (await r.outputs[0].text()).replace(/\/\*[\s\S]*?\*\//g, "");
}

function splitParts(js: string): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < js.length) {
    let end = Math.min(js.length, i + PART_SIZE);
    if (end < js.length) {
      const nl = js.lastIndexOf("\n", end);
      if (nl > i) end = nl + 1;
    }
    parts.push(js.slice(i, end));
    i = end;
  }
  return parts;
}

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&display=swap" rel="stylesheet">';

function page(style: string, scripts: string, paramsJs: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<base target="_top">
<meta charset="utf-8">
<meta name="theme-color" content="#123f31">
${FONTS}
<style>
${style}
</style>
</head>
<body class="min-h-dvh antialiased">
<div id="app"></div>
<div id="boot-error" hidden></div>
<script>
var PARAMS = ${paramsJs};
// 動かなかったとき、理由を画面に出す（白い画面のままにしない）
(function () {
  var shown = false;
  function show(msg) {
    var app = document.getElementById("app");
    if (shown || (app && app.childNodes.length)) return;
    shown = true;
    var box = document.getElementById("boot-error");
    box.hidden = false;
    box.innerHTML = '<div class="boot-error__box"><p class="boot-error__title">画面を開けませんでした</p>' +
      '<p>この画面のスクリーンショットをClaudeに送ってください。</p><pre></pre>' +
      '<button type="button" class="btn btn--primary">もう一度読み込む</button></div>';
    box.querySelector("pre").textContent = msg + "\\n（読み込めたファイル：App" + (window.__loaded || 0) + "まで）";
    box.querySelector("button").onclick = function () { location.reload(); };
  }
  window.addEventListener("error", function (e) {
    show((e.message || "エラー") + (e.lineno ? "（" + (e.filename ? e.filename.split("/").pop() : "") + " " + e.lineno + "行）" : ""));
  });
  window.addEventListener("unhandledrejection", function (e) { show(String(e.reason && e.reason.stack || e.reason)); });
  window.addEventListener("load", function () {
    setTimeout(function () { if (!window.__loaded || window.__loaded < 2) show("画面のプログラムが最後まで読み込めませんでした。App1・App2 の貼り付けを確かめてください。"); }, 1500);
  });
})();
</script>
${scripts}
</body>
</html>
`;
}


async function main() {
  if (existsSync(DIST)) rmSync(DIST, { recursive: true });
  mkdirSync(DIST, { recursive: true });
  const style = await css();
  if (style.includes("<?")) throw new Error("CSSに <? が入っています");

  const vendor = (await bundle("src/vendor.ts", true)).replace(/<\/script/gi, "<\\/script");
  const app = (await bundle("src/main.tsx")).replace(/<\/script/gi, "<\\/script");
  // App1＝React、App2＝画面のプログラム。それぞれが1つの完全なプログラム（別々の <script> に入る）
  const parts = [vendor, app];
  const includeLine = parts
    .map((_, i) => `<script>\n<?!= include('App${i + 1}') ?>\n;window.__loaded=${i + 1};\n</script>`)
    .join("\n");
  writeFileSync(join(DIST, "Index.html"), page(style, includeLine, "<?!= params ?>"));
  parts.forEach((p, i) => writeFileSync(join(DIST, `App${i + 1}.html`), p));
  writeFileSync(join(DIST, "Code.gs"), readFileSync(join(GAS, "server/Code.gs"), "utf8"));

  // 試す用
  const dev = (await bundle("src/dev.tsx")).replace(/<\/script/gi, "<\\/script");
  writeFileSync(join(DIST, "dev.html"), page(style, `<script>\n${vendor}\n</script>\n<script>\n${dev}\n</script>`, "{}"));

  const kb = (s: string) => `${Math.round(Buffer.byteLength(s) / 1024)}KB`;
  console.log(`Index.html ${kb(readFileSync(join(DIST, "Index.html"), "utf8"))}`);
  [vendor, app].forEach((p, i) => console.log(`App${i + 1}.html ${kb(p)} ${p.split("\n").length}行`));
  console.log(`Code.gs ${readFileSync(join(DIST, "Code.gs"), "utf8").split("\n").length}行`);
}

await main();
