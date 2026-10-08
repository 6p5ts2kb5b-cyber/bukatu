"use client";

// 活動予定の一覧画面です。月ごとに区切って並べます。

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ActivityCard } from "@/components/ActivityCard";
import { ErrorText, Loading, PageHead, SecondaryButton, cssVars } from "@/components/ui";
import {
  listPast,
  listUpcoming,
  reserveOnlyDays,
  reservesByDate,
  todayString,
  type Activity,
  type ReserveInfo,
} from "@/lib/activities";

// 月ごとにまとめる
function byMonth(list: Activity[]): { key: string; year: number; month: number; items: Activity[] }[] {
  const out: { key: string; year: number; month: number; items: Activity[] }[] = [];
  for (const a of list) {
    const key = a.date.slice(0, 7);
    let g = out.find((x) => x.key === key);
    if (!g) {
      g = { key, year: Number(a.date.slice(0, 4)), month: Number(a.date.slice(5, 7)), items: [] };
      out.push(g);
    }
    g.items.push(a);
  }
  return out;
}

function MonthList({ list, faded, reserves }: { list: Activity[]; faded?: boolean; reserves: Map<string, ReserveInfo[]> }) {
  return (
    <>
      {byMonth(list).map((m, mi) => (
        <Fragment key={m.key}>
          <h2 className="month-head">
            <span className="tile" style={cssVars({ "--i": mi })}>
              {m.month}
            </span>
            <b>月</b>
            <span>
              {m.year}年・{m.items.length}件
            </span>
          </h2>
          <ul className={`month-group flex flex-col gap-2.5 ${faded ? "opacity-75" : ""}`}>
            {m.items.map((a) => (
              <li key={a.id}>
                <ActivityCard activity={a} reserves={reserves.get(a.date)} />
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </>
  );
}

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

  // 大会の予備日（予定がない日も「予備日」として並べる）
  const reserves = useMemo(() => reservesByDate([...(past ?? []), ...(upcoming ?? [])]), [past, upcoming]);
  const withReserve = useMemo(() => {
    if (!upcoming) return [];
    const extra = reserveOnlyDays([...(past ?? []), ...upcoming], todayString(), "9999-12-31");
    return [...upcoming, ...extra].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  }, [past, upcoming]);

  return (
    <>
      <PageHead
        kicker="SCHEDULE"
        title="予定"
        action={
          <div className="flex shrink-0 gap-2">
            <Link href="/activities/bulk" className="btn btn--ghost btn--small">
              まとめて入力
            </Link>
            <Link href="/print" className="btn btn--ghost btn--small">
              印刷
            </Link>
          </div>
        }
      />

      {error && <ErrorText>{error}</ErrorText>}
      {!upcoming && !error && <Loading />}
      {upcoming && upcoming.length === 0 && (
        <section className="panel text-center">
          <p className="text-base font-extrabold">これからの予定はまだありません</p>
          <p className="mt-1 text-sm text-navy-soft">下の「予定を追加」から登録できます。</p>
        </section>
      )}
      {upcoming && <MonthList list={withReserve} reserves={reserves} />}

      <div className="mt-3">
        {!showPast ? (
          <SecondaryButton onClick={() => setShowPast(true)}>過去の予定を見る</SecondaryButton>
        ) : (
          <>
            <p className="group-label">過去の予定</p>
            {!past && <Loading />}
            {past && past.length === 0 && (
              <p className="py-4 text-center text-sm text-navy-soft">過去の予定はありません。</p>
            )}
            {past && <MonthList list={past} faded reserves={reserves} />}
          </>
        )}
      </div>
    </>
  );
}
