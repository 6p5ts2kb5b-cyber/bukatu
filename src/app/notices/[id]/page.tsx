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
  teamText,
  formatPhone,
  gameTimeText,
  meetText,
  OUR_TEAM,
  parentMessage,
  saveNotice,
  type Notice,
  type NoticeGame,
} from "@/lib/notices";
import { shareOrDownload } from "@/lib/sharePdf";
import { findVenue, listDirectory, VENUE_PRESETS, type DirEntry } from "@/lib/directory";
import { DirPicker } from "@/components/DirPicker";
import { listStaff, type Staff } from "@/lib/staff";
import { formatDate, isMatchType, isRef, listUpcoming, tournamentTitle, type Activity } from "@/lib/activities";

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
  describe,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  describe?: (v: string) => string | null;
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
            className={`pick${isPlaceholderTeam(o) ? " pick--ref" : ""}`}
            aria-pressed={value === o}
            onClick={() => {
              setTyping(false);
              onChange(value === o ? "" : o);
            }}
          >
            {o}
            {describe?.(o) && <small className="pick__sub">{describe(o)}</small>}
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
  // リーグ戦・トーナメントでは「第1試合の勝者／敗者」も選べる（2試合目から）
  const optionsFor = (i: number) => [
    ...teams,
    ...games.slice(0, i).flatMap((_, k) => [`第${k + 1}試合の勝者`, `第${k + 1}試合の敗者`]),
  ];
  const describe = (v: string) => (isRef(v) ? teamText(v, games) : null);
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
                <span>{teamText(g.first, games) || "未定"}</span>
                <i>対</i>
                <span>{teamText(g.third, games) || "未定"}</span>
              </span>
              <span className="game-card__meta">
                <b>{g.afterLunch ? gameTimeText(g) : clockText(g.time)}</b> {!g.afterLunch && g.time && g.timeNote}
                <span>
                  審判{" "}
                  {g.plate === g.base
                    ? teamText(g.plate, games) || "未定"
                    : `球審 ${teamText(g.plate, games) || "未定"}・塁審 ${teamText(g.base, games) || "未定"}`}
                </span>
              </span>
              <span className="game-card__edit">{open.includes(i) ? "閉じる" : "変更"}</span>
            </button>
            {open.includes(i) && (
            <div className="mt-3 flex flex-col gap-3">
              <TeamPicker label="1塁ベンチ" value={g.first} options={optionsFor(i)} describe={describe} onChange={(v) => update(i, { first: v })} />
              <div className="flex justify-center">
                <button
                  type="button"
                  className="text-xs font-bold text-navy-soft underline"
                  onClick={() => update(i, { first: g.third, third: g.first })}
                >
                  ⇅ 1塁と3塁を入れ替える
                </button>
              </div>
              <TeamPicker label="3塁ベンチ" value={g.third} options={optionsFor(i)} describe={describe} onChange={(v) => update(i, { third: v })} />
              <div>
                <span className="f-label">時刻</span>
                <div className="seg mb-2" role="group" aria-label="時刻の書き方">
                  <button type="button" className="seg__btn" aria-pressed={!g.afterLunch} onClick={() => update(i, { afterLunch: false })}>
                    時刻で
                  </button>
                  <button
                    type="button"
                    className="seg__btn"
                    aria-pressed={!!g.afterLunch}
                    onClick={() => update(i, { afterLunch: true, lunchMin: g.lunchMin || 40 })}
                  >
                    昼食後○分後
                  </button>
                </div>
                {g.afterLunch ? (
                  <div className="picks">
                    {[30, 40, 45, 50, 60].map((m) => (
                      <button
                        key={m}
                        type="button"
                        className="pick"
                        aria-pressed={(g.lunchMin || 40) === m}
                        onClick={() => update(i, { lunchMin: m })}
                      >
                        昼食後{m}分後
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <TimePicker10 white name={`第${i + 1}試合の時刻`} value={g.time} onChange={(v) => update(i, { time: v })} />
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
                )}
              </div>
              {split ? (
                <>
                  <TeamPicker label="球審" value={g.plate} options={umpOptions(i)} onChange={(v) => update(i, { plate: v })} />
                  <TeamPicker label="塁審" value={g.base} options={umpOptions(i)} onChange={(v) => update(i, { base: v })} />
                </>
              ) : (
                <TeamPicker
                  label="審判（球審・塁審）"
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
                {split ? "球審と塁審を同じにする" : "球審と塁審を分ける"}
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
        <Field label="駐車場の案内（任意）">
          <textarea
            className="f-input"
            rows={2}
            value={n.parking}
            onChange={(e) => set({ parking: e.target.value })}
            placeholder="例：バスの場合は隣のB面の砂利の駐車場に駐車をお願いします。"
          />
        </Field>
        <Text
          label="生徒の集合"
          value={n.meet}
          onChange={(v) => set({ meet: v })}
          placeholder="例：7:10　若葉駅"
          hint={n.activityId ? "予定の集合時間と場所が入ります。" : undefined}
        />
        <Text
          label="持ち物"
          value={n.packing}
          onChange={(v) => set({ packing: v })}
          placeholder="例：お弁当・水筒・ユニフォーム"
          hint={n.activityId ? "予定の持ち物が入ります。予定を変えたら上の「読み込み直す」で反映できます。" : "「・」で区切って書きます。"}
        />
        <Text label="あいさつ" value={n.parentGreeting} onChange={(v) => set({ parentGreeting: v })} />
        <Field label="そのほかの連絡（任意）">
          <textarea
            className="f-input"
            rows={2}
            value={n.parentNote}
            onChange={(e) => set({ parentNote: e.target.value })}
            placeholder="例：雨具も持たせてください。"
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
          {edited && text !== auto && (
            <p className="m-0 mb-1.5 text-xs font-bold text-[#a15c00]">
              手直しした文なので、入力の変更（予備日など）は入っていません。右上の「入力内容から作り直す」で入ります。
            </p>
          )}
          <div className="hidden">
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
  const packingFilled = useRef(false);
  const [matches, setMatches] = useState<Activity[]>([]);
  const [showPick, setShowPick] = useState(false);
  const [dir, setDir] = useState<DirEntry[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const reloadDir = () => {
    listDirectory()
      .then(setDir)
      .catch(() => {});
  };
  useEffect(() => {
    listStaff()
      .then((l) => setStaff(l.filter((x) => x.active)))
      .catch(() => {});
  }, []);
  // 名簿：スタッフ（先生）＋登録した人／登録した会場＋3校
  const people: DirEntry[] = [
    ...staff
      .filter((x) => x.name && !dir.some((d) => d.kind === "person" && d.name === x.name))
      .map((x) => ({ id: `staff-${x.email}`, kind: "person" as const, name: x.name, number: formatPhone(x.phone ?? ""), preset: true })),
    ...dir,
  ];
  const venues: DirEntry[] = [...dir, ...VENUE_PRESETS.filter((p) => !dir.some((d) => d.kind === "venue" && d.name === p.name))];

  useEffect(() => {
    getNotice(id)
      .then(setN)
      .catch(() => setError("送付書を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, [id]);
  useEffect(reloadDir, []);
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
  // 会場名が登録した会場（3校など）と同じなら、住所と最寄駅もいっしょに入れる
  const linkVenue = (v: string, which: "main" | "reserve"): Partial<Notice> => {
    const f = findVenue(v, venues);
    if (!f) return {};
    return which === "main"
      ? { venueAddress: f.number, venueStation: f.extra ?? "" }
      : { reserveVenueAddress: f.number, reserveVenueStation: f.extra ?? "" };
  };
  // 予定から読み込み直す（期日・会場・相手・試合順・審判）
  const loadActivity = (a: Activity) => {
    if (n.games.some((g) => g.first || g.third) && !confirm("試合順を、予定の内容で置き換えます。よろしいですか？")) return;
    setN({ ...n, ...applyActivity(n, a) });
  };
  const linked = matches.find((a) => a.id === n.activityId);
  // 持ち物がまだ空なら、つながっている予定の持ち物を入れる（試合順はそのまま）
  const linkedGroup = linked?.groups.find((g) => g.games.length > 0 || g.tournamentName);
  const linkedPacking = linkedGroup?.packing.join("・") ?? "";
  const linkedMeet = linkedGroup ? meetText(linkedGroup.meetTime, linkedGroup.meetPlace) : "";
  const linkedReserve = linkedGroup?.reserveDate
    ? {
        reserveDate: linkedGroup.reserveDate,
        reserveVenue: linkedGroup.reserveVenue,
        reserveVenueAddress: linkedGroup.reserveVenueAddress,
        reserveVenueStation: linkedGroup.reserveVenueStation,
        reserveDate2: linkedGroup.reserveDate2,
        reserveVenue2: linkedGroup.reserveVenue2,
      }
    : null;
  if (
    linked &&
    ((!n.packing && linkedPacking) || (!n.meet && linkedMeet) || (!n.reserveDate && linkedReserve)) &&
    !packingFilled.current
  ) {
    packingFilled.current = true;
    queueMicrotask(() =>
      setN((cur) =>
        cur
          ? {
              ...cur,
              packing: cur.packing || linkedPacking,
              meet: cur.meet || linkedMeet,
              ...(!cur.reserveDate && linkedReserve ? linkedReserve : {}),
            }
          : cur,
      ),
    );
  }
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
                ? `${formatDate(linked.date)} ${linked.groups.find((g) => isMatchType(g.type))?.tournamentName ? tournamentTitle(linked.groups.find((g) => isMatchType(g.type))!) : "練習試合"}`
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
                    {formatDate(a.date)} {tournamentTitle(g) || g.type}
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
            <div className="grid grid-cols-2 gap-3">
              <Text label="携帯" value={n.fromPhone} onChange={(v) => set({ fromPhone: v })} placeholder="090-…" />
              <div />
            </div>
            <div>
              <span className="f-label">名簿から選ぶ（氏名と携帯が入ります）</span>
              <DirPicker
                kind="person"
                entries={people}
                isOn={(e) => e.name === n.fromName && e.number === formatPhone(n.fromPhone)}
                onPick={(e) => set({ fromName: e.name, fromPhone: e.number })}
                draft={{ name: n.fromName, number: n.fromPhone }}
                onChanged={reloadDir}
              />
            </div>
            <Text label="住所（任意）" value={n.fromAddress} onChange={(v) => set({ fromAddress: v })} placeholder="例：〒350-0000 坂戸市…" />
            <Text label="FAX（任意）" value={n.fromTel} onChange={(v) => set({ fromTel: v })} placeholder="例：FAX 049-000-0000（住吉中）" />
            <div>
              <span className="f-label">FAXを学校から選ぶ</span>
              <DirPicker
                kind="fax"
                entries={dir}
                isOn={(e) => n.fromTel.includes(e.number)}
                onPick={(e) => set({ fromTel: `FAX ${e.number}（${e.name}）` })}
                onChanged={reloadDir}
              />
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
            <DirPicker
              kind="person"
              entries={people}
              isOn={(e) => n.contact === `${e.name}（${e.number}）`}
              onPick={(e) => set({ contact: `${e.name}（${e.number}）` })}
              onChanged={reloadDir}
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
            {n.reserveDate && (
              <div className="grid grid-cols-2 gap-3">
                <DateInput label="予備日の予備日（任意）" value={n.reserveDate2} onChange={(v) => set({ reserveDate2: v })} />
                <Text label="その会場（ちがう場合）" value={n.reserveVenue2} onChange={(v) => set({ reserveVenue2: v })} />
              </div>
            )}
            <Text label="会場" value={n.venue} onChange={(v) => set({ venue: v, ...linkVenue(v, "main") })} placeholder="例：坂戸市立浅羽野中学校" />
            <DirPicker
              kind="venue"
              entries={venues}
              isOn={(e) => e.name === n.venue}
              onPick={(e) => set({ venue: e.name, venueAddress: e.number, venueStation: e.extra ?? "" })}
              onChanged={reloadDir}
            />
            <div className="grid grid-cols-2 gap-3">
              <Text label="住所" value={n.venueAddress} onChange={(v) => set({ venueAddress: v })} placeholder="坂戸市浅羽753-1" />
              <Text label="最寄駅" value={n.venueStation} onChange={(v) => set({ venueStation: v })} placeholder="坂戸駅" />
            </div>
            <Text
              label="予備日の会場（ちがう場合だけ）"
              value={n.reserveVenue}
              onChange={(v) => set({ reserveVenue: v, ...linkVenue(v, "reserve") })}
            />
            <DirPicker
              kind="venue"
              entries={venues}
              isOn={(e) => e.name === n.reserveVenue}
              onPick={(e) =>
                set({ reserveVenue: e.name, reserveVenueAddress: e.number, reserveVenueStation: e.extra ?? "" })
              }
              onChanged={reloadDir}
            />
            {n.reserveVenue && (
              <div className="grid grid-cols-2 gap-3">
                <Text label="予備日会場の住所" value={n.reserveVenueAddress} onChange={(v) => set({ reserveVenueAddress: v })} />
                <Text label="最寄駅" value={n.reserveVenueStation} onChange={(v) => set({ reserveVenueStation: v })} />
              </div>
            )}
            <div className="grid grid-cols-[11rem_1fr] items-end gap-3">
              <div>
                <span className="f-label">グラウンドイン</span>
                <TimePicker10 name="グラウンドイン" value={n.groundIn} onChange={(v) => set({ groundIn: v })} />
              </div>
              <p className="f-hint m-0 pb-2">送付書（相手チーム向け）にだけ載ります。</p>
            </div>
            <Text label="雨天判定（任意）" value={n.rain} onChange={(v) => set({ rain: v })} placeholder="例：6:00 住吉中 池田（090-…）" />
            <div>
              <span className="f-label">雨天判定の連絡先を名簿から選ぶ</span>
              <DirPicker
                kind="person"
                entries={people}
                isOn={(e) => n.rain.includes(e.number)}
                onPick={(e) => {
                  const time = n.rain.match(/^\s*\d{1,2}[:：]\d{2}/)?.[0]?.trim() ?? "6:00";
                  set({ rain: `${time}　${e.name}（${e.number}）` });
                }}
                onChanged={reloadDir}
              />
            </div>
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
