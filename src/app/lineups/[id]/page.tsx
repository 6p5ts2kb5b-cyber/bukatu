"use client";

// メンバー表の作成画面です。
//   タブ1「守備位置」… 野球のダイヤモンド上の丸をタップして選手を選ぶ
//   タブ2「打順」   … 守備についた9人の打順を▲▼で並べ替え、控え選手を選ぶ
//   タブ3「メンバー表」… 打順・守備・背番号・氏名の表を確認して印刷する
// 変更は自動で保存されます。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PaperPreview } from "@/components/PaperPreview";
import { ErrorText, Field, inputClass, SecondaryButton } from "@/components/ui";
import { formatDateLong } from "@/lib/activities";
import {
  deleteLineup,
  getLineup,
  POSITIONS,
  positionOf,
  saveLineup,
  syncOrder,
  type Lineup,
} from "@/lib/lineups";
import { listPlayers, type Player } from "@/lib/players";
import { listTeams, type Team } from "@/lib/teams";

type Tab = "field" | "order" | "sheet";

// ダイヤモンド上の位置（横・縦を % で指定）
const SPOTS: Record<string, { x: number; y: number }> = {
  "8": { x: 50, y: 13 },
  "7": { x: 18, y: 28 },
  "9": { x: 82, y: 28 },
  "6": { x: 35, y: 47 },
  "4": { x: 65, y: 47 },
  "5": { x: 19, y: 64 },
  "3": { x: 81, y: 64 },
  "1": { x: 50, y: 64 },
  "2": { x: 50, y: 86 },
};

function FieldPicture() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <pattern id="mow" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="8" fill="rgb(255 255 255 / 0.05)" />
        </pattern>
      </defs>
      {/* 外野の芝（刈り目の縞） */}
      <path d="M50 90 L3 43 A66 66 0 0 1 97 43 Z" fill="#3f8f4f" />
      <path d="M50 90 L3 43 A66 66 0 0 1 97 43 Z" fill="url(#mow)" />
      {/* 内野の土 */}
      <path d="M50 94 L18 64 A34 34 0 0 1 82 64 Z" fill="#c98f5a" />
      {/* 内野の芝 */}
      <path d="M50 86 L31 67 L50 48 L69 67 Z" fill="#4f9f5f" />
      {/* ファウルライン */}
      <path d="M50 88 L3 41 M50 88 L97 41" stroke="#fff" strokeWidth="0.6" />
      {/* ベース */}
      <rect x="48.4" y="46.4" width="3.2" height="3.2" fill="#fff" transform="rotate(45 50 48)" />
      <rect x="29.4" y="65.4" width="3.2" height="3.2" fill="#fff" transform="rotate(45 31 67)" />
      <rect x="67.4" y="65.4" width="3.2" height="3.2" fill="#fff" transform="rotate(45 69 67)" />
      <path d="M48.3 86 h3.4 v1.6 l-1.7 1.6 l-1.7 -1.6 z" fill="#fff" />
      {/* マウンド */}
      <circle cx="50" cy="67" r="2.8" fill="#b8804d" />
    </svg>
  );
}

function PlayerPicker({
  title,
  players,
  teams,
  lineup,
  current,
  onPick,
  onClear,
  onClose,
}: {
  title: string;
  players: Player[];
  teams: Team[];
  lineup: Lineup;
  current?: string;
  onPick: (id: string) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const teamName = (id: string) => teams.find((t) => t.id === id)?.shortName ?? "";
  const list = players.filter((p) => p.active && (filter === "all" || p.teamId === filter));
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 print:hidden" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-navy/10 p-4">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <button type="button" onClick={onClose} className="min-h-10 px-3 text-base font-bold text-navy-soft">
            閉じる
          </button>
        </div>
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {[{ id: "all", shortName: "全員" }, ...teams.filter((t) => t.active)].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`min-h-9 rounded-full px-3 text-sm font-bold ring-1 ${
                filter === t.id ? "bg-navy text-white ring-navy" : "bg-white ring-navy/15"
              }`}
            >
              {t.shortName}
            </button>
          ))}
        </div>
        <ul className="flex-1 overflow-y-auto p-4">
          {current && onClear && (
            <li className="mb-2">
              <button
                type="button"
                onClick={onClear}
                className="min-h-12 w-full rounded-xl bg-ng/10 text-base font-bold text-ng"
              >
                この守備位置を空ける
              </button>
            </li>
          )}
          {list.length === 0 && (
            <li className="py-6 text-center text-sm text-navy-soft/70">
              選手がいません。メニューの「選手名簿」から登録してください。
            </li>
          )}
          {list.map((p) => {
            const pos = positionOf(lineup, p.id);
            const posLabel = POSITIONS.find((x) => x.key === pos)?.short;
            const onBench = lineup.bench.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p.id)}
                  className={`mb-2 flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 ${
                    p.id === current ? "bg-navy text-white ring-navy" : "bg-white ring-navy/10 active:bg-field"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy/10 text-base font-extrabold">
                    {p.number || "－"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-extrabold">{p.name}</span>
                    <span className="block text-sm opacity-70">
                      {teamName(p.teamId)}・{p.grade}年
                    </span>
                  </span>
                  {posLabel && (
                    <span className="rounded-md bg-stitch px-2 py-0.5 text-sm font-bold text-white">{posLabel}</span>
                  )}
                  {onBench && <span className="rounded-md bg-navy/10 px-2 py-0.5 text-sm font-bold">控え</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default function LineupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lineup, setLineup] = useState<Lineup | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("field");
  const [picking, setPicking] = useState<string | null>(null); // 選手を選んでいる守備位置
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const loaded = useRef(false);

  useEffect(() => {
    Promise.all([getLineup(id), listPlayers(), listTeams()])
      .then(([l, p, t]) => {
        setLineup(l);
        setPlayers(p);
        setTeams(t);
      })
      .catch(() => setError("読み込めませんでした。電波の良い場所で開き直してください。"));
  }, [id]);

  // 変更があったら少し待ってから自動保存
  useEffect(() => {
    if (!lineup) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      saveLineup(lineup)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 700);
    return () => clearTimeout(t);
  }, [lineup]);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamName = (tid: string) => teams.find((t) => t.id === tid)?.shortName ?? "";

  if (error) return <ErrorText>{error}</ErrorText>;
  if (lineup === undefined) return <p className="py-6 text-center text-sm text-navy-soft/70">読み込み中…</p>;
  if (lineup === null) return <ErrorText>このメンバー表は見つかりませんでした。</ErrorText>;

  const update = (patch: Partial<Lineup>) => setLineup({ ...lineup, ...patch });

  const assign = (posKey: string, playerId: string) => {
    const positions: Record<string, string> = {};
    for (const [k, v] of Object.entries(lineup.positions)) {
      if (v && v !== playerId && k !== posKey) positions[k] = v;
    }
    positions[posKey] = playerId;
    update({
      positions,
      order: syncOrder(positions, lineup.order),
      bench: lineup.bench.filter((b) => b !== playerId),
    });
    setPicking(null);
  };

  const clearPos = (posKey: string) => {
    const positions = { ...lineup.positions };
    delete positions[posKey];
    update({ positions, order: syncOrder(positions, lineup.order) });
    setPicking(null);
  };

  const order = syncOrder(lineup.positions, lineup.order);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    update({ order: next });
  };

  const toggleBench = (pid: string) => {
    update({
      bench: lineup.bench.includes(pid) ? lineup.bench.filter((b) => b !== pid) : [...lineup.bench, pid],
    });
  };

  const remove = async () => {
    if (!window.confirm("このメンバー表を削除します。元に戻せません。よろしいですか？")) return;
    await deleteLineup(lineup.id);
    router.push("/lineups");
  };

  const filled = POSITIONS.filter((p) => lineup.positions[p.key]).length;
  const bench = lineup.bench.map((b) => byId.get(b)).filter(Boolean) as Player[];
  const notPlaying = players.filter((p) => p.active && !positionOf(lineup, p.id));

  return (
    <>
      <div className="flex items-center justify-between px-1 print:hidden">
        <Link href="/lineups" className="text-sm font-bold text-navy-soft/70">
          ‹ メンバー表一覧
        </Link>
        <span
          className={`text-sm font-bold ${
            saveState === "error" ? "text-ng" : saveState === "saving" ? "text-navy-soft/60" : "text-ok"
          }`}
        >
          {saveState === "error" ? "■ 保存できません" : saveState === "saving" ? "保存中…" : "✓ 保存済み"}
        </span>
      </div>

      <section className="panel flex flex-col gap-3 print:hidden">
        <Field label="名前">
          <input className={inputClass} value={lineup.title} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日付">
            <input type="date" className={inputClass} value={lineup.date} onChange={(e) => update({ date: e.target.value })} />
          </Field>
          <Field label="対戦相手">
            <input
              className={inputClass}
              value={lineup.opponent}
              onChange={(e) => update({ opponent: e.target.value })}
              placeholder="例：坂戸中"
            />
          </Field>
        </div>
      </section>

      <div className="seg print:hidden" role="tablist">
        {(
          [
            ["field", "① 守備位置"],
            ["order", "② 打順"],
            ["sheet", "③ メンバー表"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className="seg__btn"
          >
            {label}
          </button>
        ))}
      </div>

      {/* ① 守備位置 */}
      {tab === "field" && (
        <>
          <p className={`px-1 text-base font-bold ${filled === 9 ? "text-ok" : "text-[#8a6500]"}`}>
            {filled === 9 ? "● 守備9人がそろいました" : `▲ 守備 ${filled}/9人 ― 丸をタップして選ぶ`}
          </p>
          <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-3xl bg-[#2f7a3f]">
            <FieldPicture />
            {POSITIONS.map((pos) => {
              const player = byId.get(lineup.positions[pos.key] ?? "");
              const spot = SPOTS[pos.key];
              return (
                <button
                  key={pos.key}
                  type="button"
                  onClick={() => setPicking(pos.key)}
                  style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                  className="absolute flex w-[23%] -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                  aria-label={`${pos.label}：${player?.name ?? "未定"}`}
                >
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-extrabold shadow-md ring-2 ${
                      player ? "bg-navy text-white ring-white" : "bg-white/90 text-navy ring-stitch"
                    }`}
                  >
                    {player ? player.number || pos.short : pos.short}
                  </span>
                  <span
                    className={`mt-1 max-w-full truncate rounded-md px-1.5 py-0.5 text-xs font-extrabold shadow ${
                      player ? "bg-white text-navy" : "bg-stitch text-white"
                    }`}
                  >
                    {player ? player.name.split(/[\s　]/)[0] : `${pos.short}：未定`}
                  </span>
                </button>
              );
            })}
          </div>
          <SecondaryButton onClick={() => setTab("order")}>次へ：② 打順を決める ›</SecondaryButton>
        </>
      )}

      {/* ② 打順 */}
      {tab === "order" && (
        <>
          <section className="panel">
            <h2 className="panel__title">打順</h2>
            <p className="f-hint -mt-2 mb-1">▲▼で順番を入れ替えます。守備についた選手が並びます。</p>
            {order.length === 0 && (
              <p className="py-4 text-center text-sm text-[#8a6500]">▲ 先に「① 守備位置」で選手を選んでください。</p>
            )}
            <ol className="mt-3 flex flex-col gap-2">
              {order.map((pid, i) => {
                const p = byId.get(pid);
                const pos = POSITIONS.find((x) => x.key === positionOf(lineup, pid));
                return (
                  <li key={pid} className="flex items-center gap-3 rounded-xl border border-rule bg-[#f7f9f5] p-2 pl-2.5">
                    <span className="tile text-[26px]" style={{ width: "1.5em", height: "1.35em" }}>{i + 1}</span>
                    <span className="rounded-md bg-navy px-2 py-1 text-sm font-bold text-white">{pos?.short}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-extrabold">{p?.name ?? "（削除された選手）"}</span>
                      <span className="block text-xs text-navy-soft/70">
                        {p ? `#${p.number || "－"}・${teamName(p.teamId)}・${p.grade}年` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="上へ"
                      className="h-11 w-11 rounded-lg bg-white text-lg font-bold ring-1 ring-navy/10 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === order.length - 1}
                      aria-label="下へ"
                      className="h-11 w-11 rounded-lg bg-white text-lg font-bold ring-1 ring-navy/10 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="panel">
            <h2 className="panel__title">
              控え選手<small>{lineup.bench.length}人</small>
            </h2>
            <p className="f-hint -mt-2 mb-1">ベンチに入る選手をタップして選びます。</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {notPlaying.map((p) => {
                const on = lineup.bench.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleBench(p.id)}
                    aria-pressed={on}
                    className="choice choice--sm text-left"
                  >
                    {p.number ? `${p.number} ` : ""}
                    {p.name}
                  </button>
                );
              })}
              {notPlaying.length === 0 && (
                <p className="col-span-2 text-sm text-navy-soft/70">守備についていない選手はいません。</p>
              )}
            </div>
          </section>
          <SecondaryButton onClick={() => setTab("sheet")}>次へ：③ メンバー表を見る ›</SecondaryButton>
        </>
      )}

      {/* ③ メンバー表 */}
      {tab === "sheet" && (
        <>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn--accent print:hidden"
          >
            🖨 メンバー表を印刷する
          </button>
          <PaperPreview>
          <article className="px-[48px] py-[44px] text-black print:p-0">
            <header className="border-b-2 border-black pb-2">
              <p className="text-sm print:text-[10pt]">桜・浅羽野・住吉 連合チーム</p>
              <h2 className="text-[30px] font-extrabold print:text-[20pt]">{lineup.title || "メンバー表"}</h2>
              <p className="text-base font-bold print:text-[11pt]">
                {lineup.date && formatDateLong(lineup.date)}
                {lineup.opponent && `　vs ${lineup.opponent}`}
              </p>
            </header>
            <table className="mt-3 w-full border-collapse text-[19px] print:text-[13pt]">
              <thead>
                <tr className="border-b-2 border-black text-sm print:text-[10pt]">
                  <th className="w-12 py-1">打順</th>
                  <th className="w-16 py-1">守備</th>
                  <th className="w-14 py-1">背番号</th>
                  <th className="min-w-[14em] py-1 text-left">氏名</th>
                  <th className="w-12 py-1">学年</th>
                  <th className="w-20 py-1">学校</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 9 }).map((_, i) => {
                  const pid = order[i];
                  const p = pid ? byId.get(pid) : undefined;
                  const pos = pid ? POSITIONS.find((x) => x.key === positionOf(lineup, pid)) : undefined;
                  return (
                    <tr key={i} className="border-b border-black/40">
                      <td className="py-3 text-center text-[26px] font-extrabold print:text-[16pt]">{i + 1}</td>
                      <td className="py-3 text-center font-extrabold">
                        {pos ? `${pos.key} ${pos.short}` : ""}
                      </td>
                      <td className="py-3 text-center font-bold">{p?.number ?? ""}</td>
                      <td className="py-3 text-[23px] font-extrabold print:text-[15pt]">{p?.name ?? ""}</td>
                      <td className="py-3 text-center">{p ? `${p.grade}年` : ""}</td>
                      <td className="py-3 text-center">{p ? teamName(p.teamId) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3 className="mt-5 border-b-2 border-black pb-1 text-lg font-extrabold print:text-[12pt]">
              控え選手（{bench.length}人）
            </h3>
            <table className="w-full border-collapse text-[18px] print:text-[12pt]">
              <tbody>
                {bench.map((p) => (
                  <tr key={p.id} className="border-b border-black/30">
                    <td className="w-14 py-1.5 text-center font-bold">{p.number}</td>
                    <td className="py-1.5 font-bold">{p.name}</td>
                    <td className="w-12 py-1.5 text-center">{p.grade}年</td>
                    <td className="w-20 py-1.5 text-center">{teamName(p.teamId)}</td>
                  </tr>
                ))}
                {bench.length === 0 && (
                  <tr>
                    <td className="py-3 text-sm text-navy-soft/70">（なし）</td>
                  </tr>
                )}
              </tbody>
            </table>
          </article>
          </PaperPreview>
        </>
      )}

      <div className="mt-6 print:hidden">
        <SecondaryButton danger onClick={remove}>このメンバー表を削除する</SecondaryButton>
      </div>

      {picking && (
        <PlayerPicker
          title={`${POSITIONS.find((p) => p.key === picking)?.label}を選ぶ`}
          players={players}
          teams={teams}
          lineup={lineup}
          current={lineup.positions[picking]}
          onPick={(pid) => assign(picking, pid)}
          onClear={() => clearPos(picking)}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}
