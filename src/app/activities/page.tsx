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
  weekday,
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

// まだ予定が入っていない日の行（押すとその日の予定を作る）
function BlankCard({ date }: { date: string }) {
  const wd = weekday(date);
  return (
    <Link href={`/activities/new?date=${date}`} className="blank-card">
      <span className="blank-card__date">
        <b>{Number(date.slice(8))}</b>
        <span className={wd === "土" ? "pl-sat" : wd === "日" ? "pl-sun" : undefined}>{wd}</span>
      </span>
      <span className="blank-card__text">まだ予定が入っていません</span>
      <span className="blank-card__add">＋ 入れる</span>
    </Link>
  );
}

// 今日から、予定が入っている最後の月の末日まで（ただし来月末まで）で、予定が1つもない日
function blankDates(list: Activity[]): string[] {
  const real = new Set(list.filter((a) => a.groups.length > 0).map((a) => a.date));
  const last = list.reduce((m, a) => (a.date > m ? a.date : m), "");
  if (!last) return [];
  const [ly, lm] = last.split("-").map(Number);
  const t = new Date(`${todayString()}T00:00:00`);
  const cap = new Date(t.getFullYear(), t.getMonth() + 2, 0); // 来月末
  const lastEnd = new Date(ly, lm, 0);
  const end = lastEnd < cap ? lastEnd : cap;
  const out: string[] = [];
  const d = new Date(`${todayString()}T00:00:00`);
  while (d <= end) {
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!real.has(s)) out.push(s);
    d.setDate(d.getDate() + 1);
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
              {m.year}年・{m.items.filter((a) => !a.id.startsWith("blank-")).length}件
            </span>
          </h2>
          <ul className={`month-group flex flex-col gap-2.5 ${faded ? "opacity-75" : ""}`}>
            {m.items.map((a) => (
              <li key={a.id}>
                {a.id.startsWith("blank-") ? (
                  <BlankCard date={a.date} />
                ) : (
                  <ActivityCard activity={a} reserves={reserves.get(a.date)} />
                )}
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
    const all = [...upcoming, ...extra];
    // 予定が入っていない日も、一覧の中に「まだ予定が入っていません」の行を入れる
    const blanks = blankDates(upcoming)
      .filter((d) => !all.some((a) => a.date === d))
      .map((d) => ({ id: `blank-${d}`, date: d, note: "", groups: [] }) as Activity);
    return [...all, ...blanks].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  }, [past, upcoming]);
  const blanks = useMemo(() => (upcoming ? blankDates(upcoming) : []), [upcoming]);
  const blankMonths = useMemo(() => [...new Set(blanks.map((d) => d.slice(0, 7)))], [blanks]);

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
      {blanks.length > 0 && (
        <section className="blank-warn mb-3">
          <p className="blank-warn__title">まだ予定が入っていない日が {blanks.length}日 あります</p>
          <p className="blank-warn__body">
            一覧の中の「まだ予定が入っていません」の行を押すと、その日を入れられます。平日などは、月ごとにまとめて入れると早いです。
          </p>
          <div className="flex flex-wrap gap-2">
            {blankMonths.map((mo) => (
              <Link key={mo} href={`/activities/bulk?month=${mo}&blank=1`} className="blank-warn__day">
                {Number(mo.slice(5))}月の空いている日をまとめて入力（{blanks.filter((d) => d.startsWith(mo)).length}日）
              </Link>
            ))}
          </div>
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
