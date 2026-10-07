"use client";

// 保護者配布用の「月間予定表」印刷画面です。
// 送り先（学校・合同チーム）を選ぶと、関わる区分の予定だけを載せます（例：住吉中 → 住吉のみ・浅羽野と住吉・合同チーム）。
// 区分は1つずつ付け外しもできます。
// 審判・グラウンド候補・スタッフの内部メモなど、運営の情報は載せません。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PaperPreview } from "@/components/PaperPreview";
import { Choices, ErrorText, Field, PageHead, Toast, ToggleButton } from "@/components/ui";
import { elementToPdf, shareOrDownload } from "@/lib/sharePdf";
import {
  DIVISIONS,
  divisionLabel,
  gameLabel,
  isMatchType,
  ourOpponents,
  isOffType,
  listRange,
  weekday,
  weekdayColor,
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

// お弁当・軽食は右の欄に◯で表示するので、ここにはそれ以外の持ち物だけ載せる
function Packing({ items }: { items: string[] }) {
  const rest = items.filter((i) => !HIGHLIGHT.includes(i));
  if (rest.length === 0) return null;
  return <p>持ち物：{rest.join("・")}</p>;
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
  return (
    <td className="w-14 border-l border-black/30 py-2 text-center align-middle text-2xl font-extrabold print:w-[13mm] print:text-[16pt]">
      {on ? "◯" : ""}
    </td>
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
    ? ourOpponents(g.games)
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
                  .map((x, i) => `第${i + 1}試合 ${x.startTime || "未定"}${gameLabel(x) ? ` ${gameLabel(x)}` : ""}`)
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
  const [target, setTarget] = useState<TargetKey>("sumiyoshi");
  const [divisions, setDivisions] = useState<DivisionKey[]>(TARGETS[0].divisions);
  const [month, setMonth] = useState(thisMonth());
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const sheet = useRef<HTMLElement>(null);
  // PDF：作る → 送る（スマホは「共有」からLINE・メールを選ぶ）
  const [pdf, setPdf] = useState<File | null>(null);
  const [making, setMaking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    setActivities(null);
    setError(null);
    const { from, to } = monthRange(month);
    listRange(from, to)
      .then(setActivities)
      .catch(() => setError("予定を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, [month]);

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
  const rows = useMemo(() => {
    if (!activities) return [];
    return activities
      .map((a) => ({ ...a, groups: a.groups.filter((g) => divisions.includes(g.division)) }))
      .filter((a) => a.groups.length > 0);
  }, [activities, divisions]);

  const [y, m] = month.split("-").map(Number);
  const title = `${heading} ${y}年${m}月の活動予定`;

  // 内容が変わったら、作ったPDFは作り直す
  useEffect(() => {
    setPdf(null);
    setDownloaded(false);
  }, [divisions, month, message, activities]);

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
      const file = await elementToPdf(sheet.current, `${title.replace(/\s+/g, "_")}.pdf`);
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
                  on={month === mo}
                  label={`${Number(mo.slice(5))}月`}
                  onClick={() => setMonth(mo)}
                />
              ))}
            </Choices>
          </div>
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
        <p className="group-label">印刷の見本</p>
      </div>

      {/* ---- 印刷される部分 ---- */}
      <PaperPreview>
      <article ref={sheet} className="px-[38px] py-[34px] text-[14px] leading-relaxed text-black print:p-0 print:text-[10.5pt]">
        <header className="border-b-2 border-black pb-2">
          <h2 className="text-[24px] font-extrabold print:text-[18pt]">
            {heading}　{y}年{m}月の活動予定
          </h2>
          {!heading.startsWith("桜・浅羽野・住吉") && <p className="text-[12px] print:text-[9pt]">桜・浅羽野・住吉 連合チーム</p>}
        </header>

        {!activities && !error && <p className="py-6 text-center">読み込み中…</p>}
        {activities && rows.length === 0 && (
          <p className="py-6 text-center">
            {divisions.length === 0 ? "載せる活動を選んでください。" : "この月の予定はまだ登録されていません。"}
          </p>
        )}

        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-sm font-extrabold print:text-[9pt]">
              <th className="py-1 text-left">日</th>
              <th className="py-1 text-left">予定</th>
              <th className="w-14 border-l border-black/30 py-1 print:w-[13mm]">お弁当</th>
              <th className="w-14 border-l border-black/30 py-1 print:w-[13mm]">軽食</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const d = Number(a.date.slice(8));
              return (
                <tr key={a.id} className="break-inside-avoid border-b border-black/30 align-top">
                  <td className="w-16 py-2 pr-2 print:w-[16mm]">
                    <span className="block text-xl font-extrabold leading-none print:text-[14pt]">{d}</span>
                    <span className={`text-sm font-extrabold ${weekdayColor(a.date)}`}>（{weekday(a.date)}）</span>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-col gap-2">
                      {a.groups.map((g) => (
                        <GroupLines key={g.division} g={g} showDivision={showDivision(a, g)} />
                      ))}
                      {a.note && <p className="text-navy-soft">※{a.note}</p>}
                    </div>
                  </td>
                  <Mark on={needs(a, "お弁当")} />
                  <Mark on={needs(a, "軽食")} />
                </tr>
              );
            })}
          </tbody>
        </table>

        {message && <p className="mt-4 whitespace-pre-wrap border-t border-black/30 pt-2">{message}</p>}
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
