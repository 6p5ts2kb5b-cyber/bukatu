"use client";

// JJBF大会・STORM杯：リーグ戦の結果（各試合のスコアと順位表）を、保護者に送る画像・PDF・文章にします。
// 新人戦・学総など（トーナメント）：各試合のスコアだけ（順位表なし）。
// 「2日目に進むための条件」はスタッフ用なので、ここには入れません。

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDateLong, tournamentTitle, type ActivityGroup, type Game } from "@/lib/activities";
import { leagueRuleOf, leagueView, OUR, resolveGames, resultKindOf } from "@/lib/league";
import { elementToPdf, elementToPng, shareOrDownload } from "@/lib/sharePdf";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

// ランニングスコア：先攻・後攻の順に、回ごとの点（「X」＝裏の攻撃なし）
type Line = { name: string; cells: string[]; total: number | null };
function lineOf(g: Game, a: string, b: string): Line[] | null {
  const lh = g.lh ?? [];
  const la = g.la ?? [];
  if (!lh.some((v) => v != null) && !la.some((v) => v != null)) return null;
  const leftFirst = (g.first ?? "l") === "l";
  const top = leftFirst ? { name: a, v: lh, t: g.sh } : { name: b, v: la, t: g.sa };
  const bot = leftFirst ? { name: b, v: la, t: g.sa } : { name: a, v: lh, t: g.sh };
  const n = Math.max(top.v.length, bot.v.length);
  const cols = Math.max(7, n);
  const cell = (v: (number | null)[], i: number, isBottom: boolean) => {
    const x = v[i];
    if (x != null) return String(x);
    // 最終回の裏をやらなかった（後攻が勝っていた）
    if (isBottom && i === n - 1 && top.v[i] != null) return "X";
    return "";
  };
  return [
    { name: top.name, cells: Array.from({ length: cols }, (_, i) => cell(top.v, i, false)), total: top.t ?? null },
    { name: bot.name, cells: Array.from({ length: cols }, (_, i) => cell(bot.v, i, true)), total: bot.t ?? null },
  ];
}

function LineTable({ line }: { line: Line[] }) {
  return (
    <table className="rc__line">
      <thead>
        <tr>
          <th />
          {line[0].cells.map((_, i) => (
            <th key={i}>{i + 1}</th>
          ))}
          <th>計</th>
        </tr>
      </thead>
      <tbody>
        {line.map((r, k) => (
          <tr key={k} className={r.name === OUR ? "is-us" : undefined}>
            <td className="rc__line-team">{r.name}</td>
            {r.cells.map((c, i) => (
              <td key={i}>{c}</td>
            ))}
            <td className="rc__line-sum">{r.total ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ResultSend({ group, date }: { group: ActivityGroup; date: string }) {
  const [open, setOpen] = useState(false);
  const kind = resultKindOf(group);
  const rule = leagueRuleOf(group);
  const view = rule ? leagueView(group.games, rule) : null;
  const anyScore = group.games.some((g) => g.sh != null && g.sa != null);
  if (!kind || (rule ? !view : !anyScore)) return null;
  return (
    <>
      <button type="button" className="btn btn--line lg__send" onClick={() => setOpen(true)}>
        結果を保護者に送る（画像・PDF・文章）
      </button>
      {/* 画面全体に出すため body の直下へ（親の動きの影響を受けないように） */}
      {open && createPortal(<ResultSheet group={group} date={date} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ResultSheet({ group, date, onClose }: { group: ActivityGroup; date: string; onClose: () => void }) {
  const rule = leagueRuleOf(group); // null ならトーナメント
  const view = rule ? leagueView(group.games, rule) : null;
  const games = resolveGames(group.games);
  const title = tournamentTitle(group) || group.type;
  const storm = rule === "storm";
  // トーナメント：うちの最後の試合の勝ち負け
  const ourLast = [...games].reverse().find((g) => (g.a === OUR || g.b === OUR) && g.sa != null && g.sb != null);
  const ourWin = ourLast ? (ourLast.a === OUR ? ourLast.sa! > ourLast.sb! : ourLast.sb! > ourLast.sa!) : null;
  const done = view ? !!view.final : ourLast != null && !games.some((g) => (g.a === OUR || g.b === OUR) && (g.sa == null || g.sb == null));
  const advanced = view ? view.final?.ok === true : ourWin === true;
  const [message, setMessage] = useState(
    view
      ? !done
        ? "途中経過です。"
        : advanced
          ? "1位で次のステージに進出しました！応援ありがとうございました。"
          : "応援ありがとうございました。"
      : ourWin === true
        ? "勝ち進みました！次の試合も応援よろしくお願いします。"
        : ourWin === false
          ? "応援ありがとうございました。"
          : "途中経過です。",
  );
  const card = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"" | "png" | "pdf">("");
  const [made, setMade] = useState<{ png?: File; pdf?: File }>({});
  const [note, setNote] = useState("");

  // 内容が変わったら作り直す
  useEffect(() => setMade({}), [message, group]);

  const fileBase = `${title}_結果_${date}`.replace(/\s+/g, "_");
  const send = async (kind: "png" | "pdf") => {
    if (!card.current || busy) return;
    setNote("");
    try {
      let file = made[kind];
      if (!file) {
        setBusy(kind);
        file =
          kind === "png"
            ? await elementToPng(card.current, `${fileBase}.png`, 600)
            : await elementToPdf(card.current, `${fileBase}.pdf`, { onePage: true, width: 600 });
        setMade((m) => ({ ...m, [kind]: file }));
        setBusy("");
      }
      const r = await shareOrDownload(file, `${title} 結果`);
      if (r === "downloaded") setNote("保存しました。LINEやメールに添付して送ってください。");
    } catch {
      setBusy("");
      // 作るのに時間がかかると、スマホが共有画面を開かせてくれないことがある
      setNote("もう一度ボタンを押してください。");
    }
  };

  const text = useMemo(() => {
    const out: string[] = [`【${title}　結果】${OUR}`, formatDateLong(date), "", "■試合結果"];
    games.forEach((g, i) => {
      const done = g.sa != null && g.sb != null;
      out.push(`${CIRCLED[i]}　${g.a ?? "未定"}　${done ? `${g.sa} − ${g.sb}` : "対"}　${g.b ?? "未定"}${done ? "" : "（これから）"}`);
      const line = lineOf(group.games[i], g.a ?? "未定", g.b ?? "未定");
      if (line)
        line.forEach((r, k) =>
          out.push(`　${k === 0 ? "先" : "後"}　${r.name}　${r.cells.map((c) => c || "-").join(" ")}　計${r.total ?? ""}`),
        );
    });
    if (view) out.push("", "■順位");
    (view?.rows ?? []).forEach((r, i) => {
      out.push(`${i + 1}位　${r.team}`);
      out.push(
        `　勝ち点${r.points}・${storm ? `失点率${r.rate.toFixed(2)}` : `失点${r.allowed}`}・得失点差${r.diff > 0 ? "+" : ""}${r.diff}`,
      );
    });
    if (message.trim()) out.push("", message.trim());
    return out.join("\n");
  }, [title, date, games, view, storm, message, group.games]);

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
  };

  return (
    <div className="rs-sheet" role="dialog" aria-label="結果を保護者に送る">
      <div className="rs-sheet__inner">
        <div className="rs-sheet__head">
          <p>結果を保護者に送る</p>
          <button type="button" className="rs-sheet__close" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>

        {/* ---- 送る絵（画像・PDF） ---- */}
        <div ref={card} className="rc">
          <div className="rc__head">
            <p className="rc__title">{title}　結果</p>
            <p className="rc__date">
              {formatDateLong(date)}　{OUR}
            </p>
          </div>
          <p className="rc__label">試合結果</p>
          <ul className="rc__games">
            {games.map((g, i) => {
              const has = g.sa != null && g.sb != null;
              const aw = has && g.sa! > g.sb!;
              const bw = has && g.sb! > g.sa!;
              return (
                <li key={i} className="rc__game">
                  <span className="rc__no">{CIRCLED[i]}</span>
                  <span className={`rc__team rc__team--a${aw ? " is-win" : ""}${g.a === OUR ? " is-us" : ""}`}>{g.a ?? "未定"}</span>
                  <span className="rc__score">
                    {has ? (
                      <>
                        <b className={aw ? "is-win" : undefined}>{g.sa}</b>
                        <i>−</i>
                        <b className={bw ? "is-win" : undefined}>{g.sb}</b>
                      </>
                    ) : (
                      <i>これから</i>
                    )}
                  </span>
                  <span className={`rc__team rc__team--b${bw ? " is-win" : ""}${g.b === OUR ? " is-us" : ""}`}>{g.b ?? "未定"}</span>
                  {(() => {
                    const line = lineOf(group.games[i], g.a ?? "未定", g.b ?? "未定");
                    return line ? (
                      <div className="rc__line-wrap">
                        <LineTable line={line} />
                      </div>
                    ) : null;
                  })()}
                </li>
              );
            })}
          </ul>
          {view && (
            <>
          <p className="rc__label">順位</p>
          <table className="rc__table">
            <thead>
              <tr>
                <th>順位</th>
                <th>チーム</th>
                <th>勝ち点</th>
                <th>{storm ? "失点率" : "失点"}</th>
                <th>得失点差</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r, i) => (
                <tr key={r.team} className={r.team === OUR ? "is-us" : undefined}>
                  <td>{i + 1}</td>
                  <td>{r.team}</td>
                  <td>{r.points}</td>
                  <td>{storm ? r.rate.toFixed(2) : r.allowed}</td>
                  <td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
            </>
          )}
          {message.trim() && <p className={`rc__msg${advanced ? " is-win" : ""}`}>{message.trim()}</p>}
          {view && <p className="rc__rule">
            {storm
              ? "勝ち点：勝ち3・引き分け1（コールド勝ち・完封勝ちは＋1）／並んだら 失点率→得失点差→出塁数→抽選"
              : "勝ち点：勝ち3・引き分け1／並んだら 失点の少なさ→得失点差→出塁数→抽選"}
          </p>}
        </div>

        <label className="rs-sheet__field">
          ひとこと（絵と文章の一番下に入ります）
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
        </label>

        <div className="rs-sheet__btns">
          <button type="button" className="btn btn--line" disabled={!!busy} onClick={() => send("png")}>
            {busy === "png" ? "画像を作っています…" : made.png ? "画像を送る" : "画像でLINEに送る"}
          </button>
          <button type="button" className="btn btn--accent" disabled={!!busy} onClick={() => send("pdf")}>
            {busy === "pdf" ? "PDFを作っています…" : made.pdf ? "PDFを送る" : "PDFで送る"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={copy}>
            {copied ? "文章をコピーしました" : "文章をコピー（LINEに貼る）"}
          </button>
        </div>
        {note && <p className="rs-sheet__note">{note}</p>}
        <details className="rs-sheet__text">
          <summary>文章の見本</summary>
          <pre>{text}</pre>
        </details>
      </div>
    </div>
  );
}
