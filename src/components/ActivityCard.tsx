"use client";

// 一覧やホームに出す「活動カード」です。

import Link from "next/link";
import {
  divisionLabel,
  formatDate,
  todayString,
  weekdayColor,
  type Activity,
  type ActivityGroup,
  isMatchType,
  isOffType,
} from "@/lib/activities";

function daysUntil(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [ty, tm, td] = todayString().split("-").map(Number);
  const ms = new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime();
  return Math.round(ms / 86400000);
}

function whenLabel(date: string): string | null {
  const n = daysUntil(date);
  if (n === 0) return "今日";
  if (n === 1) return "明日";
  if (n > 1 && n <= 7) return `${n}日後`;
  return null;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const missing = !value;
  return (
    <div className="flex gap-3 py-1">
      <dt className="w-16 shrink-0 text-sm font-bold text-navy-soft/70">{label}</dt>
      <dd className={`text-base ${strong ? "font-extrabold" : "font-bold"} ${missing ? "text-[#8a6500]" : ""}`}>
        {missing ? "▲ 未入力" : value}
      </dd>
    </div>
  );
}

function timeRange(start: string, end: string): string {
  if (!start && !end) return "";
  return `${start || "？"}〜${end || ""}`;
}

// 「vs 坂戸中・鶴ヶ島中」「合同：鶴ヶ島中」の表示
function Opponents({ g }: { g: ActivityGroup }) {
  if (isMatchType(g.type)) {
    const names = g.games.map((x) => x.opponent).filter(Boolean);
    return (
      <p className={`mt-1 text-lg font-extrabold ${names.length ? "" : "text-[#8a6500]"}`}>
        {names.length ? `vs ${[...new Set(names)].join("・")}` : "▲ 対戦相手 未入力"}
      </p>
    );
  }
  if (g.type === "合同練習") {
    return (
      <p className={`mt-1 text-lg font-extrabold ${g.partners.length ? "" : "text-[#8a6500]"}`}>
        {g.partners.length ? `合同：${g.partners.join("・")}` : "▲ 合同練習の相手 未入力"}
      </p>
    );
  }
  return null;
}

function GroupDetails({ g }: { g: ActivityGroup }) {
  // 平日の「部活あり」：再登校のときだけ詳細を出す
  if (g.type === "部活あり") {
    if (!g.returnToSchool) return null;
    return (
      <dl className="mt-2 border-t border-navy/10 pt-2">
        <Row label="再登校" value={g.returnTime} strong />
        <Row label="会場" value={g.venue} />
        <Row label="持ち物" value={g.packing.join("・")} />
      </dl>
    );
  }
  const meet = [g.meetTime, g.meetPlace].filter(Boolean).join("　");
  return (
    <dl className="mt-2 border-t border-navy/10 pt-2">
      <Row label="会場" value={g.venue} />
      <Row label="時間" value={timeRange(g.startTime, g.endTime)} />
      {isMatchType(g.type) &&
        g.games.map((x, i) => (
          <Row
            key={i}
            label={`第${i + 1}試合`}
            value={[x.startTime && `${x.startTime}開始`, x.opponent && `vs ${x.opponent}`].filter(Boolean).join("　")}
          />
        ))}
      <Row label="集合" value={meet} strong />
      <Row label="持ち物" value={g.packing.join("・")} />
    </dl>
  );
}

export function ActivityCard({ activity }: { activity: Activity }) {
  const when = whenLabel(activity.date);
  const [date, wd] = formatDate(activity.date).split("（");
  return (
    <Link
      href={`/activities/${activity.id}`}
      className="block rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy/5 active:bg-field"
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl font-extrabold">{date}</span>
        <span className={`text-lg font-extrabold ${weekdayColor(activity.date)}`}>（{wd}</span>
        {when && (
          <span className="ml-auto rounded-full bg-stitch px-3 py-1 text-sm font-bold text-white">
            {when}
          </span>
        )}
      </div>
      <ul className="mt-3 flex flex-col gap-4">
        {activity.groups.map((g) => (
          <li key={g.division}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              {g.division !== "main" && (
                <span className="rounded-md bg-navy/5 px-2 py-0.5 text-sm font-bold text-navy-soft">
                  {divisionLabel(g.division)}
                </span>
              )}
              <span className={`text-lg font-bold ${isOffType(g.type) ? "text-navy-soft/50" : ""}`}>
                {g.type}
              </span>
              {g.tournamentName && <span className="text-base text-navy-soft/80">{g.tournamentName}</span>}
            </div>
            <Opponents g={g} />
            {!isOffType(g.type) && <GroupDetails g={g} />}
          </li>
        ))}
      </ul>
      {activity.note && <p className="mt-2 text-sm text-navy-soft/80">{activity.note}</p>}
      <p className="mt-3 text-sm font-bold text-navy-soft/60">詳しく見る ›</p>
    </Link>
  );
}
