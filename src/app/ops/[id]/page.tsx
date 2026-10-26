"use client";

// 大会運営：1つの大会の、ブロックごとのリーグ戦（うちが出ないブロックも）を打ち込む画面です。
//   上：各ブロックの1位（2日目に進むチーム）の一覧と「運営に送る」
//   下：ブロックごとに、3チーム・3試合・結果を入れると、順位表と「最後の試合の結果ごとの1位」が出る
// 入力は自動で保存されます。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ErrorText, Field, inputClass, Loading, SecondaryButton, ToggleButton, Choices } from "@/components/ui";
import { LineEditor } from "@/components/ActivityEditor";
import { LineTable, lineOf } from "@/components/ResultSend";
import { formatDateLong, type Game } from "@/lib/activities";
import { blockView, resolveGames, type BlockView, type LeagueRule } from "@/lib/league";
import { deleteOps, getOps, newBlock, saveOps, type OpsBlock, type OpsTournament } from "@/lib/ops";
import { elementToPdf, elementToPng, shareOrDownload } from "@/lib/sharePdf";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

// コールド勝ち（どちらが勝っても）：「5回コールド」
function calledText(g: Game): string {
  if (g.sh == null || g.sa == null || g.sh === g.sa) return "";
  const played = Math.max((g.lh ?? []).length, (g.la ?? []).length);
  const auto = played > 0 && played < 7 && Math.abs(g.sh - g.sa) >= 7;
  if (!g.called && !auto) return "";
  return `${g.inn ?? (played > 0 && played < 7 ? played : 5)}回コールド`;
}

// ───── ブロックの順位表と「結果ごとの1位」 ─────
function Standings({ v, rule, card = false }: { v: BlockView; rule: LeagueRule; card?: boolean }) {
  const storm = rule === "storm";
  return (
    <>
      <table className={card ? "rc__table" : "lg__table"}>
        <thead>
          <tr>
            <th>順</th>
            <th>チーム</th>
            <th>勝点</th>
            <th>{storm ? "失点率" : "失点"}</th>
            <th>得失</th>
            {!card && <th>成績</th>}
          </tr>
        </thead>
        <tbody>
          {v.rows.map((r, i) => (
            <tr key={r.team} className={v.final?.top === r.team ? "is-us" : undefined}>
              <td>{i + 1}</td>
              <td>{r.team}</td>
              <td>{r.points}</td>
              <td>{storm ? r.rate.toFixed(2) : r.allowed}</td>
              <td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
              {!card && (
                <td className="lg__rec">
                  {r.win}勝{r.lose}敗{r.draw ? `${r.draw}分` : ""}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {v.final && <p className={card ? "rc__msg is-win" : "lg__final is-ok"}>{v.final.text}</p>}
      {v.next && (
        <div className={card ? "ops-next ops-next--card" : "lg__next"}>
          <p className={card ? "ops-next__title" : "lg__next-title"}>{v.next.title}</p>
          <ul>
            {v.next.lines.map((l, i) => (
              <li key={i} className={card ? undefined : "lg__line lg__line--if"}>
                {!card && <b>▶</b>}
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.waiting && !card && <p className="lg__wait">{v.waiting}</p>}
    </>
  );
}

// ───── 試合1つの入力：対戦の2チームと、ランニングスコアだけ ─────
//   合計点・コールド・回数は、ランニングスコアから自動（7回より前に終わって7点差以上＝コールド）
function GameEditor({
  i,
  g,
  options,
  names,
  onChange,
}: {
  i: number;
  g: Game;
  options: string[];
  names: [string, string];
  onChange: (p: Partial<Game>) => void;
}) {
  const pick = (value: string, set: (v: string) => void, label: string) => (
    <select className={`${inputClass} f-input--white`} value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
      <option value="">（選ぶ）</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      {value && !options.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
  const ct = calledText(g);
  const played = Math.max((g.lh ?? []).length, (g.la ?? []).length);
  const onBase = g.oh != null || g.oa != null;
  const box = (v: number | null | undefined, set: (n: number | null) => void, label: string) => (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      className="score-box score-box--inn"
      value={v ?? ""}
      placeholder="－"
      aria-label={label}
      onChange={(e) => set(e.target.value === "" ? null : Math.max(0, Math.min(99, Number(e.target.value))))}
    />
  );
  return (
    <div className="ops-game">
      <div className="ops-game__head">
        <span className="ops-game__no">{CIRCLED[i]}</span>
        <div className="ops-game__teams">
          {pick(g.home ?? "", (v) => onChange({ home: v }), `第${i + 1}試合のチーム1`)}
          <span className="ops-game__vs">対</span>
          {pick(g.opponent, (v) => onChange({ opponent: v }), `第${i + 1}試合のチーム2`)}
        </div>
      </div>
      <LineEditor left={names[0]} right={names[1]} g={g} onChange={onChange} startOpen />
      {g.sh != null && g.sa != null && (
        <p className="ops-game__result">
          {names[0]} <b>{g.sh}</b> − <b>{g.sa}</b> {names[1]}
          {ct ? `（${ct}）` : played > 0 && played < 7 ? `（${played}回まで）` : ""}
        </p>
      )}
      {onBase ? (
        <div className="ops-game__onbase">
          <span>出塁数</span>
          {box(g.oh, (n) => onChange({ oh: n }), `${names[0]}の出塁数`)}
          <span>−</span>
          {box(g.oa, (n) => onChange({ oa: n }), `${names[1]}の出塁数`)}
        </div>
      ) : (
        <button type="button" className="line-open" onClick={() => onChange({ oh: 0, oa: 0 })}>
          ＋ 出塁数を入れる（勝ち点・失点などが並んだとき）
        </button>
      )}
    </div>
  );
}

// ───── ブロック1つ ─────
function BlockCard({
  b,
  rule,
  onChange,
  onRemove,
}: {
  b: OpsBlock;
  rule: LeagueRule;
  onChange: (b: OpsBlock) => void;
  onRemove: () => void;
}) {
  const v = blockView(b.games, rule);
  const res = resolveGames(b.games);
  const teams = b.teams.map((t) => t.trim()).filter(Boolean);
  // 2試合目からは「第1試合の勝者／敗者」も選べる
  const optionsFor = (i: number) => [
    ...teams,
    ...Array.from({ length: i }, (_, j) => [`第${j + 1}試合の勝者`, `第${j + 1}試合の敗者`]).flat(),
  ];
  // チーム名を直したら、試合の中の名前も直す
  const setTeam = (j: number, name: string) => {
    const old = b.teams[j];
    const ts = b.teams.map((t, x) => (x === j ? name : t));
    const games = b.games.map((g) => ({
      ...g,
      home: old && g.home === old ? name : g.home,
      opponent: old && g.opponent === old ? name : g.opponent,
    }));
    // 最初に3チームを入れたら、第1試合（A対B）と第2・3試合の相手（C）を自動で入れる
    if (!old) {
      if (j === 0 && games[0] && !games[0].home) games[0] = { ...games[0], home: name };
      if (j === 1 && games[0] && !games[0].opponent) games[0] = { ...games[0], opponent: name };
      if (j === 2)
        [1, 2].forEach((x) => {
          if (games[x] && !games[x].opponent) games[x] = { ...games[x], opponent: name };
        });
    }
    onChange({ ...b, teams: ts, games });
  };
  const setGame = (i: number, p: Partial<Game>) => {
    const games = b.games.map((g, j) => {
      if (j !== i) return g;
      const next = { ...g, ...p } as Record<string, unknown>;
      // ランニングスコアから、回数とコールドを自動で（7回より前に終わって7点差以上＝コールド）
      if ("lh" in p || "la" in p) {
        const played = Math.max(((next.lh as unknown[]) ?? []).length, ((next.la as unknown[]) ?? []).length);
        const sh = next.sh as number | null;
        const sa = next.sa as number | null;
        if (played > 0 && played < 7) {
          next.inn = played;
          next.called = sh != null && sa != null && Math.abs(sh - sa) >= 7;
        } else {
          next.inn = null;
          next.called = false;
        }
      }
      Object.keys(next).forEach((x) => next[x] === undefined && delete next[x]);
      return next as Game;
    });
    onChange({ ...b, games });
  };
  const nameOf = (i: number, side: "a" | "b") => {
    const g = b.games[i];
    const raw = side === "a" ? g.home ?? "" : g.opponent;
    return (side === "a" ? res[i]?.a : res[i]?.b) ?? (raw || (side === "a" ? "チーム1" : "チーム2"));
  };
  return (
    <section className="panel ops-block">
      <div className="ops-block__head">
        <input
          className="ops-block__name"
          value={b.name}
          onChange={(e) => onChange({ ...b, name: e.target.value })}
          aria-label="ブロック名"
        />
        {v?.final?.top ? <span className="tag tag--ok">1位 {v.final.top}</span> : <span className="tag">試合中</span>}
        <button type="button" className="ops-block__del" onClick={onRemove} aria-label={`${b.name}を消す`}>
          ×
        </button>
      </div>
      <div>
        <span className="f-label">3チーム</span>
        <div className="ops-teams">
          {[0, 1, 2].map((j) => (
            <input
              key={j}
              className={inputClass}
              value={b.teams[j] ?? ""}
              onChange={(e) => setTeam(j, e.target.value)}
              placeholder={`チーム${"ABC"[j]}`}
              autoComplete="off"
              aria-label={`チーム${"ABC"[j]}`}
            />
          ))}
        </div>
      </div>
      {b.games.map((g, i) => (
        <GameEditor
          key={i}
          i={i}
          g={g}
          options={optionsFor(i)}
          names={[nameOf(i, "a"), nameOf(i, "b")]}
          onChange={(p) => setGame(i, p)}
        />
      ))}
      {v && (
        <div className="lg">
          <p className="lg__title">{b.name}の順位（1位だけ2日目へ）</p>
          <Standings v={v} rule={rule} />
        </div>
      )}
    </section>
  );
}

// ───── 運営に送るカード（画像・PDF・文章・印刷） ─────
function SendSheet({ t, onClose }: { t: OpsTournament; onClose: () => void }) {
  const [only, setOnly] = useState<number | "all">("all");
  const blocks = t.blocks.map((b, i) => ({ b, i, v: blockView(b.games, t.rule) })).filter((x) => only === "all" || x.i === only);
  const card = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"" | "png" | "pdf">("");
  const [made, setMade] = useState<{ png?: File; pdf?: File }>({});
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setMade({}), [only, message]);
  const title = only === "all" ? t.name : `${t.name} ${t.blocks[only]?.name ?? ""}`;
  const fileBase = `${title}_結果`.replace(/\s+/g, "_");
  const send = async (kind: "png" | "pdf") => {
    if (!card.current || busy) return;
    setNote("");
    try {
      let file = made[kind];
      if (!file) {
        setBusy(kind);
        file =
          kind === "png"
            ? await elementToPng(card.current, `${fileBase}.png`, 640)
            : await elementToPdf(card.current, `${fileBase}.pdf`, { onePage: true, width: 640 });
        setMade((m) => ({ ...m, [kind]: file }));
        setBusy("");
      }
      const r = await shareOrDownload(file, `${title} 結果`);
      if (r === "downloaded") setNote("保存しました。LINEやメールに添付して送ってください。");
    } catch {
      setBusy("");
      setNote("もう一度ボタンを押してください。");
    }
  };
  const print = () => {
    document.body.classList.add("rs-printing");
    const done = () => {
      document.body.classList.remove("rs-printing");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 60_000);
  };
  const text = useMemo(() => {
    const out: string[] = [`【${title}　結果】`];
    if (t.date) out.push(formatDateLong(t.date));
    const tops = blocks.map(({ b, v }) => `${b.name}　${v?.final?.top ?? "未定"}`);
    if (blocks.length > 1) out.push("", "■2日目に進むチーム", ...tops);
    blocks.forEach(({ b, v }) => {
      out.push("", `■${b.name}${b.venue ? `（${b.venue}）` : ""}`);
      const res = resolveGames(b.games);
      b.games.forEach((g, i) => {
        const A = res[i]?.a ?? g.home ?? "未定";
        const B = res[i]?.b ?? (g.opponent || "未定");
        const done = g.sh != null && g.sa != null;
        const ct = calledText(g);
        out.push(`${CIRCLED[i]}　${A}　${done ? `${g.sh} − ${g.sa}` : "対"}　${B}${done ? "" : "（これから）"}${ct ? `（${ct}）` : ""}`);
      });
      (v?.rows ?? []).forEach((r, k) =>
        out.push(
          `${k + 1}位　${r.team}　勝ち点${r.points}・${t.rule === "storm" ? `失点率${r.rate.toFixed(2)}` : `失点${r.allowed}`}・得失点差${r.diff > 0 ? "+" : ""}${r.diff}`,
        ),
      );
      if (v?.final) out.push(v.final.text);
      if (v?.next) out.push(v.next.title, ...v.next.lines.map((l) => `・${l}`));
    });
    if (message.trim()) out.push("", message.trim());
    return out.join("\n");
  }, [blocks, title, t.date, t.rule, message]);
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
    <div className="rs-sheet" role="dialog" aria-label="運営に送る">
      <div className="rs-sheet__inner">
        <div className="rs-sheet__head">
          <p>運営に送る</p>
          <button type="button" className="rs-sheet__close" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="picks">
          <button type="button" className="pick" aria-pressed={only === "all"} onClick={() => setOnly("all")}>
            全ブロックまとめて
          </button>
          {t.blocks.map((b, i) => (
            <button key={i} type="button" className="pick" aria-pressed={only === i} onClick={() => setOnly(i)}>
              {b.name}だけ
            </button>
          ))}
        </div>

        {/* ---- 送る絵 ---- */}
        <div ref={card} className="rc ops-card">
          <div className="rc__head">
            <p className="rc__title">{title}　結果</p>
            {t.date && <p className="rc__date">{formatDateLong(t.date)}</p>}
          </div>
          {blocks.length > 1 && (
            <>
              <p className="rc__label">2日目に進むチーム</p>
              <table className="rc__table ops-tops">
                <tbody>
                  {blocks.map(({ b, v }) => (
                    <tr key={b.name} className={v?.final?.top ? "is-us" : undefined}>
                      <td>{b.name}</td>
                      <td>{v?.final?.top ?? "未定"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {blocks.map(({ b, v }) => {
            const res = resolveGames(b.games);
            return (
              <div key={b.name} className="ops-card__block">
                <p className="rc__label">
                  {b.name}
                  {b.venue && <small>　{b.venue}</small>}
                </p>
                <ul className="rc__games">
                  {b.games.map((g, i) => {
                    const A = res[i]?.a ?? (g.home || "未定");
                    const B = res[i]?.b ?? (g.opponent || "未定");
                    const has = g.sh != null && g.sa != null;
                    const aw = has && g.sh! > g.sa!;
                    const bw = has && g.sa! > g.sh!;
                    const line = lineOf(g, A, B);
                    const ct = calledText(g);
                    return (
                      <li key={i} className="rc__game">
                        <span className="rc__no">{CIRCLED[i]}</span>
                        <span className={`rc__team rc__team--a${aw ? " is-win" : ""}`}>{A}</span>
                        <span className="rc__score">
                          {has ? (
                            <>
                              <b className={aw ? "is-win" : undefined}>{g.sh}</b>
                              <i>−</i>
                              <b className={bw ? "is-win" : undefined}>{g.sa}</b>
                            </>
                          ) : (
                            <i>これから</i>
                          )}
                        </span>
                        <span className={`rc__team rc__team--b${bw ? " is-win" : ""}`}>{B}</span>
                        {ct && <span className="rc__called">{ct}</span>}
                        {line && (
                          <div className="rc__line-wrap">
                            <LineTable line={line} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {v && v.rows.some((r) => r.played) && <Standings v={v} rule={t.rule} card />}
              </div>
            );
          })}
          {message.trim() && <p className="rc__msg">{message.trim()}</p>}
          <p className="rc__rule">
            {t.rule === "storm"
              ? "勝ち点：勝ち3・引き分け1（コールド勝ち・完封勝ちは＋1）／並んだら 失点率→得失点差→出塁数→抽選"
              : "勝ち点：勝ち3・引き分け1／並んだら 失点の少なさ→得失点差→出塁数→抽選"}
          </p>
        </div>

        <label className="rs-sheet__field">
          ひとこと（任意。絵と文章の一番下に入ります）
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
        </label>
        <div className="rs-sheet__btns">
          <button type="button" className="btn btn--line" disabled={!!busy} onClick={() => send("png")}>
            {busy === "png" ? "画像を作っています…" : made.png ? "画像を送る" : "画像でLINEに送る"}
          </button>
          <button type="button" className="btn btn--accent" disabled={!!busy} onClick={() => send("pdf")}>
            {busy === "pdf" ? "PDFを作っています…" : made.pdf ? "PDFを送る" : "PDFで送る"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={print}>
            印刷する
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

export default function OpsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<OpsTournament | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [sending, setSending] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    getOps(id)
      .then(setT)
      .catch(() => setError("大会を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, [id]);

  // 入力が止まったら自動で保存
  useEffect(() => {
    if (!t) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(() => {
      saveOps(t)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 700);
    return () => clearTimeout(timer);
  }, [t]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (t === undefined) return <Loading />;
  if (t === null) return <ErrorText>この大会は見つかりませんでした。</ErrorText>;

  const set = (p: Partial<OpsTournament>) => setT({ ...t, ...p });
  const setBlock = (i: number, b: OpsBlock) => set({ blocks: t.blocks.map((x, j) => (j === i ? b : x)) });
  const remove = async () => {
    if (!window.confirm("この大会を削除します。元に戻せません。よろしいですか？")) return;
    await deleteOps(t.id);
    router.push("/ops");
  };
  const views = t.blocks.map((b) => blockView(b.games, t.rule));

  return (
    <>
      <div className="flex items-center justify-between print:hidden">
        <Link href="/ops" className="text-sm font-bold text-navy-soft">
          ‹ 大会運営の一覧
        </Link>
        <span className="text-xs font-bold text-navy-soft">
          {saveState === "saving" ? "保存中…" : saveState === "error" ? "保存できませんでした" : "保存しました"}
        </span>
      </div>

      <section className="panel flex flex-col gap-4">
        <Field label="大会名">
          <input className={inputClass} value={t.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日付">
            <input type="date" className={inputClass} value={t.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="順位の決め方">
            <Choices cols={2}>
              <ToggleButton small on={t.rule === "storm"} label="STORM杯" onClick={() => set({ rule: "storm" })} />
              <ToggleButton small on={t.rule === "jjbf"} label="JJBF" onClick={() => set({ rule: "jjbf" })} />
            </Choices>
          </Field>
        </div>
      </section>

      {/* 2日目に進むチーム（全ブロック） */}
      <section className="panel ops-summary">
        <h2 className="panel__title">2日目に進むチーム</h2>
        <ul className="ops-summary__list">
          {t.blocks.map((b, i) => (
            <li key={i}>
              <a href={`#block-${i}`} className="ops-summary__row">
                <span className="ops-summary__block">{b.name}</span>
                <span className={`ops-summary__team${views[i]?.final?.top ? " is-done" : ""}`}>
                  {views[i]?.final?.top ?? (views[i]?.next ? "最後の試合しだい" : "未定")}
                </span>
              </a>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn--line" onClick={() => setSending(true)}>
          運営に送る（画像・PDF・文章・印刷）
        </button>
      </section>

      <div className="ops-blocks">
        {t.blocks.map((b, i) => (
          <div key={i} id={`block-${i}`}>
            <BlockCard
              b={b}
              rule={t.rule}
              onChange={(nb) => setBlock(i, nb)}
              onRemove={() => {
                if (window.confirm(`${b.name}を消します。よろしいですか？`)) set({ blocks: t.blocks.filter((_, j) => j !== i) });
              }}
            />
          </div>
        ))}
      </div>
      <button type="button" className="btn btn--ghost" onClick={() => set({ blocks: [...t.blocks, newBlock(t.blocks.length)] })}>
        ＋ ブロックを追加
      </button>
      <div className="mt-4">
        <SecondaryButton danger onClick={remove}>
          この大会を削除する
        </SecondaryButton>
      </div>
      {sending && createPortal(<SendSheet t={t} onClose={() => setSending(false)} />, document.body)}
    </>
  );
}
