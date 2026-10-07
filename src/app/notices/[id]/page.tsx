"use client";

// 送付書の入力画面です。入力すると自動で保存され、下の見本もすぐ変わります。
// 「PDFでLINE・メールに送る」で、スマホの共有画面から送れます。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TimePicker10 } from "@/components/ActivityEditor";
import { Card, ErrorText, Field, inputClass, Loading, PageHead, PanelTitle, SecondaryButton } from "@/components/ui";
import { drawNotice, noticeToPdf } from "@/lib/noticeDraw";
import {
  deleteNotice,
  emptyGame,
  applyActivity,
  getNotice,
  isPlaceholderTeam,
  NOTICE_KINDS,
  OUR_TEAM,
  parentMessage,
  saveNotice,
  type Notice,
  type NoticeGame,
} from "@/lib/notices";
import { shareOrDownload } from "@/lib/sharePdf";
import { formatDate, isMatchType, listUpcoming, type Activity } from "@/lib/activities";

function Text({
  label,
  value,
  onChange,
  placeholder,
  hint,
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  list?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={list}
        autoComplete="off"
      />
    </Field>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input type="date" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

// チームをボタンで選ぶ（予定のチーム＋必要なら「勝者・敗者」）。ないときだけ手で入力
function TeamPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const custom = !!value && !options.includes(value);
  const [typing, setTyping] = useState(false);
  return (
    <div>
      <span className="f-label">{label}</span>
      <div className="picks">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className="pick"
            aria-pressed={value === o}
            onClick={() => {
              setTyping(false);
              onChange(value === o ? "" : o);
            }}
          >
            {o}
          </button>
        ))}
        <button type="button" className="pick pick--other" aria-pressed={custom || typing} onClick={() => setTyping(!typing)}>
          {custom ? `✎ ${value}` : "手で入力"}
        </button>
      </div>
      {(typing || custom) && (
        <input
          className={`${inputClass} f-input--white mt-2`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="チーム名を入力"
          autoComplete="off"
          autoFocus={typing}
        />
      )}
    </div>
  );
}

function GamesEditor({
  games,
  teams,
  tournament,
  onChange,
}: {
  games: NoticeGame[];
  teams: string[];
  tournament: boolean;
  onChange: (g: NoticeGame[]) => void;
}) {
  const update = (i: number, patch: Partial<NoticeGame>) =>
    onChange(games.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= games.length) return;
    const next = [...games];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const small = "h-10 w-10 rounded-lg text-sm text-navy-soft active:bg-white disabled:opacity-25";
  // 前の試合の「勝者・敗者」も選べるように（大会のとき）
  const optionsFor = (i: number) => [
    ...teams,
    ...(tournament ? games.slice(0, i).flatMap((_, k) => [`第${k + 1}試合の勝者`, `第${k + 1}試合の敗者`]) : []),
  ];
  const umpOptions = (i: number) => [...optionsFor(i), ...(tournament ? [] : ["両チームより"])];
  // 予定から入っているので、ふだんは閉じて要約だけ見せる。直すときだけ開く
  const [open, setOpen] = useState<number[]>(() =>
    games.map((g, i) => (!g.first || !g.third ? i : -1)).filter((i) => i >= 0),
  );
  const toggle = (i: number) => setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));
  const clockText = (t: string) => (t ? `${Number(t.split(":")[0])}:${t.split(":")[1]}` : "時刻未定");
  return (
    <div className="flex flex-col gap-3">
      {games.map((g, i) => {
        const split = g.plate !== g.base;
        return (
          <div key={i} className="game-card">
            <div className="game-card__head">
              <span className="game-card__no">第{i + 1}試合</span>
              <span className="flex-1" />
              <button type="button" className={small} disabled={i === 0} onClick={() => move(i, -1)} aria-label="前へ">
                ▲
              </button>
              <button
                type="button"
                className={small}
                disabled={i === games.length - 1}
                onClick={() => move(i, 1)}
                aria-label="後へ"
              >
                ▼
              </button>
              <button
                type="button"
                className="h-10 w-10 rounded-lg text-lg font-bold text-[#c42b3b]"
                onClick={() => {
                  if (confirm(`第${i + 1}試合を消しますか？`)) onChange(games.filter((_, j) => j !== i));
                }}
                aria-label={`第${i + 1}試合を削除`}
              >
                ×
              </button>
            </div>
            <button type="button" className="game-card__sum" onClick={() => toggle(i)} aria-expanded={open.includes(i)}>
              <span className="game-card__match">
                <span>{g.first || "未定"}</span>
                <i>対</i>
                <span>{g.third || "未定"}</span>
              </span>
              <span className="game-card__meta">
                <b>{clockText(g.time)}</b> {g.time && g.timeNote}
                <span>審判 {g.plate === g.base ? g.plate || "未定" : `主審 ${g.plate || "未定"}・塁審 ${g.base || "未定"}`}</span>
              </span>
              <span className="game-card__edit">{open.includes(i) ? "閉じる" : "変更"}</span>
            </button>
            {open.includes(i) && (
            <div className="mt-3 flex flex-col gap-3">
              <TeamPicker label="1塁ベンチ" value={g.first} options={optionsFor(i)} onChange={(v) => update(i, { first: v })} />
              <div className="flex justify-center">
                <button
                  type="button"
                  className="text-xs font-bold text-navy-soft underline"
                  onClick={() => update(i, { first: g.third, third: g.first })}
                >
                  ⇅ 1塁と3塁を入れ替える
                </button>
              </div>
              <TeamPicker label="3塁ベンチ" value={g.third} options={optionsFor(i)} onChange={(v) => update(i, { third: v })} />
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <div>
                  <span className="f-label">時刻</span>
                  <TimePicker10 white name={`第${i + 1}試合の時刻`} value={g.time} onChange={(v) => update(i, { time: v })} />
                </div>
                <div className="seg" role="group" aria-label="開始か予定か">
                  {(["開始", "予定"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="seg__btn px-3"
                      aria-pressed={g.timeNote === t}
                      onClick={() => update(i, { timeNote: t })}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {split ? (
                <>
                  <TeamPicker label="主審" value={g.plate} options={umpOptions(i)} onChange={(v) => update(i, { plate: v })} />
                  <TeamPicker label="塁審" value={g.base} options={umpOptions(i)} onChange={(v) => update(i, { base: v })} />
                </>
              ) : (
                <TeamPicker
                  label="審判（主審・塁審）"
                  value={g.plate}
                  options={umpOptions(i)}
                  onChange={(v) => update(i, { plate: v, base: v })}
                />
              )}
              <button
                type="button"
                className="self-start text-xs font-bold text-navy-soft underline"
                onClick={() => update(i, split ? { base: g.plate } : { base: "" })}
              >
                {split ? "主審と塁審を同じにする" : "主審と塁審を分ける"}
              </button>
            </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => {
          const last = games[games.length - 1];
          onChange([...games, { ...emptyGame(), time: "", timeNote: last ? "予定" : "開始" }]);
          setOpen((o) => [...o, games.length]);
        }}
      >
        ＋ 試合を追加
      </button>
    </div>
  );
}

// 保護者に送るLINEの文。入力から自動で作り、送る前に手直しもできる
function ParentLine({ n, set }: { n: Notice; set: (p: Partial<Notice>) => void }) {
  const auto = parentMessage(n);
  const [text, setText] = useState(auto);
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!edited) setText(auto);
  }, [auto, edited]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Card>
      <PanelTitle no={6}>保護者へのLINE</PanelTitle>
      <div className="flex flex-col gap-4">
        <Text label="地図のURL（任意）" value={n.mapUrl} onChange={(v) => set({ mapUrl: v })} placeholder="https://maps.app.goo.gl/…" />
        <div className="grid grid-cols-[11rem_1fr] items-end gap-3">
          <div>
            <span className="f-label">グラウンドイン</span>
            <TimePicker10 name="グラウンドイン" value={n.groundIn} onChange={(v) => set({ groundIn: v })} />
          </div>
          <p className="f-hint m-0 pb-2">「グラウンドイン7:30からです。」と入ります。</p>
        </div>
        <Field label="駐車場の案内（任意）">
          <textarea
            className="f-input"
            rows={2}
            value={n.parking}
            onChange={(e) => set({ parking: e.target.value })}
            placeholder="例：バスの場合は隣のB面の砂利の駐車場に駐車をお願いします。"
          />
        </Field>
        <Text label="あいさつ" value={n.parentGreeting} onChange={(v) => set({ parentGreeting: v })} />
        <Field label="そのほかの連絡（任意）">
          <textarea
            className="f-input"
            rows={2}
            value={n.parentNote}
            onChange={(e) => set({ parentNote: e.target.value })}
            placeholder="例：お弁当・水筒を持たせてください。"
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="f-label m-0">送る文（手直しできます）</span>
            {edited && (
              <button type="button" className="text-xs font-bold text-navy-soft underline" onClick={() => setEdited(false)}>
                入力内容から作り直す
              </button>
            )}
          </div>
          <textarea
            className="f-input line-preview"
            rows={18}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setEdited(true);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a className="btn btn--line" href={`https://line.me/R/share?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            LINEで送る
          </a>
          <button type="button" className="btn btn--ghost" onClick={copy}>
            {copied ? "コピーしました" : "文をコピー"}
          </button>
        </div>
      </div>
    </Card>
  );
}

export default function NoticePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [n, setN] = useState<Notice | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [preview, setPreview] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [making, setMaking] = useState(false);
  const [note, setNote] = useState("");
  const loaded = useRef(false);
  const [matches, setMatches] = useState<Activity[]>([]);
  const [showPick, setShowPick] = useState(false);

  useEffect(() => {
    getNotice(id)
      .then(setN)
      .catch(() => setError("送付書を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, [id]);
  useEffect(() => {
    listUpcoming()
      .then((list) => setMatches(list.filter((a) => a.groups.some((g) => isMatchType(g.type)))))
      .catch(() => {});
  }, []);

  // 入力が止まったら自動で保存し、見本をえがき直す
  useEffect(() => {
    if (!n) return;
    setPdf(null);
    setNote("");
    const t1 = setTimeout(async () => {
      const c = await drawNotice(n, 2);
      setPreview(c.toDataURL("image/png"));
    }, 250);
    if (!loaded.current) {
      loaded.current = true;
      return () => clearTimeout(t1);
    }
    setSaveState("saving");
    const t2 = setTimeout(() => {
      saveNotice(n)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [n]);

  // 入力の候補（チーム名・審判）
  const teams = useMemo(() => {
    if (!n) return [];
    return [
      ...new Set(
        [OUR_TEAM, ...n.teams, ...n.games.flatMap((g) => [g.first, g.third])].filter(
          (t) => t && !isPlaceholderTeam(t),
        ),
      ),
    ];
  }, [n]);
  const otherTeams = teams.filter((t) => t !== OUR_TEAM);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (n === undefined) return <Loading />;
  if (n === null) {
    return (
      <>
        <ErrorText>この送付書は見つかりませんでした。</ErrorText>
        <Link href="/notices" className="btn btn--ghost">
          一覧に戻る
        </Link>
      </>
    );
  }

  const set = (patch: Partial<Notice>) => setN({ ...n, ...patch });
  // 予定から読み込み直す（期日・会場・相手・試合順・審判）
  const loadActivity = (a: Activity) => {
    if (n.games.some((g) => g.first || g.third) && !confirm("試合順を、予定の内容で置き換えます。よろしいですか？")) return;
    setN({ ...n, ...applyActivity(n, a) });
  };
  const linked = matches.find((a) => a.id === n.activityId);
  const title = `送付書_${n.subject || "大会"}${n.to ? `_${n.to.replace(/\s*代表者.*$/, "")}` : ""}`;

  const send = async () => {
    if (making) return;
    const share = async (f: File) => {
      try {
        const r = await shareOrDownload(f, n.subject || "送付書");
        if (r === "downloaded") setNote("PDFを保存しました。LINEやメールに添付して送ってください。");
      } catch {
        setNote("「PDFを送る」をもう一度押してください。");
      }
    };
    if (pdf) return share(pdf);
    setMaking(true);
    try {
      const f = await noticeToPdf(n, `${title.replace(/[\s/\\]+/g, "_")}.pdf`);
      setPdf(f);
      await share(f);
    } catch {
      setNote("PDFを作れませんでした。もう一度お試しください。");
    } finally {
      setMaking(false);
    }
  };

  const remove = async () => {
    if (!confirm("この送付書を削除しますか？")) return;
    await deleteNotice(n.id);
    router.push("/notices");
  };

  return (
    <>
      <div className="print:hidden flex flex-col gap-3">
        <PageHead
          kicker="NOTICE"
          title={NOTICE_KINDS.find((k) => k.key === n.kind)?.label ?? "送付書"}
          lead={saveState === "saving" ? "保存中…" : saveState === "error" ? "保存できませんでした。電波を確認してください。" : "入力すると自動で保存されます。"}
          action={
            <Link href="/notices" className="btn btn--ghost btn--small shrink-0">
              一覧へ
            </Link>
          }
        />

        <section className="panel source">
          <div className="source__row">
            <span className="source__label">予定</span>
            <span className="source__value">
              {linked
                ? `${formatDate(linked.date)} ${linked.groups.find((g) => isMatchType(g.type))?.tournamentName || "練習試合"}`
                : n.activityId
                  ? "読み込んだ予定（終わった予定）"
                  : "予定から読み込んでいません"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {linked && (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => loadActivity(linked)}>
                読み込み直す
              </button>
            )}
            <button
              type="button"
              className={`btn btn--ghost btn--small ${linked ? "" : "col-span-2"}`}
              onClick={() => setShowPick(!showPick)}
            >
              {showPick ? "閉じる" : "別の予定を選ぶ"}
            </button>
          </div>
          {showPick && (
            <div className="filters mt-1" style={{ flexWrap: "wrap" }}>
              {matches.length === 0 && <span className="text-sm font-bold text-navy-soft">試合の予定はありません。</span>}
              {matches.map((a) => {
                const g = a.groups.find((x) => isMatchType(x.type))!;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="filter"
                    aria-pressed={a.id === n.activityId}
                    onClick={() => {
                      loadActivity(a);
                      setShowPick(false);
                    }}
                  >
                    {formatDate(a.date)} {g.tournamentName || g.type}
                  </button>
                );
              })}
            </div>
          )}
          <p className="f-hint m-0">予定の試合（相手・時刻・試合順）を変えたら「読み込み直す」で反映できます。</p>
        </section>

        <Card>
          <PanelTitle no={1}>送付先と発信元</PanelTitle>
          <div className="flex flex-col gap-4">
            <Text label="送付先（「様」は自動で付きます）" value={n.to} onChange={(v) => set({ to: v })} placeholder="例：入間METS-L　代表者" />
            {otherTeams.length > 0 && (
              <div className="filters" style={{ flexWrap: "wrap" }}>
                {otherTeams.map((t) => (
                  <button key={t} type="button" className="filter" onClick={() => set({ to: `${t}　代表者` })}>
                    {t}宛て
                  </button>
                ))}
                {otherTeams.length > 1 && (
                  <button type="button" className="filter" onClick={() => set({ to: `${otherTeams.join("・")}　代表者` })}>
                    全チーム宛て
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <DateInput label="発信日" value={n.issueDate} onChange={(v) => set({ issueDate: v })} />
              <Text label="送信枚数" value={n.sheets} onChange={(v) => set({ sheets: v })} />
            </div>
            <Text label="発信元（学校・チーム）" value={n.fromOrg} onChange={(v) => set({ fromOrg: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Text label="役職" value={n.fromRole} onChange={(v) => set({ fromRole: v })} placeholder="例：部活動指導員" />
              <Text label="氏名" value={n.fromName} onChange={(v) => set({ fromName: v })} />
            </div>
            <Text label="住所（任意）" value={n.fromAddress} onChange={(v) => set({ fromAddress: v })} placeholder="例：〒350-0000 坂戸市…" />
            <div className="grid grid-cols-2 gap-3">
              <Text label="携帯" value={n.fromPhone} onChange={(v) => set({ fromPhone: v })} placeholder="090-…" />
              <Text label="電話・FAX（任意）" value={n.fromTel} onChange={(v) => set({ fromTel: v })} placeholder="TEL/FAX 049-…" />
            </div>
          </div>
        </Card>

        <Card>
          <PanelTitle no={2}>件名と本文</PanelTitle>
          <div className="flex flex-col gap-4">
            <Text label={n.kind === "tournament" ? "件名（大会名）" : "件名"} value={n.subject} onChange={(v) => set({ subject: v })} placeholder="例：第47回JJBF埼玉県中学生選抜野球大会" />
            <Field label="本文" hint="1行が1つの段落になります。予備日がないときは「予備日」を含む行は載りません。">
              <textarea className="f-input" rows={5} value={n.body} onChange={(e) => set({ body: e.target.value })} />
            </Field>
            <Text
              label="問い合わせ先（任意）"
              value={n.contact}
              onChange={(v) => set({ contact: v })}
              placeholder="例：住吉中・池田（090-…）"
              hint="「何かありましたら、〇〇までご連絡をお願いいたします。」と本文の最後に入ります。"
            />
          </div>
        </Card>

        <Card>
          <PanelTitle no={3}>期日と会場</PanelTitle>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <DateInput label="期日" value={n.date} onChange={(v) => set({ date: v })} />
              <DateInput label="予備日（任意）" value={n.reserveDate} onChange={(v) => set({ reserveDate: v })} />
            </div>
            <Text label="会場" value={n.venue} onChange={(v) => set({ venue: v })} placeholder="例：坂戸市立浅羽野中学校" />
            <Text label="会場の住所" value={n.venueAddress} onChange={(v) => set({ venueAddress: v })} placeholder="例：坂戸市浅羽753-1" />
            <Text label="予備日の会場（ちがう場合だけ）" value={n.reserveVenue} onChange={(v) => set({ reserveVenue: v })} />
            {n.reserveVenue && (
              <Text label="予備日の会場の住所" value={n.reserveVenueAddress} onChange={(v) => set({ reserveVenueAddress: v })} />
            )}
            <Text label="雨天判定（任意）" value={n.rain} onChange={(v) => set({ rain: v })} placeholder="例：6:00 住吉中 池田（090-…）" />
          </div>
        </Card>

        <Card>
          <PanelTitle no={4} aside={n.games.length ? `${n.games.length}試合` : undefined}>
            試合順と審判
          </PanelTitle>
          <GamesEditor
            games={n.games}
            teams={teams}
            tournament={n.kind === "tournament"}
            onChange={(games) => set({ games })}
          />
        </Card>

        <Card>
          <PanelTitle no={5}>連絡事項</PanelTitle>
          <Field label="1行に1つ（○を付けて並べます）">
            <textarea className="f-input" rows={5} value={n.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </Card>

        <ParentLine n={n} set={set} />

        <p className="group-label">送付書の見本（このままPDFになります）</p>
        <div className="overflow-hidden rounded-xl border border-rule bg-white shadow-sm">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="送付書の見本" className="block w-full" />
          ) : (
            <Loading />
          )}
        </div>

        {note && <p className="m-0 rounded-xl border border-rule bg-white p-3 text-sm font-bold">{note}</p>}

        <div className="mt-4">
          <SecondaryButton danger onClick={remove}>
            この送付書を削除する
          </SecondaryButton>
        </div>
        <div className="h-24" aria-hidden />
      </div>

      {/* 印刷するのは見本の絵だけ */}
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="notice-print hidden print:block" />
      )}

      <div className="savebar print:hidden">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={send} disabled={making} className="btn btn--accent">
            {making ? "PDFを作っています…" : pdf ? "PDFを送る" : "送付書をPDFで送る"}
          </button>
          <button type="button" onClick={() => window.print()} className="btn btn--ghost px-5">
            印刷
          </button>
        </div>
      </div>
    </>
  );
}
