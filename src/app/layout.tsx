import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "桜・浅羽野・住吉",
  description: "桜・浅羽野・住吉 連合チームの予定・活動管理アプリ",
  appleWebApp: { capable: true, title: "桜浅羽野住吉", statusBarStyle: "default" },
  // 公開中のプログラムの版（GitHubの保存番号）。動作確認用
  other: { "app-version": (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7) },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1f3a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
