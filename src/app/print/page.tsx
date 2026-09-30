"use client";

// 保護者配布用の「月間予定表」印刷画面です。
// 学校を選ぶと、その学校が関わる予定だけを載せます（例：住吉中 → 住吉のみ・浅羽野と住吉・合同チーム）。
// 審判・グラウンド候補・スタッフの内部メモなど、運営の情報は載せません。

import { useEffect, useMemo, useState } from "react";
import { ErrorText, ToggleButton } from "@/components/ui";
import {
  divisionLabel,
  isMatchType,
  isOffType,
  listRange,
  weekday,
  weekdayColor,
  type Activity,
  type ActivityGroup,
  type DivisionKey,
} from "@/lib/activities";

type SchoolKey = "sumiyoshi" | "asabano" | "sakura";

const SCHOOLS: { key: SchoolKey; label: string; divisions: DivisionKey[] }[] = [
  {
    key: "sumiyoshi",
    label: "住吉中",
    divisions: ["main", "top", "academy", "sumiyoshi", "asabano_sumiyoshi"],
  },
  { key: "asabano", label: "浅羽野中", divisions: ["main", "top", "academy", "asabano_sumiyoshi"] },
  { key: "sakura", label: "桜中", divisions: ["main", "top", "academy", "sakura"] },
];

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

function thisMonth(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function time(start: string, end: string): string {
  if (!start && !end) return "";
  return `${start}〜${end}`;
}

// 持ち物（お弁当・軽食は目立たせて先頭に）
const HIGHLIGHT = ["お弁当", "軽食"];

function Packing({ items }: { items: string[] }) {
  const main = HIGHLIGHT.filter((h) => items.includes(h));
  const rest = items.filter((i) => !HIGHLIGHT.includes(i));
  return (
    <p>
      持ち物：
      {main.map((m) => (
        <span key={m} className="mr-1 font-extrabold underline decoration-2 underline-offset-2">
          {m}
        </span>
      ))}
      {main.length > 0 && rest.length > 0 && "・"}
      {rest.join("・")}
    </p>
  );
}

function GroupLines({ g, showDivision }: { g: ActivityGroup; showDivision: boolean }) {
  const off = isOffType(g.type);
  // 平日の「部活あり」は、再登校のときだけ会場・持ち物を載せる
  const plainClubDay = g.type === "部活あり" && !g.returnToSchool;
  const title = [
    showDivision ? `【${divisionLabel(g.division)}】` : "",
    g.type,
    g.tournamentName ? `（${g.tournamentName}）` : "",
  ].join("");
  const opponents = isMatchType(g.type)
    ? g.games.map((x) => x.opponent).filter(Boolean)
    : [];
  return (
    <div className="flex flex-col gap-0.5">
      <p className={`font-extrabold ${off ? "text-navy-soft/60" : ""}`}>{title}</p>
      {!off && !plainClubDay && (
        <>
          {opponents.length > 0 && <p className="font-bold">vs {opponents.join("・")}</p>}
          {g.type === "合同練習" && g.partners.length > 0 && (
            <p className="font-bold">合同：{g.partners.join("・")}</p>
          )}
          {isMatchType(g.type) &&
            g.games.some((x) => x.startTime) &&
            g.games.length > 1 && (
              <p>
                {g.games
                  .map((x, i) => `第${i + 1}試合 ${x.startTime || "未定"}${x.opponent ? ` ${x.opponent}` : ""}`)
                  .join("／")}
              </p>
            )}
          {(g.venue || g.startTime || g.endTime) && (
            <p>
              {g.venue && <>会場：{g.venue}　</>}
              {time(g.startTime, g.endTime) && <>時間：{time(g.startTime, g.endTime)}</>}
            </p>
          )}
          {(g.meetTime || g.meetPlace) && (
            <p className="font-extrabold">
              集合：{g.meetTime} {g.meetPlace}
            </p>
          )}
          {g.type === "部活あり" && g.returnToSchool && (
            <p className="font-extrabold">再登校：{g.returnTime || "時間未定"}</p>
          )}
          {g.packing.length > 0 && <Packing items={g.packing} />}
        </>
      )}
      {g.note && <p className="text-navy-soft">※{g.note}</p>}
    </div>
  );
}

export default function PrintPage() {
  const [school, setSchool] = useState<SchoolKey>("sumiyoshi");
  const [month, setMonth] = useState(thisMonth());
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setActivities(null);
    setError(null);
    const { from, to } = monthRange(month);
    listRange(from, to)
      .then(setActivities)
      .catch(() => setError("予定を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, [month]);

  const schoolInfo = SCHOOLS.find((s) => s.key === school)!;

  // この学校が関わる予定だけに絞る
  const rows = useMemo(() => {
    if (!activities) return [];
    return activities
      .map((a) => ({ ...a, groups: a.groups.filter((g) => schoolInfo.divisions.includes(g.division)) }))
      .filter((a) => a.groups.length > 0);
  }, [activities, schoolInfo]);

  const [y, m] = month.split("-").map(Number);
  const monthOptions = [-1, 0, 1, 2, 3].map((o) => thisMonth(o));

  return (
    <>
      {/* ---- 操作パネル（印刷されない） ---- */}
      <div className="flex flex-col gap-4 print:hidden">
        <h1 className="px-1 text-xl font-extrabold">印刷（保護者配布用）</h1>
        <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy/5">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-navy-soft">学校</span>
            <div className="grid grid-cols-3 gap-2">
              {SCHOOLS.map((s) => (
                <ToggleButton key={s.key} on={school === s.key} label={s.label} onClick={() => setSchool(s.key)} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-navy-soft">月</span>
            <div className="grid grid-cols-3 gap-2">
              {monthOptions.map((mo) => (
                <ToggleButton
                  key={mo}
                  on={month === mo}
                  label={`${Number(mo.slice(5))}月`}
                  onClick={() => setMonth(mo)}
                />
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-navy-soft">保護者へのひとこと（任意・印刷の一番下に出ます）</span>
            <textarea
              className="min-h-20 w-full rounded-xl bg-field px-4 py-3 text-base ring-1 ring-navy/15"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="例：予定は変更になる場合があります。変更時はLINEでお知らせします。"
            />
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex min-h-14 w-full items-center justify-center rounded-xl bg-stitch px-4 text-lg font-extrabold text-white active:opacity-80"
          >
            🖨 印刷する
          </button>
          <p className="text-sm text-navy-soft/70">
            iPhoneでは、印刷画面で「プリンタ」を選ぶか、共有ボタンから「PDFとして保存」ができます。下が印刷される見本です。
          </p>
        </section>
        {error && <ErrorText>{error}</ErrorText>}
      </div>

      {/* ---- 印刷される部分 ---- */}
      <article className="rounded-2xl bg-white p-5 text-[15px] leading-relaxed text-black shadow-sm ring-1 ring-navy/10 print:rounded-none print:p-0 print:text-[10.5pt] print:shadow-none print:ring-0">
        <header className="border-b-2 border-black pb-2">
          <h2 className="text-2xl font-extrabold print:text-[18pt]">
            {schoolInfo.label} 野球部　{y}年{m}月の活動予定
          </h2>
          <p className="text-sm print:text-[9pt]">桜・浅羽野・住吉 連合チーム</p>
        </header>

        {!activities && !error && <p className="py-6 text-center">読み込み中…</p>}
        {activities && rows.length === 0 && (
          <p className="py-6 text-center">この月の予定はまだ登録されていません。</p>
        )}

        <table className="mt-2 w-full border-collapse">
          <tbody>
            {rows.map((a) => {
              const d = Number(a.date.slice(8));
              return (
                <tr key={a.id} className="break-inside-avoid border-b border-black/30 align-top">
                  <td className="w-16 py-2 pr-2 print:w-[16mm]">
                    <span className="block text-xl font-extrabold leading-none print:text-[14pt]">{d}</span>
                    <span className={`text-sm font-extrabold ${weekdayColor(a.date)}`}>（{weekday(a.date)}）</span>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-col gap-2">
                      {a.groups.map((g) => (
                        <GroupLines key={g.division} g={g} showDivision={a.groups.length > 1 || !(["main", school] as string[]).includes(g.division)} />
                      ))}
                      {a.note && <p className="text-navy-soft">※{a.note}</p>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {message && <p className="mt-4 whitespace-pre-wrap border-t border-black/30 pt-2">{message}</p>}
      </article>
    </>
  );
}
