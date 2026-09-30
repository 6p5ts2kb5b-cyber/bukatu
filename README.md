# 桜・浅羽野・住吉 予定・活動管理アプリ（bukatu）

桜中・浅羽野中・住吉中の連合チームの活動予定と、準備状況（グラウンド・指導者・審判・テスト休みなど）を管理するWebアプリです。

## 使っているもの

| 名前 | 役割 |
| --- | --- |
| Next.js / TypeScript | アプリ本体のプログラム |
| Firebase（プロジェクト名：bukatu） | データの保存（Firestore）とGoogleログイン（Authentication） |
| GitHub | プログラムの保管庫（このページ） |
| Vercel | アプリをインターネットに公開 |

## 設定について

Firebaseの接続設定は `src/lib/firebase-config.ts` に書いてあります。これはアプリの住所のようなもので、パスワードではありません（データはFirebaseのセキュリティルールで守ります）。本当の秘密情報（パスワードなど）はGitHubに保存しません。

## 開発の進み具合

- [x] STEP1 基本環境（公開・Firebase設定の確認）
- [x] STEP2 Googleログイン（画面側）
- [ ] STEP3 スタッフマスター・権限
