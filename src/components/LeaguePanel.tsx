"use client";

// 3チームのリーグ戦：順位表と「次の試合で2日目に進むには」を出す小さな部品です。
// スコアが1試合も入っていなければ何も出しません。

import { isJJBF, leagueView, OUR } from "@/lib/league";
import type { ActivityGroup } from "@/lib/activities";

// JJBF大会（大会名に「JJBF」）だけで出す。順位の決め方はJJBF埼玉の要項どおり
export function LeaguePanel({
  group,
  compact = false,
}: {
  group: ActivityGroup;
  compact?: boolean; // 一覧・ホーム用（順位表は省く）
}) {
  if (!isJJBF(group)) return null;
  const v = leagueView(group.games, "jjbf");
  if (!v) return null;
  return (
    <div className={`lg${compact ? " lg--compact" : ""}`}>
      <p className="lg__title">リーグ戦の状況（1位だけ2日目へ）</p>
      {!compact && (
        <table className="lg__table">
          <thead>
            <tr>
              <th>順</th>
              <th>チーム</th>
              <th>勝点</th>
              <th>失点</th>
              <th>得失</th>
              <th>成績</th>
            </tr>
          </thead>
          <tbody>
            {v.rows.map((r, i) => (
              <tr key={r.team} className={r.team === OUR ? "is-us" : undefined}>
                <td>{i + 1}</td>
                <td>{r.team}</td>
                <td>{r.points}</td>
                <td>{r.allowed}</td>
                <td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                <td className="lg__rec">
                  {r.win}勝{r.lose}敗{r.draw ? `${r.draw}分` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {v.final && (
        <p className={`lg__final ${v.final.ok ? "is-ok" : v.final.ok === false ? "is-ng" : ""}`}>{v.final.text}</p>
      )}
      {v.next && (
        <div className="lg__next">
          <p className="lg__next-title">{v.next.title}</p>
          <ul>
            {v.next.lines.map((l, i) => (
              <li key={i} className={`lg__line lg__line--${l.mark === "◎" ? "ok" : l.mark === "×" ? "ng" : "if"}`}>
                <b>{l.mark}</b>
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.waiting && <p className="lg__wait">{v.waiting}</p>}
      {!compact && <p className="lg__rulenote">順位の決め方：{v.ruleLabel.replace(/^JJBF埼玉（|）$/g, "")}（JJBF埼玉の要項）</p>}
    </div>
  );
}
