"use client";

// 保護者配布用の「月間予定表」印刷画面です。
// 送り先（学校・合同チーム）を選ぶと、関わる区分の予定だけを載せます（例：住吉中 → 住吉のみ・浅羽野と住吉・合同チーム）。
// 区分は1つずつ付け外しもできます。
// 審判・グラウンド候補・スタッフの内部メモなど、運営の情報は載せません。

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PaperPreview } from "@/components/PaperPreview";
import { Choices, ErrorText, Field, PageHead, Toast, ToggleButton } from "@/components/ui";
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
  reserveLabel,
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

// 持ち物（お弁当・軽食は目立たせて先頭に）
const HIGHLIGHT = ["お弁当", "軽食"];

// お弁当・軽食は右の欄に◯で表示するので、ここにはそれ以外の持ち物だけ載せる
function packingText(items: string[]): string {
  return items.filter((i) => !HIGHLIGHT.includes(i)).join("・");
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
function GroupLines({ g, showDivision }: { g: ActivityGroup; showDivision: boolean }) {
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

  const rows: { k: string; v: ReactNode; strong?: boolean }[] = [];
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
          <>
            {g.venue}
            {g.venueStation && <small className="pl-sub">{g.venueStation}</small>}
          </>
        ),
      });
    if (games.length)
      rows.push({
        k: "試合",
        v: (
          <span className="pl-games">
            {games.map((x, i) => (
              <span key={i} className={x.others ? "pl-game pl-game--others" : "pl-game"}>
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
    if (g.reserveDate)
      rows.push({
        k: "予備日",
        v: `${Number(g.reserveDate.slice(5, 7))}/${Number(g.reserveDate.slice(8))}（${weekday(g.reserveDate)}）${g.reserveVenue ? `　${g.reserveVenue}` : ""}`,
      });
  }

  return (
    <div className={`pl-g${quiet ? " pl-g--quiet" : ""}`}>
      <p className="pl-title">
        {showDivision && <span className="pl-div">{divisionLabel(g.division)}</span>}
        <b className={off ? "pl-rest" : undefined}>{typeLabel(g.type)}</b>
        {tournamentTitle(g) && <span className="pl-tour">{tournamentTitle(g)}</span>}
      </p>
      {rows.length > 0 && (
        <dl className="pl-dl">
          {rows.map((r) => (
            <Fragment key={r.k}>
              <dt>{r.k}</dt>
              <dd className={r.strong ? "pl-strong" : undefined}>{r.v}</dd>
            </Fragment>
          ))}
        </dl>
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
      <p className="pl-reserve__title">☂ {reserves.map(reserveLabel).join("・")} の予備日</p>
      <p>
        <b>延期のとき</b>
        {reserves.map((x) => `${x.title}${x.venue ? `（${x.venue}）` : ""}`).join("・")}
      </p>
      <p>
        <b>実施のとき</b>
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
  const [half, setHalf] = useState<"all" | "first" | "second">("all");
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [pool, setPool] = useState<Activity[]>([]); // 予備日を調べるため、前の月も含めた予定
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
    const day = (a: Activity) => Number(a.date.slice(8, 10));
    const { from, to } = monthRange(month);
    const list = activities
      .map((a) => ({ ...a, groups: a.groups.filter((g) => divisions.includes(g.division)) }))
      .filter((a) => a.groups.length > 0 || reserves.has(a.date));
    // 予定がなく、予備日だけの日も1行にする
    reserves.forEach((_, date) => {
      if (date >= from && date <= to && !list.some((a) => a.date === date))
        list.push({ id: `reserve-${date}`, date, note: "", groups: [] });
    });
    return list
      .filter((a) => half === "all" || (half === "first" ? day(a) <= 15 : day(a) >= 16))
      .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  }, [activities, divisions, half, reserves, month]);

  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const period =
    half === "first" ? `${m}月前半（1日〜15日）` : half === "second" ? `${m}月後半（16日〜${lastDay}日）` : `${m}月`;
  const title = `${heading} ${y}年${period}の活動予定`;

  // 内容が変わったら、作ったPDFは作り直す
  useEffect(() => {
    setPdf(null);
    setDownloaded(false);
  }, [divisions, month, half, message, activities]);

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
          <div>
            <span className="f-label">期間</span>
            <Choices cols={3}>
              <ToggleButton small on={half === "all"} label="1カ月" onClick={() => setHalf("all")} />
              <ToggleButton small on={half === "first"} label="前半" onClick={() => setHalf("first")} />
              <ToggleButton small on={half === "second"} label="後半" onClick={() => setHalf("second")} />
            </Choices>
            <span className="f-hint block">
              {half === "first" ? `${m}月1日〜15日` : half === "second" ? `${m}月16日〜${lastDay}日` : `${m}月1日〜${lastDay}日`}を載せます。
            </span>
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
      <article ref={sheet} className="px-[14px] py-[14px] text-[12px] leading-snug text-black print:p-0 print:text-[10.5pt]">
        <header className="border-b-2 border-black pb-2">
          <h2 className="text-[19px] font-extrabold print:text-[15pt]">
            {heading}　{y}年{period}の活動予定
          </h2>
          {!heading.startsWith("桜・浅羽野・住吉") && <p className="text-[12px] print:text-[9pt]">桜・浅羽野・住吉 連合チーム</p>}
        </header>

        {!activities && !error && <p className="py-6 text-center">読み込み中…</p>}
        {activities && rows.length === 0 && (
          <p className="py-6 text-center">
            {divisions.length === 0 ? "載せる活動を選んでください。" : half === "all" ? "この月の予定はまだ登録されていません。" : "この期間の予定はまだ登録されていません。"}
          </p>
        )}

        <table className="pl">
          <thead>
            <tr>
              <th className="pl-day">日</th>
              <th className="pl-main">予定</th>
              <th className="pl-mark">お弁当</th>
              <th className="pl-mark">軽食</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const d = Number(a.date.slice(8));
              const wd = weekday(a.date);
              const weekend = wd === "土" || wd === "日";
              const quiet =
                a.groups.every((g) => isOffType(g.type) || (g.type === "部活あり" && !g.returnToSchool)) &&
                !a.note &&
                !reserves.has(a.date);
              return (
                <tr key={a.id} className={`pl-row${weekend ? " pl-row--we" : ""}${quiet ? " pl-row--quiet" : ""}`}>
                  <td className="pl-day">
                    <b>{d}</b>
                    <span className={wd === "土" ? "pl-sat" : wd === "日" ? "pl-sun" : undefined}>{wd}</span>
                  </td>
                  <td className="pl-main">
                    {reserves.get(a.date) && <PrintReserve reserves={reserves.get(a.date)!} a={a} />}
                    {a.groups
                      .filter((g) => !(reserves.has(a.date) && (isOffType(g.type) || a.reserveStatus === "postponed")))
                      .map((g) => (
                        <GroupLines key={g.division} g={g} showDivision={showDivision(a, g)} />
                      ))}
                    {a.note && <p className="pl-note">※{a.note}</p>}
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
