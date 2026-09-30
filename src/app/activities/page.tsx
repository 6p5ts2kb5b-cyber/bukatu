"use client";

// 活動予定の一覧画面です。

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityCard } from "@/components/ActivityCard";
import { ErrorText, SecondaryButton } from "@/components/ui";
import { listPast, listUpcoming, type Activity } from "@/lib/activities";

export default function ActivitiesPage() {
  const [upcoming, setUpcoming] = useState<Activity[] | null>(null);
  const [past, setPast] = useState<Activity[] | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUpcoming()
      .then(setUpcoming)
      .catch(() => setError("予定を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, []);

  useEffect(() => {
    if (!showPast || past) return;
    listPast()
      .then(setPast)
      .catch(() => setError("過去の予定を読み込めませんでした。"));
  }, [showPast, past]);

  return (
    <>
      <div className="flex items-center justify-between px-1">
        <h1 className="text-xl font-extrabold">予定一覧</h1>
        <Link
          href="/activities/new"
          className="flex min-h-12 items-center rounded-xl bg-navy px-4 text-base font-bold text-white active:bg-navy-soft"
        >
          ＋ 予定
        </Link>
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {!upcoming && !error && <p className="py-6 text-center text-sm text-navy-soft/70">読み込み中…</p>}
      {upcoming && upcoming.length === 0 && (
        <p className="rounded-2xl bg-white p-5 text-center text-base text-navy-soft/80 ring-1 ring-navy/5">
          これからの予定はまだありません。
          <br />
          右上の「＋ 予定」から登録できます。
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {upcoming?.map((a) => (
          <li key={a.id}>
            <ActivityCard activity={a} />
          </li>
        ))}
      </ul>

      <Link
        href="/print"
        className="flex min-h-12 items-center justify-center rounded-xl bg-white px-4 text-base font-bold ring-1 ring-navy/15 active:bg-field"
      >
        🖨 月間予定表を印刷する
      </Link>

      {!showPast ? (
        <SecondaryButton onClick={() => setShowPast(true)}>過去の予定を見る</SecondaryButton>
      ) : (
        <>
          <h2 className="mt-4 px-1 text-lg font-extrabold text-navy-soft/80">過去の予定</h2>
          {!past && <p className="py-4 text-center text-sm text-navy-soft/70">読み込み中…</p>}
          {past && past.length === 0 && (
            <p className="text-center text-sm text-navy-soft/70">過去の予定はありません。</p>
          )}
          <ul className="flex flex-col gap-3 opacity-80">
            {past?.map((a) => (
              <li key={a.id}>
                <ActivityCard activity={a} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
