"use client";

// ホーム画面（スコアボード型）。
// 「次の予定で、まだ決まっていないものは何か」を、開いた瞬間にランプ（緑・黄・赤）と大きな数字で見せます。
//   ① 見出し（要確認の件数）
//   ② スコアボード：次の予定1件。区分ごとのボードに、時刻のマス目とランプの列
//   ③ 要確認：赤・黄のものだけを日付ごとに
//   ④ その先の予定：1行ずつ、ランプの列だけ
// ホームは見るだけ。入力は、行や「詳細」を押した先の画面でします。

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ErrorText } from "@/components/ui";
import {
  isRef,
  listUpcoming,
  normalizeTeam,
  todayString,
  tournamentTitle,
  typeLabel,
  weekday,
  type Activity,
} from "@/lib/activities";
import { listNotices } from "@/lib/notices";
import {
  collectIssues,
  isQuiet,
  stateText,
  unitsOf,
  worstLevel,
  type Issue,
  type Level,
  type Unit,
} from "@/lib/status";

const vars = (v: Record<string, string | number>) => v as unknown as CSSProperties;

// 点灯の順番（ホームを開いたとき、ランプが上から順に光る）
let lampSeq = 0;
function Lamp({ level, i }: { level: Level; i?: number }) {
  return <span className={`lamp lamp--${level}`} style={vars({ "--i": i ?? lampSeq++ })} aria-hidden />;
}

function BigDate({ date, size }: { date: string; size: "sm" | "lg" }) {
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const wd = weekday(date);
  return (
    <span className={`bigdate bigdate--${size}`} aria-label={`${m}月${d}日（${wd}）`}>
      <span className="bigdate__num">
        {m}
        <span className="bigdate__sep">/</span>
        {d}
      </span>
      <span className={`bigdate__wd${wd === "土" ? " is-sat" : wd === "日" ? " is-sun" : ""}`}>{wd}</span>
    </span>
  );
}

function daysUntil(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [ty, tm, td] = todayString().split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000);
}
function untilText(n: number): string {
  return n <= 0 ? "今日" : n === 1 ? "明日" : `あと${n}日`;
}

// 一覧に出す短い名前：練習試合は相手チーム名、それ以外（大会など）は種類のまま
function shortLabel(g: Unit["group"]): string {
  if (g.type === "練習試合") {
    const names = [
      ...new Set(g.games.filter((x) => !x.others).map((x) => normalizeTeam(x.opponent)).filter((t) => t && !isRef(t))),
    ];
    if (names.length) return `vs ${names.join("・")}`;
  }
  return typeLabel(g.type);
}

const LEVEL_WORD: Record<Level, string> = { ok: "準備OK", warn: "確認中", ng: "未確定", none: "" };

// 区分ごとの1枚
function Board({ u }: { u: Unit }) {
  const g = u.group;
  const quiet = isQuiet(g);
  const checks = u.checks.filter((c) => c.key !== "venue"); // 会場は上の行に出すので重ねない
  return (
    <article className={`board board--${u.division}`}>
      <div className="board__head">
        <span className="board__name">
          {u.name}
          <small>{typeLabel(g.type)}</small>
        </span>
        {!quiet && (
          <span className={`board__state board__state--${u.level}`}>
            <Lamp level={u.level} />
            {stateText(u.checks)}
          </span>
        )}
      </div>
      {quiet ? (
        <p className="board__quiet">準備するものはありません</p>
      ) : (
        <>
          <p className="board__venue">
            <span className="board__venue-label">会場</span>
            {g.venue ? <span>{g.venue}</span> : <span className="board__dim">未定</span>}
          </p>
          {u.cells.length > 0 && (
            <div className="linescore">
              {u.cells.map((c, i) => (
                <div key={i} className={`ls${c.value ? "" : " ls--empty"}`}>
                  <span className="ls__label">{c.label}</span>
                  <span className="ls__num">{c.value || "—"}</span>
                </div>
              ))}
            </div>
          )}
          <div className="board__checks">
            {checks.map((c) => (
              <div key={c.key} className={`bc bc--${c.level}`}>
                <Lamp level={c.level} />
                <span className="bc__label">{c.label}</span>
                <span className="bc__text">{c.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

export default function Home() {
  const [list, setList] = useState<Activity[] | null>(null);
  const [noticeIds, setNoticeIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUpcoming()
      .then(setList)
      .catch(() => setError("予定を読み込めませんでした。電波の良い場所で開き直してください。"));
    listNotices()
      .then((ns) => setNoticeIds(new Set(ns.map((n) => n.activityId).filter(Boolean))))
      .catch(() => {});
  }, []);

  const noticeFor = useMemo(() => (a: Activity) => noticeIds.has(a.id), [noticeIds]);

  // 次の予定：準備が必要な予定の中でいちばん近いもの（なければ、いちばん近い予定）
  const next = useMemo(() => {
    if (!list?.length) return null;
    return list.find((a) => a.groups.some((g) => !isQuiet(g))) ?? list[0];
  }, [list]);
  const later = useMemo(() => (list ?? []).filter((a) => a.id !== next?.id).slice(0, 14), [list, next]);
  const issues = useMemo(() => (list ? collectIssues(list, noticeFor) : []), [list, noticeFor]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!list) return <p className="py-16 text-center text-sm font-bold text-navy-soft">読み込み中…</p>;

  lampSeq = 0;
  const ngCount = issues.filter((i) => i.item.level === "ng").length;
  const tally: Level = ngCount ? "ng" : issues.length ? "warn" : "ok";

  // 要確認を日付ごとに
  const byDay: { date: string; activityId: string; items: Issue[] }[] = [];
  for (const it of issues) {
    let d = byDay.find((x) => x.activityId === it.activityId);
    if (!d) {
      d = { date: it.date, activityId: it.activityId, items: [] };
      byDay.push(d);
    }
    d.items.push(it);
  }
  const multiDiv = (id: string) => (list.find((a) => a.id === id)?.groups.length ?? 0) > 1;

  if (!next) {
    return (
      <div className="home">
        <div className="home-empty">
          <p className="home-empty__title">これからの予定はまだありません</p>
          <p>次の練習や試合を登録すると、ここに準備の状況が出ます。</p>
          <Link href="/activities/new" className="btn btn--primary">
            予定を追加する
          </Link>
        </div>
      </div>
    );
  }

  const nextUnits = unitsOf(next, noticeFor);
  const types = [...new Set(next.groups.map((g) => tournamentTitle(g) || shortLabel(g)))].join("・");

  return (
    <div className="home">
      <div className="home-head">
        <p className="home-head__title">準備の状況</p>
        <a href="#issues" className={`tally tally--${tally}`}>
          <Lamp level={tally} />
          {tally === "ok" ? "すべて準備OK" : `要確認 ${issues.length}件`}
        </a>
      </div>

      {/* ② スコアボード：次の予定 */}
      <section className="next" aria-label="次の予定">
        <div className="next__head">
          <BigDate date={next.date} size="lg" />
          <div className="next__meta">
            <span className="next__until">{untilText(daysUntil(next.date))}</span>
            <span className="next__type">{types}</span>
          </div>
          <Link href={`/activities/${next.id}`} className="next__open">
            詳細
          </Link>
        </div>
        <div className={`next__boards${nextUnits.length > 1 ? " next__boards--2" : ""}`}>
          {nextUnits.map((u) => (
            <Board key={u.division} u={u} />
          ))}
        </div>
        {next.note && <p className="next__note">※{next.note}</p>}
      </section>

      {/* ③ 要確認 */}
      <section className="block" id="issues" aria-labelledby="issues-title">
        <div className="block__head">
          <h2 className="block__title" id="issues-title">
            要確認
          </h2>
          {issues.length > 0 && <span className="block__count">{issues.length}</span>}
        </div>
        {issues.length === 0 ? (
          <p className="all-clear">
            <Lamp level="ok" />
            すべて準備できています
          </p>
        ) : (
          <div className="issue-days">
            {byDay.map((d) => (
              <Link key={d.activityId} href={`/activities/${d.activityId}`} className="issue-day">
                <span className="issue-day__date">
                  <BigDate date={d.date} size="sm" />
                </span>
                <span className="issue-day__list">
                  {d.items.map((it, i) => (
                    <span key={i} className={`issue issue--${it.item.level}`}>
                      <Lamp level={it.item.level} />
                      <span className="issue__text">
                        {it.item.label} {it.item.text}
                        {multiDiv(d.activityId) && <span className="div-tag">{it.name}</span>}
                      </span>
                    </span>
                  ))}
                </span>
                <span className="issue__chev" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ④ その先の予定 */}
      {later.length > 0 && (
        <section className="block" aria-labelledby="later-title">
          <div className="block__head">
            <h2 className="block__title" id="later-title">
              その先の予定
            </h2>
            <Link href="/activities" className="block__more">
              すべて見る
            </Link>
          </div>
          <div className="later">
            {later.map((a) => (
              <Link key={a.id} href={`/activities/${a.id}`} className="later__row">
                <BigDate date={a.date} size="sm" />
                <span className="later__units">
                  {unitsOf(a, noticeFor).map((u) => {
                    const quiet = isQuiet(u.group);
                    return (
                      <span key={u.division} className={`mini mini--${u.division}`}>
                        <span className="mini__name">
                          {a.groups.length > 1 && !quiet ? `${u.name}・` : ""}
                          {shortLabel(u.group)}
                        </span>
                        <span className="mini__lamps">
                          {u.checks.map((c) => (
                            <Lamp key={c.key} level={c.level} i={0} />
                          ))}
                        </span>
                        <span className={`mini__state mini__state--${quiet ? "none" : worstLevel(u.checks)}`}>
                          {quiet ? "" : LEVEL_WORD[worstLevel(u.checks)]}
                        </span>
                      </span>
                    );
                  })}
                </span>
                <span className="issue__chev" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
