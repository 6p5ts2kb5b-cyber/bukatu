# STORMクラブ 予定・活動管理アプリ（bukatu）

STORMクラブ（桜中・浅羽野中・住吉中の連合チーム）の活動予定と、準備状況（グラウンド・指導者・審判・テスト休みなど）を管理するWebアプリです。

## 使っているもの

| 名前 | 役割 |
| --- | --- |
| Next.js / TypeScript | アプリ本体のプログラム |
| Firebase（プロジェクト名：bukatu） | データの保存（Firestore）とGoogleログイン（Authentication） |
| GitHub | プログラムの保管庫（このページ） |
| Vercel | アプリをインターネットに公開 |

## 設定について

Firebaseの接続設定は、このGitHubには保存しません。Vercelの「Settings → Environment Variables」に `NEXT_PUBLIC_FIREBASE_CONFIG` という名前で設定します。書き方は `.env.example` を見てください。

## 開発の進み具合

- [x] STEP1 基本環境（公開・Firebase設定の確認）
- [ ] STEP2 Googleログイン
- [ ] STEP3 スタッフマスター・権限
