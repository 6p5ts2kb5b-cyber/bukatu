"use client";

// 平日の「部活あり／部活なし」をまとめて入れる画面です。
// 月を選ぶと、その月の日が並ぶので「あり」「なし」を押していくだけ。最後に「保存」でまとめて登録します。
// 練習試合などが入っている日は、そのまま残します（ここでは変えません）。

import Link from "next/link";
import { holidayName } from "@/lib/holidays";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Choices, ErrorText, Loading, PageHead, Toast, ToggleButton } from "@/components/ui";
import {
  createActivity,
  deleteActivity,
  DIVISIONS,
  listRange,
  hasWeekdayPractice,
  isWeekend,
  newGroup,
  saveActivity,
  weekday,
  type Activity,
  type DivisionKey,
} from "@/lib/activities";

type Mark = "あり" | "なし" | "";

function ym(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function BulkPage() {
  const [month, setMonth] = useState(ym());
  const [division, setDivision] = useState<DivisionKey>("sumiyoshi");
  const [withWeekend, setWithWeekend] = useState(false);
  const [acts, setActs] = useState<Activity[] | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({}); // 日付 → 押した内容
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  // 予定の一覧から「○月の空いている日をまとめて入力」で来たとき：その月・土日も表示
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const mo = q.get("month");
    if (mo && /^\d{4}-\d{2}$/.test(mo)) setMonth(mo);
    if (q.get("blank")) setWithWeekend(true);
    const dv = q.get("division");
    if (dv && DIVISIONS.some((d) => d.key === dv)) setDivision(dv as DivisionKey);
  }, []);

  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const days = useMemo(
    () =>
      Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`).filter((d) =>
        // 平日に練習がある区分（住吉のみ）は平日を、合同チームなどは土日・祝日を並べる。チェックでもう一方も出す
        hasWeekdayPractice(division) ? withWeekend || !isWeekend(d) : withWeekend || isWeekend(d),
      ),
    [month, last, withWeekend, division],
  );

  const load = () => {
    setActs(null);
    listRange(`${month}-01`, `${month}-${String(last).padStart(2, "0")}`)
      .then((list) => {
        setActs(list);
        setMarks({});
      })
      .catch(() => setError("予定を読み込めませんでした。電波の良い場所で開き直してください。"));
  };
  useEffect(load, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  // その日の、選んだ区分の今の状態
  const current = (date: string): { mark: Mark; other?: string } => {
    const a = acts?.find((x) => x.date === date);
    const g = a?.groups.find((x) => x.division === division);
    if (!g) {
      // ほかの区分で練習試合などが入っている日は、ここでは触らない
      const busy = a?.groups.find((x) => x.type !== "部活あり" && x.type !== "部活なし" && x.type !== "練習なし");
      return busy ? { mark: "", other: busy.type } : { mark: "" };
    }
    if (g.type === "部活あり") return { mark: "あり" };
    if (g.type === "部活なし" || g.type === "練習なし") return { mark: "なし" };
    return { mark: "", other: g.type }; // 練習試合など → ここでは変えない
  };
  const shown = (date: string): Mark => (date in marks ? marks[date] : current(date).mark);
  const changed = Object.keys(marks).filter((d) => marks[d] !== current(d).mark);

  // まだ何も入っていない日（ほかの区分の予定もない日）
  const isBlankDay = (date: string) => !acts?.some((x) => x.date === date && x.groups.length > 0);
  const blankDays = days.filter((d) => isBlankDay(d) && !(d in marks));
  const setBlanks = (mk: Mark) => {
    const next: Record<string, Mark> = { ...marks };
    blankDays.forEach((d) => {
      next[d] = mk;
    });
    setMarks(next);
  };

  const setAll = (mk: Mark) => {
    const next: Record<string, Mark> = { ...marks };
    days.forEach((d) => {
      if (!current(d).other) next[d] = mk;
    });
    setMarks(next);
  };

  const save = async () => {
    if (!acts || !changed.length) return;
    setSaving(true);
    setError(null);
    try {
      for (const date of changed) {
        const mk = marks[date];
        const a = acts.find((x) => x.date === date);
        // 土日・祝日は「練習」「練習なし」、平日は「部活あり」「部活なし」
        const type = isWeekend(date) ? (mk === "あり" ? "練習" : "練習なし") : mk === "あり" ? "部活あり" : "部活なし";
        if (!a) {
          if (mk) await createActivity({ date, note: "", groups: [{ ...newGroup(division, date), type }] });
          continue;
        }
        const has = a.groups.some((g) => g.division === division);
        let groups = a.groups;
        if (!mk) groups = groups.filter((g) => g.division !== division);
        else if (has) groups = groups.map((g) => (g.division === division ? { ...g, type } : g));
        else groups = [...groups, { ...newGroup(division, date), type }];
        if (groups.length === 0) await deleteActivity(a.id);
        else await saveActivity({ ...a, groups });
      }
      setToast(`${changed.length}日分を保存しました`);
      load();
    } catch {
      setError("保存できませんでした。電波の良い場所でもう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const monthOptions = [-1, 0, 1, 2, 3].map((o) => ym(o));
  const count = (mk: Mark) => days.filter((d) => shown(d) === mk && !current(d).other).length;

  return (
    <>
      <PageHead
        kicker="QUICK"
        title="部活あり・休養日をまとめて入力"
        lead="日ごとに「部活あり」「休養日」「空欄」を押して、最後に保存するだけ。"
        action={
          <Link href="/activities" className="btn btn--ghost btn--small shrink-0">
            予定へ
          </Link>
        }
      />

      <section className="panel flex flex-col gap-4">
        <div>
          <span className="f-label">月</span>
          <Choices cols={5}>
            {monthOptions.map((mo) => (
              <ToggleButton
                key={mo}
                small
                on={month === mo}
                label={`${Number(mo.slice(5))}月`}
                onClick={() => {
                  if (changed.length && !confirm("保存していない入力があります。月を変えますか？")) return;
                  setMonth(mo);
                }}
              />
            ))}
          </Choices>
        </div>
        <div>
          <span className="f-label">区分</span>
          <div className="filters" style={{ flexWrap: "wrap" }}>
            {DIVISIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                className="filter"
                aria-pressed={division === d.key}
                onClick={() => {
                  if (changed.length && !confirm("保存していない入力があります。区分を変えますか？")) return;
                  setMarks({});
                  setDivision(d.key);
                  setWithWeekend(false);
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={withWeekend} onChange={(e) => setWithWeekend(e.target.checked)} />
          {hasWeekdayPractice(division) ? "土日・祝日も表示する" : "平日も表示する（たまの平日合同練習など）"}
        </label>
        {acts && blankDays.length > 0 && (
          <div className="blank-warn">
            <p className="blank-warn__title">まだ予定が入っていない日が {blankDays.length}日 あります</p>
            <p className="blank-warn__body">下の一覧で「未入力」と出ている日です。まとめて入れるか、1日ずつ押してください。</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setBlanks("あり")}>
                未入力→部活あり
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setBlanks("なし")}>
                未入力→休養日
              </button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setAll("あり")}>
            全部あり
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setAll("なし")}>
            全部休養日
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setAll("")}>
            全部空欄
          </button>
        </div>
      </section>

      {error && <ErrorText>{error}</ErrorText>}
      {!acts && !error && <Loading />}

      {acts && (
        <>
          <p className="group-label">
            {m}月　部活あり {count("あり")}日・休養日 {count("なし")}日・空欄 {count("")}日
          </p>
          <ul className="qk">
            {days.map((d) => {
              const cur = current(d);
              const mk = shown(d);
              const wd = weekday(d);
              const edited = d in marks && marks[d] !== cur.mark;
              return (
                <li key={d} className={`qk__row${wd === "土" || wd === "日" || holidayName(d) ? " qk__row--we" : ""}${edited ? " qk__row--edited" : ""}`}>
                  <span className="qk__date">
                    <b>{Number(d.slice(8))}</b>
                    <span className={wd === "日" || holidayName(d) ? "pl-sun" : wd === "土" ? "pl-sat" : undefined}>{wd}</span>
                    {holidayName(d) && <span className="qk__holiday">{holidayName(d)}</span>}
                    {isBlankDay(d) && !(d in marks) && <span className="qk__blank">未入力</span>}
                  </span>
                  {cur.other ? (
                    <Link href={`/activities/${acts.find((x) => x.date === d)!.id}`} className="qk__other">
                      {cur.other}（予定画面で編集）
                    </Link>
                  ) : (
                    <span className="qk__btns">
                      <button
                        type="button"
                        className="qk__btn qk__btn--on"
                        aria-pressed={mk === "あり"}
                        onClick={() => setMarks({ ...marks, [d]: "あり" })}
                      >
                        部活あり
                      </button>
                      <button
                        type="button"
                        className="qk__btn qk__btn--off"
                        aria-pressed={mk === "なし"}
                        onClick={() => setMarks({ ...marks, [d]: "なし" })}
                      >
                        休養日
                      </button>
                      <button
                        type="button"
                        className="qk__btn qk__btn--blank"
                        aria-pressed={mk === ""}
                        onClick={() => setMarks({ ...marks, [d]: "" })}
                      >
                        空欄
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="f-hint">再登校・会場・持ち物などは、保存したあと予定の画面でその日を開いて入れます。</p>
        </>
      )}

      <div className="h-16" aria-hidden />
      <div className="savebar">
        <div>
          <button type="button" className="btn btn--accent" disabled={!changed.length || saving} onClick={save}>
            {saving ? "保存中…" : changed.length ? `${changed.length}日分を保存する` : "押すと、ここで保存できます"}
          </button>
        </div>
      </div>
      <Toast message={toast} onDone={clearToast} />
    </>
  );
}
