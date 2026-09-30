# STORMクラブ 予定・活動管理アプリ

STORMクラブ（桜中・浅羽野中・住吉中の連合チーム）の活動予定と、準備状況（グラウンド・指導者・審判・テスト休みなど）を管理するWebアプリです。

## 使っているもの

| 名前 | 役割 |
| --- | --- |
| Next.js / TypeScript | アプリ本体のプログラム |
| Supabase | データの保存とGoogleログイン |
| GitHub | プログラムの保管庫（このページ） |
| Vercel | アプリをインターネットに公開 |

## 秘密情報について

Supabaseの接続情報などは、このGitHubには保存しません。Vercelの「Settings → Environment Variables」に設定します。必要な項目名は `.env.example` を見てください。

## 開発の進み具合

- [x] STEP1 基本環境（公開・Supabase接続の確認）
- [ ] STEP2 Googleログイン
- [ ] STEP3 スタッフマスター・権限
