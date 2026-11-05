"use client";

// 動静表の一覧（紙・画像・PDF 用）。
//   みんな版（保護者・指導者に送る）… 出欠の表だけ（連絡先・理由・体調は載せない）
//   指導者版 … 出欠の表＋緊急連絡先・理由・帰省や旅行・体調・先生の記入欄

import { forwardRef } from "react";
import { formatDate } from "@/lib/activities";
import { cellText, datesBetween, type DoseiEntry, type DoseiNote, type DoseiTerm } from "@/lib/dosei";

export type SheetKind = "all" | "staff";

const CHUNK = 16; // 1つの表に入れる日数（A4の幅に収める）

function chunks<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

export const DoseiSheet = forwardRef<
  HTMLElement,
  {
    term: DoseiTerm;
    latest: Map<string, DoseiEntry & { count: number }>;
    notes: Record<string, DoseiNote>;
    kind: SheetKind;
  }
>(function DoseiSheet({ term, latest, notes, kind }, ref) {
  const dates = datesBetween(term.start, term.end);
  const submitted = term.members.filter((m) => latest.has(m.id)).length;
  const w = (d: string) => new Date(d.replace(/-/g, "/")).getDay();
  const detailRows = term.members.filter((m) => latest.has(m.id) || notes[m.id]?.note);

  return (
    <article ref={ref} className="dsh">
      <header className="dsh-head">
        <p className="dsh-team">桜・浅羽野・住吉 連合チーム</p>
        <h2 className="dsh-title">
          {term.title} 動静表<span className="dsh-kind">{kind === "staff" ? "指導者用（取り扱い注意）" : ""}</span>
        </h2>
        <p className="dsh-meta">
          期間：{formatDate(term.start)}〜{formatDate(term.end)}（{dates.length}日間）　提出：{submitted}／{term.members.length}人
        </p>
        <p className="dsh-legend">空欄＝出席　欠＝欠席　遅＝遅刻（来る時刻）　早＝早退（帰る時刻）　他＝その他　／　未＝まだ出ていない</p>
      </header>

      {chunks(dates, CHUNK).map((part, ci) => (
        <table key={ci} className="dsh-table">
          <colgroup>
            <col style={{ width: 24 }} />
            <col style={{ width: 118 }} />
            <col style={{ width: 62 }} />
            {part.map((d) => (
              <col key={d} />
            ))}
            {Array.from({ length: CHUNK - part.length }).map((_, i) => (
              <col key={`pad${i}`} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>No</th>
              <th>名前</th>
              <th>学校</th>
              {part.map((d) => (
                <th key={d} className={w(d) === 0 ? "is-sun" : w(d) === 6 ? "is-sat" : undefined}>
                  {Number(d.slice(5, 7))}/{Number(d.slice(8))}
                  <small>{"日月火水木金土"[w(d)]}</small>
                </th>
              ))}
              {Array.from({ length: CHUNK - part.length }).map((_, i) => (
                <th key={`pad${i}`} className="is-pad" />
              ))}
            </tr>
          </thead>
          <tbody>
            {term.members.map((m, i) => {
              const e = latest.get(m.id);
              return (
                <tr key={m.id} className={e ? undefined : "is-missing"}>
                  <td className="dsh-no">{i + 1}</td>
                  <td className="dsh-name">{m.name}</td>
                  <td className="dsh-school">
                    {m.school.replace(/中$/, "")}
                    {m.grade}
                  </td>
                  {part.map((d) => {
                    const t = e ? cellText(e.days[d]) : "未";
                    return (
                      <td key={d} className={`dsh-cell dsh-cell--${t ? t[0] : "ok"}`}>
                        {t}
                      </td>
                    );
                  })}
                  {Array.from({ length: CHUNK - part.length }).map((_, k) => (
                    <td key={`pad${k}`} className="is-pad" />
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>出席の予定</td>
              {part.map((d) => {
                const out = term.members.filter((m) => latest.get(m.id)?.days[d]?.s === "欠").length;
                return <td key={d}>{term.members.length - out}</td>;
              })}
              {Array.from({ length: CHUNK - part.length }).map((_, i) => (
                <td key={`pad${i}`} className="is-pad" />
              ))}
            </tr>
          </tfoot>
        </table>
      ))}

      {kind === "staff" && (
        <table className="dsh-detail">
          <colgroup>
            <col style={{ width: 92 }} />
            <col style={{ width: 150 }} />
            <col />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th>名前</th>
              <th>緊急連絡先</th>
              <th>欠席などの理由／帰省・旅行／体調</th>
              <th>先生の記入欄</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((m) => {
              const e = latest.get(m.id);
              const n = notes[m.id];
              const marks = e ? dates.filter((d) => e.days[d]?.s) : [];
              return (
                <tr key={m.id}>
                  <td className="dsh-name">
                    {m.name}
                    {e && <small>記入：{e.writer === "本人" ? "本人" : e.parentName || "保護者"}</small>}
                  </td>
                  <td>
                    {e?.contacts.map((c, i) => (
                      <span key={i} className="dsh-tel">
                        {c.who && <b>{c.who}</b>}
                        {c.tel}
                      </span>
                    ))}
                  </td>
                  <td>
                    {marks.map((d) => (
                      <span key={d} className="dsh-line">
                        {formatDate(d)} {cellText(e!.days[d])}
                        {e!.days[d].reason ? `：${e!.days[d].reason}` : ""}
                      </span>
                    ))}
                    {e?.trip && <span className="dsh-line">【帰省・旅行】{e.trip}</span>}
                    {e?.health && <span className="dsh-line">【体調】{e.health}</span>}
                  </td>
                  <td>
                    {n?.checked && <b className="dsh-check">確認済み</b>}
                    {n?.note}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </article>
  );
});
