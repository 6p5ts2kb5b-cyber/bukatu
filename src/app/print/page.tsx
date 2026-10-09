"use client";

// 保護者配布用の「月間予定表」印刷画面です。
// 送り先（学校・合同チーム）を選ぶと、関わる区分の予定だけを載せます（例：住吉中 → 住吉のみ・浅羽野と住吉・合同チーム）。
// 区分は1つずつ付け外しもできます。
// 審判・グラウンド候補・スタッフの内部メモなど、運営の情報は載せません。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { holidayName, isHoliday } from "@/lib/holidays";
import { PaperPreview } from "@/components/PaperPreview";
import { Choices, cssVars, ErrorText, Field, PageHead, Toast, ToggleButton } from "@/components/ui";
import { elementToPdf, shareOrDownload } from "@/lib/sharePdf";
import {
  DIVISIONS,
  divisionLabel,
  describeRef,
  gameStart,
  tournamentTitle,
  isMatchType,
  isOffType,
  listRange,
  reserveTitle,
  hasWeekdayPractice,
  isWeekend,
  todayString,
  reservePrefix,
  reserveSubject,
  ourOpponents,
  isRef,
  advanceView,
  reservesByDate,
  reserveView,
  type ReserveInfo,
  heldPlanText,
  typeLabel,
  weekday,
  type Activity,
  type ActivityGroup,
  type DivisionKey,
} from "@/lib/activities";

type TargetKey = "sumiyoshi" | "asabano" | "sakura" | "team";

// 送り先ごとの、載せる区分。own = 見出しに【区分】を付けなくてよい区分
const TARGETS: { key: TargetKey; label: string; heading: string; divisions: DivisionKey[]; own?: DivisionKey }[] = [
  {
    key: "sumiyoshi",
    label: "住吉中",
    heading: "住吉中 野球部",
    divisions: ["main", "top", "academy", "sumiyoshi", "asabano_sumiyoshi"],
    own: "sumiyoshi",
  },
  { key: "asabano", label: "浅羽野中", heading: "浅羽野中 野球部", divisions: ["main", "top", "academy", "asabano_sumiyoshi"] },
  { key: "sakura", label: "桜中", heading: "桜中 野球部", divisions: ["main", "top", "academy", "sakura"], own: "sakura" },
  { key: "team", label: "合同チーム", heading: "桜・浅羽野・住吉 連合チーム", divisions: ["main", "top", "academy"] },
];

const sameSet = (a: DivisionKey[], b: DivisionKey[]) => a.length === b.length && a.every((x) => b.includes(x));

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 今週末（next=true なら来週末）の日：土・日と、つながっている祝日（3連休など）
function weekendDates(today: string, next: boolean): string[] {
  const t = new Date(`${today}T00:00:00`);
  const monday = new Date(t);
  monday.setDate(t.getDate() - ((t.getDay() + 6) % 7) + (next ? 7 : 0));
  const sat = new Date(monday);
  sat.setDate(monday.getDate() + 5);
  const out = [ymdOf(sat)];
  const sun = new Date(monday);
  sun.setDate(monday.getDate() + 6);
  out.push(ymdOf(sun));
  // 前の金曜・後ろの月曜…が祝日なら足す
  for (let d = new Date(sat); ; ) {
    d.setDate(d.getDate() - 1);
    if (!isHoliday(ymdOf(d))) break;
    out.unshift(ymdOf(d));
  }
  for (let d = new Date(sun); ; ) {
    d.setDate(d.getDate() + 1);
    if (!isHoliday(ymdOf(d))) break;
    out.push(ymdOf(d));
  }
  return out;
}

function mdLabel(date: string): string {
  const h = holidayName(date);
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}（${weekday(date)}${h ? `・${h}` : ""}）`;
}

function thisMonth(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 「07:30」→「7:30」
function clock(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${Number(h)}:${m}`;
}

function time(start: string, end: string): string {
  if (!start && !end) return "";
  return `${clock(start)}〜${clock(end)}`;
}

// 右の欄に◯で出す持ち物（ここに並べた順に欄ができる）
const HIGHLIGHT = ["お弁当", "軽食", "着替え", "筆記用具"];

// 右の欄に◯で出すものは、持ち物の行には重ねて書かない
// 予定表に書かない持ち物（いつも持ってくる物）
const OMIT = ["水筒"];

function packingText(items: string[]): string {
  return items.filter((i) => !HIGHLIGHT.includes(i) && !OMIT.includes(i)).join("・");
}

// その日にお弁当・軽食が必要か（活動がある区分のどれかで選ばれていれば◯）
function needs(a: Activity, item: string): boolean {
  return a.groups.some(
    (g) =>
      !isOffType(g.type) &&
      !(g.type === "部活あり" && !g.returnToSchool) &&
      g.packing.includes(item),
  );
}

function Mark({ on }: { on: boolean }) {
  return <td className="pl-mark">{on ? "◯" : ""}</td>;
}

// 1日の中の1区分ぶん。見出し（種類・大会名）と、項目名つきの一覧で見やすく
// 見出し：練習試合は「対 八王子長房」のように相手の名前（決まっていないときは「練習試合」）
function printTitle(g: ActivityGroup): string {
  if (g.type === "練習試合") {
    const names = ourOpponents(g.games).filter((t) => !isRef(t));
    if (names.length) return `対 ${names.join("・")}`;
  }
  return typeLabel(g.type);
}

// 試合の番号：1試合目 → ①
function circled(i: number): string {
  return "①②③④⑤⑥⑦⑧⑨⑩"[i] ?? `(${i + 1})`;
}

// LINEに貼る文章（予定表と同じ中身を、スマホで読みやすい文にする）
function groupText(g: ActivityGroup, prefix: string, withDiv: boolean): string[] {
  const out: string[] = [];
  const div = withDiv ? `［${divisionLabel(g.division)}］` : "";
  const av = advanceView(g);
  if (av.mode === "lose") return [`${div}${av.head}（${av.reason.replace(/。$/, "")}）`];
  const title = [printTitle(g), tournamentTitle(g)].filter(Boolean).join("　");
  out.push(`${div}${prefix ? `${prefix}　` : ""}${title}`);
  if (av.mode === "both") {
    out.push(`　${av.day}勝ち上がると：大会（${av.win}）`);
    out.push(`　${av.day}敗退すると：${av.lose}`);
  }
  const off = isOffType(g.type);
  if (off || (g.type === "部活あり" && !g.returnToSchool)) return out;
  if (g.meetTime || g.meetPlace) out.push(`　集合　${[clock(g.meetTime), g.meetPlace].filter(Boolean).join("　")}`);
  if (g.type === "部活あり" && g.returnToSchool) out.push(`　再登校　${clock(g.returnTime) || "時間未定"}`);
  if (time(g.startTime, g.endTime)) out.push(`　時間　${time(g.startTime, g.endTime)}`);
  if (g.venue) out.push(`　会場　${g.venue}`);
  if (isMatchType(g.type)) {
    const pairs = g.games.map((x) => [x.others ? x.home ?? "" : "うち", x.opponent] as [string, string]);
    const team = (t: string) => describeRef(t, pairs) ?? t;
    g.games
      .filter((x) => x.opponent || x.home || gameStart(x))
      .forEach((x, i) =>
        out.push(
          `　${circled(i)}　${x.afterLunch ? gameStart(x) : clock(x.startTime) || "時間未定"}　${
            x.others
              ? `${team(x.home ?? "") || "未定"} 対 ${team(x.opponent) || "未定"}（観戦・補助役員）`
              : `vs ${team(x.opponent) || "未定"}`
          }`,
        ),
      );
  }
  if (g.type === "合同練習" && g.partners.length) out.push(`　合同　${g.partners.join("・")}`);
  const pk = g.packing.filter((i) => !OMIT.includes(i));
  if (pk.length) out.push(`　持ち物　${pk.join("・")}`);
  if (g.reserveDate) {
    out.push(`　予備日　${mdLabel(g.reserveDate)}${g.reserveVenue ? `　${g.reserveVenue}` : ""}`);
    if (g.reserveDate2) out.push(`　予備日の予備日　${mdLabel(g.reserveDate2)}${g.reserveVenue2 ? `　${g.reserveVenue2}` : ""}`);
  }
  if (g.note) out.push(`　※${g.note}`);
  return out;
}

function buildLineText(rows: Activity[], reserves: Map<string, ReserveInfo[]>, head: string, message: string): string {
  const blocks: string[] = [head];
  for (const a of rows) {
    if (a.id.startsWith("wk-")) {
      const [f, t] = a.id.slice(3).split("|");
      blocks.push(`${f === t ? mdLabel(f) : `${mdLabel(f)}〜${mdLabel(t)}`}　平日　合同練習なし（各校の部活）`);
      continue;
    }
    const lines: string[] = [];
    const rs = reserves.get(a.date);
    const decided = a.reserveStatus === "held" || a.reserveStatus === "cancelled";
    if (rs && !decided) {
      const v = reserveView(a.reserveStatus, rs, a.groups);
      lines.push(`☂ ${reserveTitle(rs)}`);
      if (v.mode === "tournament") lines.push(`　${v.head}${v.venue ? `（${v.venue}）` : ""}`);
      else {
        lines.push(`　${reserveSubject(rs)}が延期された場合：${rs.map((x) => x.title).join("・")}`);
        lines.push(`　${reserveSubject(rs)}が実施された場合：${heldPlanText(a.groups)}`);
      }
    }
    const groups = a.groups.filter((g) => {
      if (!rs) return true;
      if (a.reserveStatus === "postponed") return false;
      return decided || !isOffType(g.type);
    });
    groups.forEach((g) => lines.push(...groupText(g, rs && decided ? reservePrefix(a.reserveStatus, rs) : "", a.groups.length > 1)));
    if (a.id.startsWith("blank-") || (!lines.length && !groups.length)) lines.push("未定");
    if (a.note) lines.push(`　※${a.note}`);
    // 1行目に日付をつける
    lines[0] = `${mdLabel(a.date)} ${lines[0]}`;
    blocks.push(lines.join("\n"));
  }
  if (message) blocks.push(message);
  return blocks.join("\n\n");
}

function GroupLines({ g, showDivision, prefix }: { g: ActivityGroup; showDivision: boolean; prefix?: string }) {
  // 勝ち上がり次第の日で「敗退」と決まったら、その日の予定（練習・休養日）だけを出す
  const av = advanceView(g);
  if (av.mode === "lose") {
    return (
      <div className="pl-g">
        <div className="pl-decided">
          <p>
            {showDivision && <span className="pl-div">{divisionLabel(g.division)}</span>}
            <strong className={av.rest ? "pl-rest" : undefined}>{av.head}</strong>
          </p>
          <p className="pl-decided__why">{av.reason}</p>
        </div>
      </div>
    );
  }
  const off = isOffType(g.type);
  // 平日の「部活あり」は、再登校のときだけ会場・持ち物を載せる
  const plainClubDay = g.type === "部活あり" && !g.returnToSchool;
  const quiet = off || plainClubDay;

  // 試合：うちの試合は「vs 相手」、他チーム同士は薄く。「第1試合の勝者」は中身も書く
  const pairs = g.games.map((x) => [x.others ? x.home ?? "" : "うち", x.opponent] as [string, string]);
  const team = (t: string) => describeRef(t, pairs) ?? t;
  const games = isMatchType(g.type)
    ? g.games.filter((x) => x.opponent || x.home || gameStart(x))
    : [];

  const rows: { k: string; v: ReactNode; strong?: boolean; full?: boolean }[] = [];
  if (!quiet) {
    if (g.meetTime || g.meetPlace)
      rows.push({ k: "集合", v: [clock(g.meetTime), g.meetPlace].filter(Boolean).join("　"), strong: true });
    if (g.type === "部活あり" && g.returnToSchool)
      rows.push({ k: "再登校", v: clock(g.returnTime) || "時間未定", strong: true });
    if (time(g.startTime, g.endTime)) rows.push({ k: "時間", v: time(g.startTime, g.endTime) });
    if (g.venue)
      rows.push({
        k: "会場",
        v: (
          // 保護者向けなので、会場名だけ（住所・最寄駅は載せない）
          <>{g.venue}</>
        ),
      });
    if (games.length)
      rows.push({
        k: "試合",
        full: true,
        v: (
          <span className="pl-games">
            {games.map((x, i) => (
              <span key={i} className={x.others ? "pl-game pl-game--others" : "pl-game"}>
                <span className="pl-game__no">{circled(i)}</span>
                <b>{x.afterLunch ? gameStart(x) : clock(x.startTime) || "時間未定"}</b>
                {x.others
                  ? `${team(x.home ?? "") || "未定"} 対 ${team(x.opponent) || "未定"}（観戦・補助役員）`
                  : `vs ${team(x.opponent) || "未定"}`}
              </span>
            ))}
          </span>
        ),
      });
    if (g.type === "合同練習" && g.partners.length) rows.push({ k: "合同", v: g.partners.join("・") });
    if (packingText(g.packing)) rows.push({ k: "持ち物", v: packingText(g.packing) });
    if (g.reserveDate) {
      const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}（${weekday(d)}）`;
      rows.push({
        k: "予備日",
        v: (
          <>
            {md(g.reserveDate)}
            {g.reserveVenue && `　${g.reserveVenue}`}
            {g.reserveDate2 && (
              <>
                {"　／　"}予備日の予備日 {md(g.reserveDate2)}
                {g.reserveVenue2 && `　${g.reserveVenue2}`}
              </>
            )}
          </>
        ),
      });
    }
  }

  return (
    <div className={`pl-g${quiet ? " pl-g--quiet" : ""}`}>
      <p className="pl-title">
        {showDivision && <span className="pl-div">{divisionLabel(g.division)}</span>}
        {prefix && <span className="pl-prefix">{prefix}</span>}
        <b className={off ? "pl-rest" : undefined}>{printTitle(g)}</b>
        {tournamentTitle(g) && <span className="pl-tour">{tournamentTitle(g)}</span>}
      </p>
      {av.mode === "both" && (
        <div className="pl-reserve pl-reserve--adv">
          <p className="pl-reserve__title">🏆 この日は勝ち上がり次第</p>
          <p>
            <b>{av.day}勝ち上がると</b>大会（{av.win}）
          </p>
          <p>
            <b>{av.day}敗退すると</b>
            <strong className={av.loseRest ? "pl-rest" : undefined}>{av.lose}</strong>
          </p>
        </div>
      )}
      {/* 項目は横に詰めて並べる（1枚に収めるため）。試合だけは1行を使う */}
      {rows.length > 0 && (
        <div className="pl-items">
          {rows.map((r) => (
            <span key={r.k} className={`pl-it${r.full ? " pl-it--full" : ""}${r.strong ? " pl-strong" : ""}`}>
              <i>{r.k}</i>
              <span>{r.v}</span>
            </span>
          ))}
        </div>
      )}
      {g.note && <p className="pl-note">※{g.note}</p>}
    </div>
  );
}

// 予備日の帯。大会がどうなったか決まっていれば1つだけ、未定なら両方
function PrintReserve({ reserves, a }: { reserves: ReserveInfo[]; a: Activity }) {
  const view = reserveView(a.reserveStatus, reserves, a.groups);
  if (view.mode !== "both") {
    return (
      <div className="pl-decided">
        <p>
          <strong className={view.rest ? "pl-rest" : undefined}>{view.head}</strong>
          {view.venue && <span className="pl-sub">{view.venue}</span>}
        </p>
        <p className="pl-decided__why">{view.reason}</p>
      </div>
    );
  }
  return (
    <div className="pl-reserve">
      <p className="pl-reserve__title">☂ {reserveTitle(reserves)}</p>
      <p>
        <b>{reserveSubject(reserves)}が延期された場合</b>
        {reserves.map((x) => `${x.title}${x.venue ? `（${x.venue}）` : ""}`).join("・")}
      </p>
      <p>
        <b>{reserveSubject(reserves)}が実施された場合</b>
        <strong className="pl-rest">{heldPlanText(a.groups)}</strong>
      </p>
    </div>
  );
}

export default function PrintPage() {
  const [target, setTarget] = useState<TargetKey>("sumiyoshi");
  const [divisions, setDivisions] = useState<DivisionKey[]>(TARGETS[0].divisions);
  const [month, setMonth] = useState(thisMonth());
  // 期間：1カ月 / 前半（1〜15日） / 後半（16日〜末日）
  const [half, setHalf] = useState<"all" | "first" | "second" | "week" | "nextWeek">("all");
  const [hidePast, setHidePast] = useState(false); // 過ぎた日を載せない
  const today = todayString();
  const isWeekendMode = half === "week" || half === "nextWeek";
  // 載せる日の一覧（1カ月・前半・後半・今週末・来週末）
  const dates = useMemo(() => {
    if (isWeekendMode) return weekendDates(today, half === "nextWeek");
    const { to } = monthRange(month);
    const last = Number(to.slice(8, 10));
    const out: string[] = [];
    for (let d = 1; d <= last; d++) {
      if (half === "first" && d > 15) continue;
      if (half === "second" && d < 16) continue;
      out.push(`${month}-${String(d).padStart(2, "0")}`);
    }
    return out;
  }, [half, month, today, isWeekendMode]);
  const shownDates = useMemo(() => dates.filter((d) => !(hidePast && d < today)), [dates, hidePast, today]);
  const rangeFrom = dates[0];
  const rangeTo = dates[dates.length - 1];
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [pool, setPool] = useState<Activity[]>([]); // 予備日を調べるため、前の月も含めた予定
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const sheet = useRef<HTMLElement>(null);
  // A4の1枚に収める：中身の高さを測って、はみ出す分だけ全体を縮める
  const fitBox = useRef<HTMLDivElement>(null);
  const [fitOne, setFitOne] = useState(true);
  const [fit, setFit] = useState(1);
  // PDF：作る → 送る（スマホは「共有」からLINE・メールを選ぶ）
  const [pdf, setPdf] = useState<File | null>(null);
  const [making, setMaking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    setActivities(null);
    setError(null);
    const from = rangeFrom;
    const to = rangeTo;
    // 前の月の大会の「予備日」がこの月に来ることがあるので、少し前から読む
    const d = new Date(`${from}T00:00:00`);
    d.setDate(d.getDate() - 40);
    const early = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    listRange(early, to)
      .then((list) => {
        setPool(list);
        setActivities(list.filter((a) => a.date >= from));
      })
      .catch(() => setError("予定を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, [rangeFrom, rangeTo]);

  const targetInfo = TARGETS.find((t) => t.key === target)!;
  // 送り先の決まった組み合わせから区分を付け外ししたら「区分を選んで作成」扱い
  const custom = !sameSet(divisions, targetInfo.divisions);
  const heading = custom
    ? `桜・浅羽野・住吉　${DIVISIONS.filter((d) => divisions.includes(d.key)).map((d) => d.label).join("・")}`
    : targetInfo.heading;
  const pickTarget = (k: TargetKey) => {
    setTarget(k);
    setDivisions(TARGETS.find((t) => t.key === k)!.divisions);
  };
  const toggleDivision = (k: DivisionKey) =>
    setDivisions((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const showDivision = (a: Activity, g: ActivityGroup) =>
    a.groups.length > 1 || !(divisions.length === 1 || g.division === "main" || (!custom && g.division === targetInfo.own));

  // この学校が関わる予定だけに絞る
  // 大会の予備日（選んだ区分の大会だけ）
  const reserves = useMemo(
    () =>
      reservesByDate(
        pool.map((a) => ({ ...a, groups: a.groups.filter((g) => divisions.includes(g.division)) })),
      ),
    [pool, divisions],
  );

  const rows = useMemo(() => {
    if (!activities) return [];
    const inPeriod = (date: string) => shownDates.includes(date);
    const list = activities
      .map((a) => ({ ...a, groups: a.groups.filter((g) => divisions.includes(g.division)) }))
      .filter((a) => a.groups.length > 0 || reserves.has(a.date));
    // 予定がなく、予備日だけの日も1行にする
    reserves.forEach((_, date) => {
      if (inPeriod(date) && !list.some((a) => a.date === date)) list.push({ id: `reserve-${date}`, date, note: "", groups: [] });
    });
    const out = list.filter((a) => inPeriod(a.date));
    // まだ何も入っていない日も「未定」の行にして、入れ忘れが分かるようにする（予定が1件もなければ出さない）
    if (out.length > 0 || isWeekendMode) {
      for (const date of shownDates) {
        if (!out.some((a) => a.date === date)) out.push({ id: `blank-${date}`, date, note: "", groups: [] });
      }
    }
    out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    // 平日に練習がない区分だけのとき（合同チームなど）：予定のない平日は「未定」にせず、続く日を1行にまとめる
    if (!divisions.some(hasWeekdayPractice)) {
      const merged: Activity[] = [];
      for (const a of out) {
        const quietWeekday = a.id.startsWith("blank-") && !isWeekend(a.date);
        const prev = merged[merged.length - 1];
        if (quietWeekday && prev?.id.startsWith("wk-")) {
          prev.id = `wk-${prev.id.split("|")[0].slice(3)}|${a.date}`;
          continue;
        }
        merged.push(quietWeekday ? { ...a, id: `wk-${a.date}|${a.date}` } : a);
      }
      return merged;
    }
    return out;
  }, [activities, divisions, reserves, shownDates, isWeekendMode]);

  const blanks = rows.filter((a) => a.id.startsWith("blank-"));
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const endDay = half === "first" ? 15 : lastDay;
  // 見出しの期間（過ぎた日を載せないときは、今日からに）
  const sFrom = shownDates[0] ?? rangeFrom;
  const sTo = shownDates[shownDates.length - 1] ?? rangeTo;
  const md = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8))}日（${weekday(d)}）`;
  const period = isWeekendMode
    ? `${md(sFrom)}〜${sFrom.slice(0, 7) === sTo.slice(0, 7) ? `${Number(sTo.slice(8))}日（${weekday(sTo)}）` : md(sTo)}`
    : sFrom !== rangeFrom
      ? `${m}月（${Number(sFrom.slice(8))}日〜${endDay}日）`
      : half === "first"
        ? `${m}月前半（1日〜15日）`
        : half === "second"
          ? `${m}月後半（16日〜${lastDay}日）`
          : `${m}月`;
  const yearText = isWeekendMode ? `${half === "week" ? "今週末" : "来週末"}　` : `${y}年`;
  const title = `${heading} ${yearText}${period}の活動予定`;

  useLayoutEffect(() => {
    const box = fitBox.current;
    if (!box) return;
    // 印刷できる範囲：A4（794×1123px）から上下左右4mm（約15px）を引いた大きさ
    const W = 764;
    const H = 1090;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-30000px;top:0;visibility:hidden;";
    const clone = box.cloneNode(true) as HTMLElement;
    clone.style.setProperty("--fit", "1");
    clone.className = `${box.className} ${box.parentElement?.className ?? ""}`;
    clone.style.padding = "0";
    host.appendChild(clone);
    document.body.appendChild(host);
    let f = 1;
    for (let i = 0; i < 4; i++) {
      clone.style.width = `${W / f}px`;
      const h = clone.offsetHeight;
      // 少ないときは大きく（最大1.8倍）、多いときは小さく（最小0.45倍）して、ちょうど1枚に
      const next = Math.min(1.8, Math.max(0.45, (H / h) * 0.98));
      if (Math.abs(next - f) < 0.005) {
        f = next;
        break;
      }
      f = next;
    }
    host.remove();
    setFit(Math.round(f * 1000) / 1000);
  }, [rows, message, heading, period, divisions]);

  // 内容が変わったら、作ったPDFは作り直す
  useEffect(() => {
    setPdf(null);
    setDownloaded(false);
  }, [divisions, month, half, message, activities, hidePast, fitOne, fit]);

  // ---- LINEにそのまま貼る文章 ----
  const lineText = useMemo(
    () => buildLineText(rows, reserves, `【${isWeekendMode ? (half === "week" ? "今週末" : "来週末") : period}の予定】${heading}`, message),
    [rows, reserves, isWeekendMode, half, period, heading, message],
  );
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [lineText]);
  const copyLine = async () => {
    try {
      await navigator.clipboard.writeText(lineText);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = lineText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setToast("文章をコピーしました。LINEに貼り付けてください");
  };

  const send = async (file: File) => {
    try {
      const r = await shareOrDownload(file, title);
      if (r === "downloaded") {
        setDownloaded(true);
      }
    } catch {
      // 作るのに時間がかかると、スマホが共有画面を開かせてくれないことがある → もう一度押してもらう
      setToast("「送る」をもう一度押してください");
    }
  };

  const makePdf = async () => {
    if (!sheet.current || making) return;
    if (pdf) return send(pdf);
    setMaking(true);
    try {
      const file = await elementToPdf(
        sheet.current,
        `${title.replace(/\s+/g, "_")}.pdf`,
        fitOne ? { onePage: true, width: Math.round(794 / fit) } : {},
      );
      setPdf(file);
      await send(file);
    } catch {
      setError("PDFを作れませんでした。電波の良い場所でもう一度お試しください。");
    } finally {
      setMaking(false);
    }
  };

  const monthOptions = [-1, 0, 1, 2, 3].map((o) => thisMonth(o));

  return (
    <>
      {/* ---- 操作パネル（印刷されない） ---- */}
      <div className="flex flex-col gap-3 print:hidden">
        <PageHead kicker="PRINT" title="保護者配布用の印刷" lead="送り先と月を選ぶと、A4縦の月間予定表ができます。" />
        <section className="panel flex flex-col gap-4">
          <div>
            <span className="f-label">送り先</span>
            <Choices cols={2}>
              {TARGETS.map((t) => (
                <ToggleButton key={t.key} on={!custom && target === t.key} label={t.label} onClick={() => pickTarget(t.key)} />
              ))}
            </Choices>
          </div>
          <div>
            <span className="f-label">載せる活動（いくつでも選べます）</span>
            <div className="filters" style={{ flexWrap: "wrap" }}>
              {DIVISIONS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className="filter"
                  aria-pressed={divisions.includes(d.key)}
                  onClick={() => toggleDivision(d.key)}
                >
                  {divisions.includes(d.key) ? "✓ " : ""}
                  {d.label}
                </button>
              ))}
            </div>
            <span className="f-hint block">
              {custom ? "選んだ活動だけで予定表を作ります。" : `${targetInfo.label}に関わる活動を選んでいます。外したり足したりできます。`}
            </span>
          </div>
          <div>
            <span className="f-label">月</span>
            <Choices cols={5}>
              {monthOptions.map((mo) => (
                <ToggleButton
                  key={mo}
                  small
                  on={!isWeekendMode && month === mo}
                  label={`${Number(mo.slice(5))}月`}
                  onClick={() => {
                    setMonth(mo);
                    if (isWeekendMode) setHalf("all");
                  }}
                />
              ))}
            </Choices>
          </div>
          <div>
            <span className="f-label">期間</span>
            <Choices cols={3}>
              <ToggleButton small on={half === "all"} label="1カ月" onClick={() => setHalf("all")} />
              <ToggleButton small on={half === "first"} label="前半" onClick={() => setHalf("first")} />
              <ToggleButton small on={half === "second"} label="後半" onClick={() => setHalf("second")} />
            </Choices>
            <div className="mt-2">
              <Choices cols={2}>
                <ToggleButton small on={half === "week"} label="今週末" onClick={() => setHalf("week")} />
                <ToggleButton small on={half === "nextWeek"} label="来週末" onClick={() => setHalf("nextWeek")} />
              </Choices>
            </div>
            <span className="f-hint block">
              {dates.map(mdLabel).length <= 4 ? dates.map(mdLabel).join("・") : `${mdLabel(rangeFrom)}〜${mdLabel(rangeTo)}`}
              を載せます。{isWeekendMode && "土日と、つながっている祝日（3連休など）です。"}
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={fitOne} onChange={(e) => setFitOne(e.target.checked)} />
            A4の1枚にちょうど収める
            {fitOne && fit !== 1 ? `（${Math.round(fit * 100)}%に${fit > 1 ? "拡大" : "縮小"}）` : ""}
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={hidePast} onChange={(e) => setHidePast(e.target.checked)} />
            過ぎた日は載せない（今日{`${Number(today.slice(5, 7))}/${Number(today.slice(8))}`}から）
          </label>
          <Field label="保護者へのひとこと（任意）" hint="印刷の一番下に載ります。">
            <textarea
              className="f-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="例：予定は変更になる場合があります。変更時はLINEでお知らせします。"
            />
          </Field>
        </section>
        {error && <ErrorText>{error}</ErrorText>}
        {blanks.length > 0 && (
          <div className="blank-warn">
            <p className="blank-warn__title">
              まだ予定が入っていない日が {blanks.length}日 あります
            </p>
            <p className="blank-warn__body">このまま印刷すると「未定」と載ります。押すと、その日の予定を入れられます。</p>
            <div className="flex flex-wrap gap-2">
              {blanks.map((a) => (
                <Link key={a.id} href={`/activities/new?date=${a.date}`} className="blank-warn__day">
                  {Number(a.date.slice(8))}日（{weekday(a.date)}）
                </Link>
              ))}
            </div>
          </div>
        )}
        <details className="line-text" open={isWeekendMode}>
          <summary>LINEに貼る文章（PDFを開かなくても読める）</summary>
          <pre>{lineText}</pre>
          <button type="button" className="btn btn--line" onClick={copyLine}>
            {copied ? "コピーしました（もう一度コピー）" : "文章をコピーする"}
          </button>
        </details>
        <p className="group-label">印刷の見本</p>
      </div>

      {/* ---- 印刷される部分 ---- */}
      <PaperPreview>
      <article ref={sheet} className="px-[14px] py-[14px] text-[12px] leading-snug text-black print:p-0">
        <div
          ref={fitBox}
          className="pl-fit"
          style={cssVars(fitOne && fit !== 1 ? { "--fit": fit, width: `${Math.floor(764 / fit)}px` } : { "--fit": 1 })}
        >
        <header className="border-b-2 border-black pb-1">
          <h2 className="text-[17px] font-extrabold leading-tight">
            {heading}　{yearText}{period}の活動予定
          </h2>
          {!heading.startsWith("桜・浅羽野・住吉") && <p className="text-[11px]">桜・浅羽野・住吉 連合チーム</p>}
        </header>

        {!activities && !error && <p className="py-6 text-center">読み込み中…</p>}
        {activities && rows.length === 0 && (
          <p className="py-6 text-center">
            {divisions.length === 0 ? "載せる活動を選んでください。" : hidePast && rangeTo < today ? "この期間はもう過ぎています。「過ぎた日は載せない」を外すと載ります。" : half === "all" ? "この月の予定はまだ登録されていません。" : "この期間の予定はまだ登録されていません。"}
          </p>
        )}

        <table className="pl">
          <thead>
            <tr>
              <th className="pl-day">日</th>
              <th className="pl-main">予定</th>
              {HIGHLIGHT.map((h) => (
                <th key={h} className="pl-mark">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              if (a.id.startsWith("wk-")) {
                const [f, t] = a.id.slice(3).split("|");
                const fd = Number(f.slice(8));
                const td = Number(t.slice(8));
                return (
                  <tr key={a.id} className="pl-row pl-row--quiet pl-row--wk">
                    <td className="pl-day">
                      <b>{fd === td ? fd : `${fd}〜${td}`}</b>
                      {fd === td && <span>{weekday(f)}</span>}
                    </td>
                    <td className="pl-main">
                      <span className="pl-wk">{fd === td ? "" : "平日　"}合同練習なし（各校の部活）</span>
                    </td>
                    {HIGHLIGHT.map((h) => (
                      <Mark key={h} on={false} />
                    ))}
                  </tr>
                );
              }
              const d = Number(a.date.slice(8));
              const wd = weekday(a.date);
              const weekend = wd === "土" || wd === "日" || isHoliday(a.date);
              const quiet =
                a.groups.every((g) => isOffType(g.type) || (g.type === "部活あり" && !g.returnToSchool)) &&
                !a.note &&
                !reserves.has(a.date);
              return (
                <tr
                  key={a.id}
                  className={`pl-row${weekend ? " pl-row--we" : ""}${quiet ? " pl-row--quiet" : ""}${a.id.startsWith("blank-") ? " pl-row--blank" : ""}`}
                >
                  <td className="pl-day">
                    <b>{d}</b>
                    <span className={wd === "日" || holidayName(a.date) ? "pl-sun" : wd === "土" ? "pl-sat" : undefined}>{wd}</span>
                    {holidayName(a.date) && <small className="pl-holiday">{holidayName(a.date)}</small>}
                  </td>
                  <td className="pl-main">
                    {(a.id.startsWith("blank-") ||
                      (a.groups.length === 0 && (a.reserveStatus === "held" || a.reserveStatus === "cancelled"))) && (
                      <span className="pl-blank">未定</span>
                    )}
                    {reserves.get(a.date) && a.reserveStatus !== "held" && a.reserveStatus !== "cancelled" && (
                      <PrintReserve reserves={reserves.get(a.date)!} a={a} />
                    )}
                    {a.groups
                      .filter((g) => {
                        if (!reserves.has(a.date)) return true;
                        if (a.reserveStatus === "postponed") return false;
                        // 決まったら休養日もふつうの行で。確認中は帯の「実施のとき」に出ているので重ねない
                        return a.reserveStatus === "held" || a.reserveStatus === "cancelled" || !isOffType(g.type);
                      })
                      .map((g) => (
                        <GroupLines
                          key={g.division}
                          g={g}
                          showDivision={showDivision(a, g)}
                          prefix={reserves.has(a.date) ? reservePrefix(a.reserveStatus, reserves.get(a.date) ?? []) : ""}
                        />
                      ))}
                    {a.note && <p className="pl-note">※{a.note}</p>}
                  </td>
                  {HIGHLIGHT.map((h) => (
                    <Mark key={h} on={needs(a, h)} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {message && <p className="mt-2 whitespace-pre-wrap border-t border-black/30 pt-1">{message}</p>}
        </div>
      </article>
      </PaperPreview>

      <div className="h-28 print:hidden" aria-hidden />
      <div className="savebar print:hidden">
        <div className="flex flex-col gap-2">
          {downloaded && (
            <p className="m-0 rounded-xl border border-rule bg-white p-3 text-sm font-bold leading-relaxed">
              PDFを保存しました。LINEやメールに添付して送ってください。
              <a
                className="ml-1 font-extrabold underline"
                href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}を送ります。PDFをご確認ください。`)}`}
              >
                メールを開く
              </a>
            </p>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button type="button" onClick={makePdf} disabled={!activities || making} className="btn btn--accent">
              {making ? "PDFを作っています…" : pdf ? "PDFを送る" : "PDFでLINE・メールに送る"}
            </button>
            <button type="button" onClick={() => window.print()} className="btn btn--ghost px-5">
              印刷
            </button>
          </div>
        </div>
      </div>
      <Toast message={toast} onDone={clearToast} />
    </>
  );
}
