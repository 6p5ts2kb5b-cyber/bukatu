"use client";

// 一覧やホームに出す「活動カード」です。
// 左に得点板のめくり数字で日付、右にその日の区分ごとの予定を並べます。
// featured（ホームの一番上の「次の活動」）は、日付を上の帯に大きく出します。
// 見た目は design.css の .acard で決めています。

import Link from "next/link";
import type { ReactNode } from "react";
import {
  divisionLabel,
  gameLabel,
  gameStart,
  isRef,
  formatDate,
  tournamentTitle,
  reserveLabel,
  reserveView,
  heldPlanText,
  typeLabel,
  type ReserveInfo,
  isOthersGame,
  ourOpponents,
  isMatchType,
  isOffType,
  todayString,
  weekday,
  type Activity,
  type ActivityGroup,
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

const MISSING = <span className="acard__missing">未入力</span>;

// 「9:00」のような時刻は得点板の数字の書体で
function Num({ children }: { children: string }) {
  return <span className="num">{children}</span>;
}

function timeRange(start: string, end: string) {
  if (!start && !end) return null;
  return <Num>{`${start || "?"}〜${end || ""}`}</Num>;
}

function Rows({ items }: { items: [string, ReactNode | null][] }) {
  return (
    <dl className="acard__rows">
      {items.map(([label, value], i) => (
        <div key={i} className="contents">
          <dt>{label}</dt>
          <dd>{value ?? MISSING}</dd>
        </div>
      ))}
    </dl>
  );
}

function packing(g: ActivityGroup) {
  return g.packing.length ? g.packing.join("・") : null;
}

function meet(g: ActivityGroup) {
  if (!g.meetTime && !g.meetPlace) return null;
  return (
    <span className="meet">
      {g.meetTime && <Num>{g.meetTime}</Num>}
      {g.meetTime && g.meetPlace && "　"}
      {g.meetPlace}
    </span>
  );
}

// 「VS 坂戸中・鶴ヶ島中」「合同：鶴ヶ島中」
function Opponents({ g }: { g: ActivityGroup }) {
  if (isMatchType(g.type)) {
    // 「第1試合の勝者」のようなまだ決まっていない相手は、VSの行には出さない（試合の行に出る）
    const names = ourOpponents(g.games).filter((t) => !isRef(t));
    if (!names.length && g.games.length) return null;
    return names.length ? (
      <p className="acard__vs">
        <b>VS</b>
        {names.join("・")}
      </p>
    ) : (
      <p className="acard__vs">
        <span className="acard__missing">対戦相手 未入力</span>
      </p>
    );
  }
  if (g.type === "合同練習") {
    return g.partners.length ? (
      <p className="acard__vs">合同：{g.partners.join("・")}</p>
    ) : (
      <p className="acard__vs">
        <span className="acard__missing">合同練習の相手 未入力</span>
      </p>
    );
  }
  return null;
}

function GroupDetails({ g }: { g: ActivityGroup }) {
  if (isOffType(g.type)) return null;
  // 平日の「部活あり」：再登校のときだけ詳細を出す
  if (g.type === "部活あり") {
    if (!g.returnToSchool) return null;
    return (
      <Rows
        items={[
          ["再登校", g.returnTime ? <span className="meet"><Num>{g.returnTime}</Num></span> : null],
          ["会場", g.venue || null],
          ["持ち物", packing(g)],
        ]}
      />
    );
  }
  const items: [string, ReactNode | null][] = [["会場", g.venue || null]];
  if (g.venueStation) items.push(["最寄駅", g.venueStation]);
  if (g.reserveDate)
    items.push(["予備日", `${formatDate(g.reserveDate)}${g.reserveVenue ? `　${g.reserveVenue}` : ""}`]);
  if (isMatchType(g.type) && g.games.length > 0) {
    g.games.forEach((x, i) =>
      items.push([
        `第${i + 1}試合`,
        gameStart(x) || gameLabel(x) ? (
          <span className={isOthersGame(x) ? "acard__others" : undefined}>
            {x.afterLunch ? gameStart(x) : x.startTime && <Num>{x.startTime}</Num>}
            {gameStart(x) && gameLabel(x) && "　"}
            {gameLabel(x)}
            {isOthersGame(x) && "（観戦・補助役員）"}
          </span>
        ) : null,
      ]),
    );
  } else {
    items.push(["時間", timeRange(g.startTime, g.endTime)]);
  }
  items.push(["集合", meet(g)], ["持ち物", packing(g)]);
  return <Rows items={items} />;
}

// 大会の予備日の帯：決まるまでは「延期のとき」と「実施のとき」を並べ、決まったら1つだけ大きく出す
function ReserveBanner({ reserves, activity }: { reserves: ReserveInfo[]; activity: Activity }) {
  const view = reserveView(activity.reserveStatus, reserves, activity.groups);
  if (view.mode !== "both") {
    return (
      <div className={`acard__decided${view.mode === "tournament" ? " acard__decided--game" : ""}`}>
        <p className={`acard__decided-head${view.rest ? " is-rest" : ""}`}>{view.head}</p>
        {view.venue && <p className="acard__decided-venue">{view.venue}</p>}
        <p className="acard__decided-why">{view.reason}</p>
      </div>
    );
  }
  return (
    <div className="acard__reserve">
      <p className="acard__reserve-title">
        <span aria-hidden>☂</span> {reserves.map(reserveLabel).join("・")} の予備日
      </p>
      <p className="acard__reserve-row">
        <span className="acard__if acard__if--rain">延期のとき</span>
        <span>
          {reserves.map((r) => r.title).join("・")}
          {reserves[0].venue && <small>（{reserves.map((r) => r.venue).filter(Boolean).join("・")}）</small>}
        </span>
      </p>
      <p className="acard__reserve-row">
        <span className="acard__if">実施のとき</span>
        <span>{heldPlanText(activity.groups)}</span>
      </p>
    </div>
  );
}

export function ActivityCard({
  activity,
  featured = false,
  reserves = [],
}: {
  activity: Activity;
  featured?: boolean;
  reserves?: ReserveInfo[];
}) {
  // 予備日だけの日（その日の予定が未登録）は、その日の予定を新しく作る画面へ（大会しだいの予定を選べる）
  const href = activity.groups.length || !reserves.length ? `/activities/${activity.id}` : `/activities/new?date=${activity.date}`;
  const when = whenLabel(activity.date);
  const month = Number(activity.date.slice(5, 7));
  const day = Number(activity.date.slice(8, 10));
  const wd = weekday(activity.date);
  const wdClass = wd === "土" ? "acard__wd--sat" : wd === "日" ? "acard__wd--sun" : "";

  return (
    <Link
      href={href}
      className={`acard${featured ? " acard--featured" : ""}`}
      aria-label={`${month}月${day}日（${wd}）の予定を開く`}
    >
      {when && <span className="acard__when">{when}</span>}
      <div className="acard__date" aria-hidden>
        {featured ? (
          <>
            <span className="acard__month tile">{month}</span>
            <span className="acard__slash">/</span>
            <span className="tile acard__day">{day}</span>
            <span className={`acard__wd ${wdClass}`}>（{wd}）</span>
          </>
        ) : (
          <>
            <span className="acard__month">
              {month}
              <span>月</span>
            </span>
            <span className="tile acard__day">{day}</span>
            <span className={`acard__wd ${wdClass}`}>{wd}</span>
          </>
        )}
      </div>
      <div className="acard__body">
        {reserves.length > 0 && <ReserveBanner reserves={reserves} activity={activity} />}
        {/* 予備日の日は、休み（練習なし など）の行は帯の「実施のとき」に出ているので重ねない */}
        {activity.groups.filter((g) => !(reserves.length && (isOffType(g.type) || activity.reserveStatus === "postponed"))).map((g) => (
          <div key={g.division} className="acard__group">
            <div className="acard__head">
              {g.division !== "main" && <span className="acard__div">{divisionLabel(g.division)}</span>}
              <span className={`acard__type${isOffType(g.type) ? " acard__type--off" : ""}`}>{typeLabel(g.type)}</span>
              {tournamentTitle(g) && <span className="acard__tournament">{tournamentTitle(g)}</span>}
            </div>
            <Opponents g={g} />
            <GroupDetails g={g} />
          </div>
        ))}
      </div>
      {activity.note && <p className="acard__note">※{activity.note}</p>}
    </Link>
  );
}
