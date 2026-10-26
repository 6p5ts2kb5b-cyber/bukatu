# 部活アプリ GAS版（Google Apps Script）

いまのアプリ（Next.js＋Firebase、`../src`）を、**Googleのスプレッドシート＋Googleログインだけで動く**形にしたものです。
いまのアプリ（Vercel・Firebase）はそのまま残しています（このフォルダは `gas-version` という枝に保存）。

## 貼り付けるファイル（`dist/`）

| ファイル | Apps Script での名前 | 中身 |
| --- | --- | --- |
| `dist/Code.gs` | `コード.gs`（最初からあるもの） | サーバー側：スプレッドシートの読み書き・ログインした人の確認・共有 |
| `dist/Index.html` | `Index` | 画面の入れ物（見た目） |
| `dist/App1.html` … | `App1` … | 画面のプログラム（大きいので分けています。中身は読まなくて大丈夫） |

最初に `setup` を1回実行すると、シートの見出し・最初のデータ（学校3校・持ち物15品目・会場3校）・大会運営用のスプレッドシート・設定（スクリプト プロパティ）を自動で作ります。

## しくみ（開発する人向け）

- 画面と計算は、いまのアプリのコード（`../src`）を**そのまま**使い、`build.ts` で1つのプログラムに組み立てます。
- 差しかえているのは Firebase と Next.js の部分だけです（`src/shim/`）。
  - `firebase/firestore` → 開いたときにまとめて読んだデータを画面の中に持ち、保存は先に画面を変えて、うしろでサーバーに送る（`src/shim/firestore.ts`）
  - `next/link`・`next/navigation` → `#` のうしろで画面を切り替え、`google.script.history` で戻る・進む（`src/shim/router.ts`）
- 見た目は、いまのアプリと同じ Tailwind（v4）と `design.css` から作ります。

```
bun build.ts                 # dist/ を作る
node test/server.test.mjs    # サーバー側（Code.gs）を偽のスプレッドシートで確かめる
node test/sim.mjs            # GASと同じ組み立てをして、試す用のページを作る
```

秘密の情報（パスワード・キーなど）はコードに書きません。スプレッドシートのIDなどは、setup が「スクリプト プロパティ」に入れます。
