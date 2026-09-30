"use client";

// メニュー画面です。名簿の管理やログアウトはここから行います。

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useMe } from "@/components/AppShell";
import { Card, SecondaryButton } from "@/components/ui";

const ITEMS = [
  { href: "/activities", label: "予定一覧", desc: "これからの予定と過去の予定" },
  { href: "/print", label: "印刷（保護者配布用）", desc: "学校ごとの月間予定表をA4で印刷" },
  { href: "/lineups", label: "メンバー表", desc: "守備位置と打順を決めて印刷" },
  { href: "/players", label: "選手名簿", desc: "メンバー表で使う選手の登録" },
  { href: "/teams", label: "学校（合同チーム）", desc: "桜中・浅羽野中・住吉中などの名簿" },
  { href: "/staff", label: "スタッフ名簿", desc: "アプリに入れる人の登録" },
];

export default function MenuPage() {
  const me = useMe();
  const { logOut } = useAuth();
  return (
    <>
      <h1 className="px-1 text-xl font-extrabold">メニュー</h1>
      <ul className="flex flex-col gap-3">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="flex min-h-16 items-center justify-between rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy/5 active:bg-field"
            >
              <span>
                <span className="block text-lg font-extrabold">{i.label}</span>
                <span className="block text-sm text-navy-soft/70">{i.desc}</span>
              </span>
              <span className="text-2xl text-navy-soft/40" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Card>
        <p className="text-sm text-navy-soft/70">ログイン中のアカウント</p>
        <p className="mt-1 text-base font-bold">{me.name}</p>
        <p className="break-all text-sm text-navy-soft/70">{me.email}</p>
        <div className="mt-4">
          <SecondaryButton onClick={logOut}>ログアウト</SecondaryButton>
        </div>
      </Card>
    </>
  );
}
