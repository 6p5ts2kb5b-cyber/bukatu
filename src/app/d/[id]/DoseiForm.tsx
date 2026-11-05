"use client";

// 動静表の記入ページ（保護者・生徒。ログインなし）。
//   ① 名前を選ぶ → ② 記入（記入する人・緊急連絡先・出欠・帰省や旅行・体調） → 送る
//   送った内容は、このスマホに覚えておき、あとから直せる（修正用URLでも直せる）

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ErrorText, Loading, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/activities";
import {
  cellText,
  datesBetween,
  getEntry,
  getTerm,
  newEntryId,
  saveEntry,
  STATUS_LABEL,
  telOk,
  type DayEntry,
  type DayStatus,
  type DoseiEntry,
  type DoseiMember,
  type DoseiTerm,
} from "@/lib/dosei";

const WHO = ["母", "父", "祖母", "祖父", "本人", "その他"];
const STATUSES: DayStatus[] = ["", "欠", "遅", "早", "他"];
// 遅刻・早退の時刻（10分ごと 6:00〜20:00）
const TIMES = Array.from({ length: 85 }, (_, i) => {
  const m = 360 + i * 10;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
});

const memoKey = (termId: string) => `bukatu-dosei:${termId}`;
function readMemo(termId: string): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(memoKey(termId)) ?? "{}");
  } catch {
    return {};
  }
}
function writeMemo(termId: string, memberId: string, entryId: string) {
  try {
    window.localStorage.setItem(memoKey(termId), JSON.stringify({ ...readMemo(termId), [memberId]: entryId }));
  } catch {
    // 覚えておけなくても、修正用URLで直せる
  }
}

function blankEntry(term: DoseiTerm, m: DoseiMember): DoseiEntry {
  return {
    id: newEntryId(),
    termId: term.id,
    memberId: m.id,
    name: m.name,
    writer: "保護者",
    parentName: "",
    contacts: [
      { who: "母", tel: "" },
      { who: "父", tel: "" },
    ],
    days: {},
    trip: "",
    health: "",
  };
}

export function DoseiForm() {
  const { id } = useParams<{ id: string }>();
  const [term, setTerm] = useState<DoseiTerm | null | undefined>(undefined);
  const [entry, setEntry] = useState<DoseiEntry | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [step, setStep] = useState<"who" | "form" | "done">("who");
  const [filter, setFilter] = useState("all");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [prep, setPrep] = useState(false); // 受付の準備中（読む許可がまだない）

  useEffect(() => {
    getTerm(id)
      .then(async (t) => {
        setTerm(t);
        // 修正用URL（?e=…）から開いたとき
        const e = new URLSearchParams(window.location.search).get("e");
        if (t && e) {
          const got = await getEntry(e).catch(() => null);
          if (got && got.termId === t.id) {
            setEntry(got);
            setIsNew(false);
            setStep("form");
          }
        }
      })
      .catch((e) => {
        setPrep((e as { code?: string }).code === "permission-denied");
        setTerm(null);
      });
  }, [id]);

  const dates = useMemo(() => (term ? datesBetween(term.start, term.end) : []), [term]);
  const plans = useMemo(() => new Map((term?.days ?? []).map((d) => [d.date, d.plan])), [term]);

  if (term === undefined) return <Loading />;
  if (term === null && prep)
    return <ErrorText>受付の準備中です。しばらくしてから開き直すか、先生に知らせてください。</ErrorText>;
  if (term === null)
    return <ErrorText>この動静表は見つかりませんでした。送られてきたURL（QRコード）をもう一度開いてください。</ErrorText>;

  const schools = [...new Set(term.members.map((m) => m.school).filter(Boolean))];
  const choose = async (m: DoseiMember) => {
    setError("");
    const saved = readMemo(term.id)[m.id];
    if (saved) {
      const got = await getEntry(saved).catch(() => null);
      if (got) {
        setEntry(got);
        setIsNew(false);
        setStep("form");
        return;
      }
    }
    setEntry(blankEntry(term, m));
    setIsNew(true);
    setStep("form");
  };

  const set = (patch: Partial<DoseiEntry>) => entry && setEntry({ ...entry, ...patch });
  const setDay = (date: string, patch: Partial<DayEntry>) => {
    if (!entry) return;
    const cur = entry.days[date] ?? { s: "" };
    set({ days: { ...entry.days, [date]: { ...cur, ...patch } } });
  };
  const setContact = (i: number, patch: Partial<{ who: string; tel: string }>) => {
    if (!entry) return;
    const contacts = [...entry.contacts];
    while (contacts.length < 2) contacts.push({ who: "", tel: "" });
    contacts[i] = { ...contacts[i], ...patch };
    set({ contacts });
  };

  const problems = (): string[] => {
    if (!entry) return [];
    const out: string[] = [];
    const tels = entry.contacts.filter((c) => c.tel.trim());
    if (tels.length === 0) out.push("緊急連絡先を1つ以上入れてください。");
    tels.forEach((c) => !telOk(c.tel) && out.push(`電話番号「${c.tel}」を確かめてください（例：090-1234-5678）。`));
    if (entry.writer === "保護者" && !entry.parentName.trim()) out.push("保護者のお名前を入れてください。");
    for (const d of dates) {
      const v = entry.days[d];
      if (v?.s === "他" && !v.reason?.trim()) out.push(`${formatDate(d)}の「その他」の内容を書いてください。`);
    }
    return out;
  };

  const send = async () => {
    if (!entry) return;
    const p = problems();
    if (p.length) {
      setError(p.join("\n"));
      return;
    }
    setSending(true);
    setError("");
    try {
      await saveEntry(entry, isNew);
      writeMemo(term.id, entry.memberId, entry.id);
      setIsNew(false);
      setStep("done");
      window.scrollTo({ top: 0 });
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setError(
        code === "permission-denied"
          ? "送れませんでした。受付が終わっているか、受付の準備中です。先生に知らせてください。"
          : "送れませんでした。電波の良い場所で、もう一度「送る」を押してください。",
      );
    } finally {
      setSending(false);
    }
  };

  const editUrl = entry ? `${window.location.origin}/d/${term.id}?e=${entry.id}` : "";
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${what}をコピーしました。`);
    } catch {
      setCopied("コピーできませんでした。長押ししてコピーしてください。");
    }
  };

  const absent = entry ? dates.filter((d) => entry.days[d]?.s) : [];

  return (
    <>
      <section className="ds-head">
        <p className="ds-head__kicker">生徒の動静表</p>
        <h1 className="ds-head__title">{term.title}</h1>
        <p className="ds-head__period">
          {formatDate(term.start)} 〜 {formatDate(term.end)}（{dates.length}日間）
        </p>
        {term.message && <p className="ds-head__msg">{term.message}</p>}
        {!term.open && <p className="ds-head__closed">受付は終わりました。直したいことがあれば、先生に直接お知らせください。</p>}
      </section>

      {step === "who" && (
        <section className="panel">
          <h2 className="panel__title">① 生徒の名前を選んでください</h2>
          {schools.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {["all", ...schools].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={`min-h-8 rounded-full px-3 text-sm font-bold ring-1 ${
                    filter === s ? "bg-navy text-white ring-navy" : "bg-white ring-navy/15"
                  }`}
                >
                  {s === "all" ? "全員" : s}
                </button>
              ))}
            </div>
          )}
          <ul className="pp-grid">
            {term.members
              .filter((m) => filter === "all" || m.school === filter)
              .map((m) => (
                <li key={m.id}>
                  <button type="button" className="pp-item" onClick={() => choose(m)} disabled={!term.open}>
                    <span className="pp-no">{m.number || "－"}</span>
                    <span className="pp-text">
                      <span className="pp-name">{m.name}</span>
                      <span className="pp-meta">
                        {m.school}・{m.grade}年
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          <p className="f-hint mt-3 mb-0">前に送ったことがあるスマホでは、送った内容が出てきて直せます。</p>
        </section>
      )}

      {step === "form" && entry && (
        <>
          <div className="ds-who">
            <span>
              <b>{entry.name}</b> さんの動静表
            </span>
            {isNew && (
              <button type="button" onClick={() => setStep("who")}>
                名前を選び直す
              </button>
            )}
          </div>

          <section className="panel">
            <h2 className="panel__title">記入する人</h2>
            <div className="picks">
              {(["保護者", "本人"] as const).map((w) => (
                <button key={w} type="button" className="pick" aria-pressed={entry.writer === w} onClick={() => set({ writer: w })}>
                  {w === "本人" ? "生徒本人" : "保護者"}
                </button>
              ))}
            </div>
            <label className="ds-label">
              保護者のお名前{entry.writer === "本人" && <small>（わかれば）</small>}
              <input
                className={inputClass}
                value={entry.parentName}
                onChange={(e) => set({ parentName: e.target.value })}
                placeholder="例：山田 花子"
                autoComplete="name"
              />
            </label>
          </section>

          <section className="panel">
            <h2 className="panel__title">緊急連絡先</h2>
            <p className="f-hint -mt-2 mb-2">休み中に連絡がつく電話番号を入れてください（1つ以上）。先生だけが見ます。</p>
            {[0, 1].map((i) => {
              const c = entry.contacts[i] ?? { who: "", tel: "" };
              return (
                <div key={i} className="ds-contact">
                  <span className="ds-contact__no">{i + 1}</span>
                  <select className={`${inputClass} ds-contact__who`} value={c.who} onChange={(e) => setContact(i, { who: e.target.value })}>
                    <option value="">だれ</option>
                    {WHO.map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    type="tel"
                    inputMode="tel"
                    value={c.tel}
                    onChange={(e) => setContact(i, { tel: e.target.value })}
                    placeholder={i === 0 ? "090-1234-5678" : "（2つ目・なくても可）"}
                    autoComplete="tel"
                  />
                </div>
              );
            })}
          </section>

          <section className="panel">
            <h2 className="panel__title">
              出欠<small>空欄は出席</small>
            </h2>
            <p className="f-hint -mt-2 mb-2">休む日・遅れる日・早く帰る日だけ選んでください。何も選ばない日は「出席」です。</p>
            <ol className="ds-days">
              {dates.map((d) => {
                const v = entry.days[d] ?? { s: "" as DayStatus };
                const plan = plans.get(d) ?? "";
                const w = new Date(d.replace(/-/g, "/")).getDay();
                return (
                  <li key={d} className={`ds-day${v.s ? " is-marked" : ""}`}>
                    <div className="ds-day__top">
                      <span className={`ds-day__date${w === 0 ? " is-sun" : w === 6 ? " is-sat" : ""}`}>{formatDate(d)}</span>
                      <span className="ds-day__plan">{plan}</span>
                    </div>
                    <div className="ds-day__opts" role="group" aria-label={`${formatDate(d)}の出欠`}>
                      {STATUSES.map((s) => (
                        <button
                          key={s || "ok"}
                          type="button"
                          aria-pressed={v.s === s}
                          className={`ds-opt ds-opt--${s || "ok"}`}
                          onClick={() => setDay(d, { s })}
                        >
                          {s ? STATUS_LABEL[s] : "出席"}
                        </button>
                      ))}
                    </div>
                    {v.s && (
                      <div className="ds-day__more">
                        {(v.s === "遅" || v.s === "早") && (
                          <select
                            className={`${inputClass} ds-day__time`}
                            value={v.time ?? ""}
                            onChange={(e) => setDay(d, { time: e.target.value })}
                            aria-label={v.s === "遅" ? "来る時刻" : "帰る時刻"}
                          >
                            <option value="">{v.s === "遅" ? "何時に来る" : "何時に帰る"}</option>
                            {TIMES.map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                        )}
                        <input
                          className={inputClass}
                          value={v.reason ?? ""}
                          onChange={(e) => setDay(d, { reason: e.target.value })}
                          placeholder={v.s === "他" ? "内容（必ず書いてください）" : "理由（例：通院、家の用事、帰省）"}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="panel">
            <h2 className="panel__title">帰省・旅行の予定</h2>
            <textarea
              className={`${inputClass} ds-area`}
              value={entry.trip}
              onChange={(e) => set({ trip: e.target.value })}
              placeholder="例：12/29〜1/2 祖父母の家（新潟県）へ帰省"
              rows={3}
            />
          </section>

          <section className="panel">
            <h2 className="panel__title">体調・けがのこと</h2>
            <textarea
              className={`${inputClass} ds-area`}
              value={entry.health}
              onChange={(e) => set({ health: e.target.value })}
              placeholder="先生に知っておいてほしいこと（なければ空欄）"
              rows={3}
            />
          </section>

          {error && <p className="ds-error">{error}</p>}
          <button type="button" className="btn btn--primary" onClick={send} disabled={sending || !term.open}>
            {sending ? "送っています…" : isNew ? "送る" : "直した内容で送る"}
          </button>
          <p className="f-hint m-0 text-center">送ったあとも、このページから直せます。</p>
        </>
      )}

      {step === "done" && entry && (
        <section className="panel ds-done">
          <p className="ds-done__mark" aria-hidden>
            ✓
          </p>
          <h2 className="ds-done__title">送りました</h2>
          <p className="m-0 text-sm font-bold">
            {entry.name} さん：
            {absent.length === 0 ? "全部の日に出席" : absent.map((d) => `${formatDate(d)} ${cellText(entry.days[d])}`).join("、")}
          </p>
          <div className="ds-done__box">
            <p className="m-0 text-sm font-extrabold">あとで直すとき</p>
            <p className="f-hint m-0">このスマホなら、同じURLを開いて名前を選ぶと直せます。ほかのスマホで直すときは、下の「修正用URL」を使ってください（ほかの人には送らないでください）。</p>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => copy(editUrl, "修正用URL")}>
              修正用URLをコピー
            </button>
            {copied && <p className="m-0 text-xs font-bold text-ok">{copied}</p>}
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => setStep("form")}>
            内容を見る・直す
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setEntry(null);
              setStep("who");
            }}
          >
            ほかの生徒（きょうだい）を記入する
          </button>
        </section>
      )}
    </>
  );
}
