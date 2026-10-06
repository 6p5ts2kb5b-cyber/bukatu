import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

// 得点板の数字の書体（Barlow Condensed／SIL Open Font License）。数字と英字だけに絞って軽くしています
const numFont = localFont({
  src: [
    { path: "../fonts/BarlowCondensed-SemiBold.woff", weight: "600" },
    { path: "../fonts/BarlowCondensed-Bold.woff", weight: "700" },
    { path: "../fonts/BarlowCondensed-ExtraBold.woff", weight: "800" },
  ],
  variable: "--font-num",
  display: "swap",
});

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
  themeColor: "#123f31",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={numFont.variable}>
      <body className="min-h-dvh antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
