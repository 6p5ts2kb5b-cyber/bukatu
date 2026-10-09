"use client";

// 活動予定の一覧画面です。上の月のボタンで、1か月ずつ表示します。

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActivityCard } from "@/components/ActivityCard";
import { ErrorText, Loading, PageHead } from "@/components/ui";
import {
  listRange,
  reserveOnlyDays,
  reservesByDate,
  todayString,
  weekday,
  type Activity,
  type ReserveInfo,
} from "@/lib/activities";

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

// "YYYY-MM" を offset か月ずらす
function shiftMonth(ym: string, offset: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SAVED_KEY = "bukatu.activities.month";

export default function ActivitiesPage() {
  const thisMonth = todayString().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [list, setList] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 前に見ていた月を覚えておく（予定を開いて戻ってきたとき用）
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SAVED_KEY);
      if (saved && /^\d{4}-\d{2}$/.test(saved)) setMonth(saved);
    } catch {
      /* 使えないときは今月のまま */
    }
  }, []);
  const choose = (mo: string) => {
    setMonth(mo);
    try {
      sessionStorage.setItem(SAVED_KEY, mo);
    } catch {
      /* 何もしない */
    }
  };

  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  useEffect(() => {
    setList(null);
    setError(null);
    // 前の月の大会の予備日がこの月に来ることがあるので、少し前から読む
    const d = new Date(y, m - 1, 1);
    d.setDate(d.getDate() - 60);
    listRange(ymd(d), last)
      .then(setList)
      .catch(() => setError("予定を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const reserves = useMemo(() => reservesByDate(list ?? []), [list]);
  const today = todayString();

  // この月の行：予定・予備日だけの日・まだ入っていない日（今日以降）
  const rows = useMemo(() => {
    if (!list) return [];
    const inMonth = list.filter((a) => a.date >= first && a.date <= last);
    const extra = reserveOnlyDays(list, first, last);
    const all = [...inMonth, ...extra];
    const blanks: Activity[] = [];
    for (let d = 1; d <= Number(last.slice(8)); d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      if (date < today) continue;
      if (!all.some((a) => a.date === date && (a.groups.length > 0 || a.id.startsWith("reserve-"))))
        blanks.push({ id: `blank-${date}`, date, note: "", groups: [] });
    }
    return [...all, ...blanks].sort((x, z) => (x.date < z.date ? -1 : x.date > z.date ? 1 : 0));
  }, [list, first, last, month, today]);
  const blankCount = rows.filter((a) => a.id.startsWith("blank-")).length;
  const count = rows.filter((a) => !a.id.startsWith("blank-") && !a.id.startsWith("reserve-")).length;

  const months = [-2, -1, 0, 1, 2, 3].map((o) => shiftMonth(thisMonth, o));

  return (
    <>
      <PageHead
        kicker="SCHEDULE"
        title="予定"
        action={
          <div className="flex shrink-0 gap-2">
            <Link href={`/activities/bulk?month=${month}`} className="btn btn--ghost btn--small">
              まとめて入力
            </Link>
            <Link href="/print" className="btn btn--ghost btn--small">
              印刷
            </Link>
          </div>
        }
      />

      {/* 月の切りかえ */}
      <nav className="mon-nav" aria-label="表示する月">
        <button type="button" className="mon-nav__arrow" onClick={() => choose(shiftMonth(month, -1))} aria-label="前の月">
          ‹
        </button>
        <div className="mon-nav__list">
          {months.map((mo) => (
            <button
              key={mo}
              type="button"
              className={`mon-nav__btn${mo === thisMonth ? " is-now" : ""}`}
              aria-pressed={mo === month}
              onClick={() => choose(mo)}
            >
              <b>{Number(mo.slice(5))}</b>月
            </button>
          ))}
        </div>
        <button type="button" className="mon-nav__arrow" onClick={() => choose(shiftMonth(month, 1))} aria-label="次の月">
          ›
        </button>
      </nav>

      <div className="mon-title">
        <h2>
          {y}年<b>{m}</b>月
        </h2>
        <span>
          予定 {count}件{blankCount > 0 && <em>・未入力 {blankCount}日</em>}
        </span>
        {month !== thisMonth && (
          <button type="button" className="mon-title__today" onClick={() => choose(thisMonth)}>
            今月へ
          </button>
        )}
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {!list && !error && <Loading />}

      {list && blankCount > 0 && (
        <section className="blank-warn mb-3">
          <p className="blank-warn__title">
            {m}月は、まだ予定が入っていない日が {blankCount}日 あります
          </p>
          <p className="blank-warn__body">
            下の「まだ予定が入っていません」の行を押すと、その日を入れられます。平日などはまとめて入れると早いです。
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/activities/bulk?month=${month}&blank=1`} className="blank-warn__day">
              {m}月の空いている日をまとめて入力
            </Link>
          </div>
        </section>
      )}

      {list && rows.length === 0 && (
        <section className="panel text-center">
          <p className="text-base font-extrabold">{m}月の予定はありません</p>
          <p className="mt-1 text-sm text-navy-soft">下の「予定を追加」から登録できます。</p>
        </section>
      )}

      {list && rows.length > 0 && (
        <ul className="month-group flex flex-col gap-2.5">
          {rows.map((a) => (
            <li key={a.id} className={a.date < today ? "opacity-60" : undefined}>
              {a.id.startsWith("blank-") ? (
                <BlankCard date={a.date} />
              ) : (
                <ActivityCard activity={a} reserves={reserves.get(a.date)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {list && (
        <div className="mon-foot">
          <button type="button" className="btn btn--ghost btn--small" onClick={() => choose(shiftMonth(month, -1))}>
            ‹ {Number(shiftMonth(month, -1).slice(5))}月
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => choose(shiftMonth(month, 1))}>
            {Number(shiftMonth(month, 1).slice(5))}月 ›
          </button>
        </div>
      )}
    </>
  );
}
