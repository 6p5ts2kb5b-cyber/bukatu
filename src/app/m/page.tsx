import type { Metadata } from "next";
import { SharedLineup } from "./SharedLineup";

// 共有URL（ログインなし）のメンバー表。検索サイトには載せない
export const metadata: Metadata = {
  title: "メンバー表をつくる｜桜・浅羽野・住吉",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Page() {
  return <SharedLineup />;
}
