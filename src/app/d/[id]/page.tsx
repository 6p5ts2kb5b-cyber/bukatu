import type { Metadata } from "next";
import { DoseiForm } from "./DoseiForm";

// 動静表の記入ページ（ログインなし）。検索サイトには載せない
export const metadata: Metadata = {
  title: "動静表の記入｜桜・浅羽野・住吉",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Page() {
  return <DoseiForm />;
}
