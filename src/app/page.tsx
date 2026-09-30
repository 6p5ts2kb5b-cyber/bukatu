"use client";

// ホーム画面です。直近の活動をカードで表示します。
// （「まだ決まっていないこと」の表示は、この先のSTEPで追加します）

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityCard } from "@/components/ActivityCard";
import { useMe } from "@/components/AppShell";
import { ErrorText } from "@/components/ui";
import { listUpcoming, type Activity } from "@/lib/activities";

export default function Home() {
  const me = useMe();
  const [upcoming, setUpcoming] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUpcoming()
      .then((list) => setUpcoming(list.slice(0, 3)))
      .catch(() => setError("予定を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, []);

  return (
    <>
      <p className="px-1 text-base font-bold text-navy-soft">{me.name} さん、こんにちは</p>

      <h2 className="px-1 text-xl font-extrabold">直近の活動</h2>
      {error && <ErrorText>{error}</ErrorText>}
      {!upcoming && !error && <p className="py-6 text-center text-sm text-navy-soft/70">読み込み中…</p>}
      {upcoming && upcoming.length === 0 && (
        <div className="rounded-2xl bg-white p-5 text-center ring-1 ring-navy/5">
          <p className="text-base text-navy-soft/80">これからの予定はまだありません。</p>
          <Link
            href="/activities/new"
            className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-navy px-4 text-base font-bold text-white active:bg-navy-soft"
          >
            ＋ 最初の予定を登録する
          </Link>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {upcoming?.map((a) => (
          <li key={a.id}>
            <ActivityCard activity={a} />
          </li>
        ))}
      </ul>
      {upcoming && upcoming.length > 0 && (
        <Link href="/activities" className="py-2 text-center text-base font-bold text-navy-soft underline">
          すべての予定を見る
        </Link>
      )}
    </>
  );
}
