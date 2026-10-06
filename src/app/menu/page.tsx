"use client";

// メニュー画面です。用途ごとにまとめて並べます。

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useMe } from "@/components/AppShell";
import { PageHead, SecondaryButton } from "@/components/ui";

const I = {
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  print: "M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z",
  diamond: "M12 3l9 9-9 9-9-9zM12 8.5l3.5 3.5-3.5 3.5-3.5-3.5z",
  cap: "M4 14a8 8 0 0 1 16 0v1H4zM2 15h20M12 6V4",
  school: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.4c2.1.7 3.5 2.6 3.5 5.6",
};

const GROUPS: { label: string; items: { href: string; label: string; desc: string; icon: string; red?: boolean }[] }[] = [
  {
    label: "予定",
    items: [
      { href: "/activities", label: "予定一覧", desc: "これからの予定と過去の予定", icon: I.calendar },
      { href: "/print", label: "保護者配布用の印刷", desc: "学校ごとの月間予定表（A4）", icon: I.print, red: true },
    ],
  },
  {
    label: "試合",
    items: [
      { href: "/lineups", label: "メンバー表", desc: "守備位置と打順を決めて印刷", icon: I.diamond },
      { href: "/players", label: "選手名簿", desc: "背番号・学校・学年", icon: I.cap },
    ],
  },
  {
    label: "管理",
    items: [
      { href: "/teams", label: "学校", desc: "合同チームを組む学校", icon: I.school },
      { href: "/staff", label: "スタッフ名簿", desc: "アプリに入れる人", icon: I.people },
    ],
  },
];

export default function MenuPage() {
  const me = useMe();
  const { logOut } = useAuth();
  return (
    <>
      <PageHead kicker="MENU" title="メニュー" />
      {GROUPS.map((g) => (
        <section key={g.label} className="flex flex-col gap-1.5">
          <p className="group-label">{g.label}</p>
          <ul className="list">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link href={i.href} className="row">
                  <span className={`row__icon${i.red ? " row__icon--red" : ""}`} aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={i.icon} />
                    </svg>
                  </span>
                  <span className="row__main">
                    <span className="row__title">{i.label}</span>
                    <span className="row__sub">{i.desc}</span>
                  </span>
                  <span className="row__chev" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="flex flex-col gap-1.5">
        <p className="group-label">ログイン中</p>
        <div className="panel flex flex-col gap-3">
          <div>
            <p className="text-base font-extrabold">{me.name}</p>
            <p className="break-all text-sm font-semibold text-navy-soft">{me.email}</p>
          </div>
          <SecondaryButton onClick={logOut}>ログアウト</SecondaryButton>
        </div>
      </section>
    </>
  );
}
