"use client";

// 動静表（1つの休み）：記入URL・QRコードを送る／届いた記入の一覧／先生の記入欄／画像・PDF・印刷で送る

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorText, inputClass, Loading, SecondaryButton } from "@/components/ui";
import { DoseiSheet, type SheetKind } from "@/components/DoseiSheet";
import { formatDate } from "@/lib/activities";
import {
  cellText,
  datesBetween,
  deleteTerm,
  getTerm,
  latestByMember,
  listEntries,
  listNotes,
  saveNote,
  saveTerm,
  STATUS_LABEL,
  type DoseiEntry,
  type DoseiMember,
  type DoseiNote,
  type DoseiTerm,
} from "@/lib/dosei";
import { makeQr, qrToPng } from "@/lib/lineupShare";
import { elementToPdf, elementToPng, shareOrDownload } from "@/lib/sharePdf";

// 1人分のくわしい内容と先生の記入欄
function Detail({
  term,
  member,
  entry,
  note,
  onSave,
  onClose,
}: {
  term: DoseiTerm;
  member: DoseiMember;
  entry?: DoseiEntry & { count: number };
  note?: DoseiNote;
  onSave: (n: DoseiNote) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(note?.note ?? "");
  const [checked, setChecked] = useState(note?.checked ?? false);
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const dates = datesBetween(term.start, term.end);
  const marks = entry ? dates.filter((d) => entry.days[d]?.s) : [];
  const save = async (n: DoseiNote) => {
    setState("saving");
    try {
      await onSave(n);
      setState("saved");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center print:hidden" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${member.name}の動静表`}
      >
        <div className="flex items-center justify-between border-b border-navy/10 px-4 py-2.5">
          <h3 className="text-base font-extrabold">
            {member.name}
            <small className="ml-2 text-xs text-navy-soft">
              {member.school}・{member.grade}年
            </small>
          </h3>
          <button type="button" onClick={onClose} className="min-h-10 px-3 text-base font-bold text-navy-soft">
            閉じる
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4">
          {!entry ? (
            <p className="ds-error">まだ記入が届いていません。</p>
          ) : (
            <>
              <dl className="dsd">
                <dt>記入</dt>
                <dd>
                  {entry.writer === "本人" ? "生徒本人" : "保護者"}
                  {entry.parentName && `（保護者：${entry.parentName}）`}
                  {entry.count > 1 && <small>　※記入が{entry.count}件あります（新しい方を表示）</small>}
                </dd>
                <dt>緊急連絡先</dt>
                <dd>
                  {entry.contacts.map((c, i) => (
                    <a key={i} href={`tel:${c.tel.replace(/[^\d+]/g, "")}`} className="dsd-tel">
                      {c.who && <b>{c.who}</b>}
                      {c.tel}
                    </a>
                  ))}
                </dd>
                <dt>出欠</dt>
                <dd>
                  {marks.length === 0
                    ? "全部の日に出席"
                    : marks.map((d) => {
                        const v = entry.days[d];
                        return (
                          <span key={d} className="dsd-line">
                            <b>{formatDate(d)}</b> {v.s && STATUS_LABEL[v.s]}
                            {v.time ? `（${v.time}）` : ""}
                            {v.reason ? `：${v.reason}` : ""}
                          </span>
                        );
                      })}
                </dd>
                {entry.trip && (
                  <>
                    <dt>帰省・旅行</dt>
                    <dd className="whitespace-pre-wrap">{entry.trip}</dd>
                  </>
                )}
                {entry.health && (
                  <>
                    <dt>体調・けが</dt>
                    <dd className="whitespace-pre-wrap">{entry.health}</dd>
                  </>
                )}
              </dl>
            </>
          )}
          <div className="dsd-teacher">
            <p className="m-0 text-sm font-extrabold">先生の記入欄</p>
            <textarea
              className={`${inputClass} ds-area`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => save({ note: text, checked })}
              placeholder="例：12/28 電話で確認済み。通院のため欠席。"
              rows={3}
            />
            <button
              type="button"
              className="pick"
              aria-pressed={checked}
              onClick={() => {
                setChecked(!checked);
                save({ note: text, checked: !checked });
              }}
            >
              {checked ? "✓ 確認済み" : "確認済みにする"}
            </button>
            <p className={`m-0 text-xs font-bold ${state === "error" ? "text-ng" : "text-ok"}`}>
              {state === "saving" ? "保存中…" : state === "saved" ? "✓ 保存しました" : state === "error" ? "保存できませんでした" : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DoseiTermPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [term, setTerm] = useState<DoseiTerm | null | undefined>(undefined);
  const [entries, setEntries] = useState<DoseiEntry[]>([]);
  const [notes, setNotes] = useState<Record<string, DoseiNote>>({});
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [kind, setKind] = useState<SheetKind>("all");
  const [making, setMaking] = useState("");
  const [msg, setMsg] = useState("");
  const [message, setMessage] = useState("");
  const sheetRef = useRef<HTMLElement>(null);

  const load = () =>
    Promise.all([getTerm(id), listEntries(id), listNotes(id)])
      .then(([t, e, n]) => {
        setTerm(t);
        setEntries(e);
        setNotes(n);
        setMessage(t?.message ?? "");
      })
      .catch(() => setError("読み込めませんでした。電波の良い場所で開き直してください。"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const latest = useMemo(() => latestByMember(entries), [entries]);
  const url = typeof window !== "undefined" && term ? `${window.location.origin}/d/${term.id}` : "";
  const qr = useMemo(() => (url ? makeQr(url) : null), [url]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (term === undefined) return <Loading />;
  if (term === null) return <ErrorText>この動静表は見つかりませんでした。</ErrorText>;

  const dates = datesBetween(term.start, term.end);
  const submitted = term.members.filter((m) => latest.has(m.id));
  const missing = term.members.filter((m) => !latest.has(m.id));
  const update = async (patch: Partial<DoseiTerm>) => {
    const next = { ...term, ...patch };
    setTerm(next);
    try {
      await saveTerm(next);
    } catch {
      setMsg("保存できませんでした。");
    }
  };

  const lineText = `【${term.title} 動静表】\n休み中の部活動の出欠と、緊急連絡先を記入してください。\n${url}`;
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setMsg("コピーしました。");
    } catch {
      setMsg("コピーできませんでした。");
    }
  };
  const sendFile = async (what: "png" | "pdf" | "qr") => {
    if (making) return;
    setMaking(what);
    setMsg("");
    try {
      const word = kind === "staff" ? "指導者用" : "";
      const base = `${term.title}_動静表${word}`.replace(/[\s/\\]+/g, "_");
      let f: File;
      if (what === "qr") {
        if (!qr) throw new Error("qr");
        f = await qrToPng(qr, [`${term.title} 動静表`, "スマホのカメラで読み取って記入してください"], `${base}_QRコード.png`);
      } else if (what === "png") f = await elementToPng(sheetRef.current!, `${base}.png`, 794);
      else f = await elementToPdf(sheetRef.current!, `${base}.pdf`);
      const r = await shareOrDownload(f, term.title);
      if (r === "downloaded") setMsg("保存しました。LINEなどに添付して送ってください。");
    } catch {
      setMsg("作れませんでした。もう一度お試しください。");
    } finally {
      setMaking("");
    }
  };

  const remove = async () => {
    if (!window.confirm("この動静表を削除します。届いた記入は残りますが、一覧からは見られなくなります。よろしいですか？")) return;
    await deleteTerm(term.id);
    router.push("/dosei");
  };

  const openMember = term.members.find((m) => m.id === open);

  return (
    <>
      <div className="flex items-center justify-between px-1 print:hidden">
        <Link href="/dosei" className="text-sm font-bold text-navy-soft/70">
          ‹ 動静表の一覧
        </Link>
        <button type="button" className="text-sm font-bold text-navy-soft" onClick={() => load()}>
          ↻ 最新にする
        </button>
      </div>

      <section className="ds-head print:hidden">
        <p className="ds-head__kicker">生徒の動静表</p>
        <h1 className="ds-head__title">{term.title}</h1>
        <p className="ds-head__period">
          {formatDate(term.start)} 〜 {formatDate(term.end)}（{dates.length}日間）
        </p>
        <div className="ds-stat">
          <span>
            提出 <b>{submitted.length}</b>／{term.members.length}人
          </span>
          <button type="button" className={`ds-open${term.open ? " is-on" : ""}`} onClick={() => update({ open: !term.open })}>
            {term.open ? "● 受付中（押すと受付終了）" : "受付終了（押すと再開）"}
          </button>
        </div>
      </section>

      {/* 記入URLを送る */}
      <section className="panel print:hidden">
        <h2 className="panel__title">保護者・生徒に記入URLを送る</h2>
        <div className="ds-share">
          {qr && (
            <svg viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} className="ds-share__qr" role="img" aria-label="記入ページのQRコード" shapeRendering="crispEdges">
              <rect x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} fill="#fff" />
              <path d={qr.path} fill="#000" />
            </svg>
          )}
          <div className="ds-share__btns">
            <a className="btn btn--line" href={`https://line.me/R/share?text=${encodeURIComponent(lineText)}`} target="_blank" rel="noreferrer">
              LINEでURLを送る
            </a>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => copy(lineText)}>
              案内文とURLをコピー
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => sendFile("qr")} disabled={!!making}>
              {making === "qr" ? "作っています…" : "QRコードを画像で送る"}
            </button>
            <a className="btn btn--ghost btn--small" href={url} target="_blank" rel="noreferrer">
              記入ページを開く（代わりに記入）
            </a>
          </div>
        </div>
        <p className="ds-url">{url}</p>
        <label className="ds-label">
          記入ページの上に出す連絡
          <textarea
            className={`${inputClass} ds-area`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => message !== term.message && update({ message })}
            rows={3}
          />
        </label>
        {msg && <p className="m-0 mt-2 text-sm font-bold text-ok">{msg}</p>}
      </section>

      {/* 届いた記入（表）。名前を押すとくわしく見る・先生の記入欄 */}
      <section className="panel print:hidden">
        <h2 className="panel__title">
          出欠の一覧<small>名前を押すと、連絡先・理由・先生の記入欄</small>
        </h2>
        {missing.length > 0 && (
          <p className="ds-missing">
            <b>まだの人（{missing.length}人）</b>
            {missing.map((m) => m.name).join("、")}
          </p>
        )}
        <div className="dsg-scroll">
          <table className="dsg">
            <thead>
              <tr>
                <th className="dsg-name">名前</th>
                {dates.map((d) => {
                  const w = new Date(d.replace(/-/g, "/")).getDay();
                  return (
                    <th key={d} className={w === 0 ? "is-sun" : w === 6 ? "is-sat" : undefined}>
                      {Number(d.slice(5, 7))}/{Number(d.slice(8))}
                      <small>{"日月火水木金土"[w]}</small>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {term.members.map((m) => {
                const e = latest.get(m.id);
                const n = notes[m.id];
                return (
                  <tr key={m.id} className={e ? undefined : "is-missing"}>
                    <th className="dsg-name">
                      <button type="button" onClick={() => setOpen(m.id)}>
                        <span>{m.name}</span>
                        <small>
                          {e ? (n?.checked ? "✓確認済み" : "提出") : "未提出"}
                          {n?.note ? "・メモ" : ""}
                        </small>
                      </button>
                    </th>
                    {dates.map((d) => {
                      const t = e ? cellText(e.days[d]) : "";
                      return (
                        <td key={d} className={`dsg-cell dsg-cell--${t ? t[0] : "ok"}`}>
                          {t}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th className="dsg-name">出席の予定</th>
                {dates.map((d) => (
                  <td key={d}>{term.members.length - term.members.filter((m) => latest.get(m.id)?.days[d]?.s === "欠").length}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 画像・PDF・印刷で送る */}
      <section className="panel print:hidden">
        <h2 className="panel__title">一覧を送る・印刷する</h2>
        <div className="picks">
          <button type="button" className="pick" aria-pressed={kind === "all"} onClick={() => setKind("all")}>
            保護者・指導者に送る（出欠だけ）
          </button>
          <button type="button" className="pick" aria-pressed={kind === "staff"} onClick={() => setKind("staff")}>
            指導者用（連絡先・理由・メモ入り）
          </button>
        </div>
        <p className="f-hint mt-1 mb-2">
          {kind === "all"
            ? "保護者のグループにも送れるように、緊急連絡先・理由・体調・先生の記入欄は載せません。"
            : "緊急連絡先などが入ります。保護者のグループには送らないでください。"}
        </p>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <button type="button" className="btn btn--line" onClick={() => sendFile("png")} disabled={!!making}>
            {making === "png" ? "作っています…" : "画像でLINEに送る"}
          </button>
          <button type="button" className="btn btn--accent" onClick={() => sendFile("pdf")} disabled={!!making}>
            {making === "pdf" ? "作っています…" : "PDFで送る"}
          </button>
          <button type="button" className="btn btn--ghost px-5" onClick={() => window.print()}>
            印刷
          </button>
        </div>
      </section>

      <div className="mt-4 print:hidden">
        <SecondaryButton danger onClick={remove}>
          この動静表を削除する
        </SecondaryButton>
      </div>

      {/* 送る・印刷する一覧（画面では見えない位置に置き、印刷のときだけ出す） */}
      <div className="dsh-wrap">
        <DoseiSheet ref={sheetRef} term={term} latest={latest} notes={notes} kind={kind} />
      </div>

      {openMember && (
        <Detail
          key={openMember.id}
          term={term}
          member={openMember}
          entry={latest.get(openMember.id)}
          note={notes[openMember.id]}
          onSave={async (n) => {
            await saveNote(term.id, openMember.id, n);
            setNotes((cur) => ({ ...cur, [openMember.id]: n }));
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
