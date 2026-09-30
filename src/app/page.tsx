"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useMe } from "@/components/AppShell";

export default function Home() {
  const me = useMe();
  const { logOut } = useAuth();

  return (
    <>
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy/5">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-3 py-1 text-sm font-bold text-ok ring-1 ring-ok/30">
          <span aria-hidden>●</span>ログイン中
        </p>
        <h2 className="mt-3 text-xl font-extrabold">{me.name} さん、こんにちは</h2>
        <p className="mt-1 break-all text-sm text-navy-soft/80">{me.email}</p>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy/5">
        <h2 className="text-lg font-extrabold">直近の活動</h2>
        <p className="mt-2 text-sm text-navy-soft/80">
          活動予定の登録は、この先のSTEPで作ります。ここに「次の活動」と「やること」が表示されるようになります。
        </p>
        <Link
          href="/staff"
          className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-navy px-4 text-base font-bold text-white active:bg-navy-soft"
        >
          スタッフ名簿を開く
        </Link>
      </section>

      <button
        type="button"
        onClick={logOut}
        className="min-h-12 w-full rounded-xl bg-white px-4 text-base font-bold ring-1 ring-navy/10 active:bg-field"
      >
        ログアウト
      </button>
    </>
  );
}
