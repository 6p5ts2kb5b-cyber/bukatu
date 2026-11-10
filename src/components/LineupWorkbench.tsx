"use client";

// メンバー表を作る部分（ログインして使う画面と、ログインなしの共有ページで共通）です。
//   タブ1「守備位置」… 野球のダイヤモンド上の丸をタップして選手を選ぶ
//   タブ2「打順」   … 1番から順にタップして決める（2人タップで入れ替え）、控え選手を選ぶ
//   タブ3「メンバー表」… 打順・守備・背番号・氏名の表を確認して印刷する

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { PaperPreview } from "@/components/PaperPreview";
import { Field, inputClass, SecondaryButton } from "@/components/ui";
import { formatDateLong } from "@/lib/activities";
import { shareOrDownload } from "@/lib/sharePdf";
import { lineupToPdf, lineupToPng, startersRowH, type SheetRow } from "@/lib/lineupPdf";
import { POSITIONS, positionOf, benchOf, batCount, battingOrder, extraNeed, extrasOf, type Lineup } from "@/lib/lineups";
import type { Player } from "@/lib/players";
import type { Team } from "@/lib/teams";

type Tab = "field" | "order" | "sheet";

// 守備位置の場所（ユニフォームの中心。横・縦を % で指定）
const SPOTS: Record<string, { x: number; y: number }> = {
  "8": { x: 50, y: 14 },
  "7": { x: 20, y: 24 },
  "9": { x: 80, y: 24 },
  "6": { x: 34, y: 42 },
  "4": { x: 66, y: 42 },
  "5": { x: 19, y: 63 },
  "3": { x: 81, y: 63 },
  "1": { x: 50, y: 64 },
  "2": { x: 50, y: 88 },
};

// 守備位置の札（P・C…）と色：投手は赤、捕手は黄、内野は緑、外野は青
export const POS_BADGE: Record<string, { en: string; color: string }> = {
  "1": { en: "P", color: "#d7263d" },
  "2": { en: "C", color: "#e89a00" },
  "3": { en: "1B", color: "#15803d" },
  "4": { en: "2B", color: "#15803d" },
  "5": { en: "3B", color: "#15803d" },
  "6": { en: "SS", color: "#15803d" },
  "7": { en: "LF", color: "#1d72b8" },
  "8": { en: "CF", color: "#1d72b8" },
  "9": { en: "RF", color: "#1d72b8" },
  DH: { en: "DH", color: "#6b4bb0" },
};

export function PosBadge({ pos }: { pos: string }) {
  const b = POS_BADGE[pos];
  if (!b) return <span className="posb posb--none">－</span>;
  return (
    <span className="posb" style={{ background: b.color }}>
      {b.en}
    </span>
  );
}

// ユニフォーム（背番号入り）。空いている守備位置は点線で守備の名前を出す
export function Jersey({
  no,
  empty = false,
  label = "",
  className = "",
  small = false,
}: {
  no?: string;
  empty?: boolean;
  label?: string;
  className?: string;
  small?: boolean; // 打順の行など小さく出すとき（背番号を大きめに）
}) {
  const text = empty ? label : no || "";
  const size = (text.length >= 3 ? 9.5 : text.length === 2 ? 12.5 : 14) * (small ? 1.3 : 1);
  return (
    <svg viewBox="0 0 40 40" className={`jersey${empty ? " jersey--empty" : ""} ${className}`} aria-hidden>
      <defs>
        <linearGradient id="jersey-cloth" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#e3e7e4" />
          <stop offset="0.25" stopColor="#ffffff" />
          <stop offset="0.75" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9dfdb" />
        </linearGradient>
      </defs>
      <path
        className="jersey__body"
        d="M13 4.5 L5 9.5 L1.8 17 L8.6 20.2 L11 16.6 V36.5 H29 V16.6 L31.4 20.2 L38.2 17 L35 9.5 L27 4.5 C25 8.4 15 8.4 13 4.5 Z"
      />
      {!empty && (
        <>
          <path d="M13 4.5 C15 8.4 25 8.4 27 4.5" className="jersey__trim" strokeWidth="2.2" />
          <path d="M2.7 15 L9.4 18.2 M37.3 15 L30.6 18.2" className="jersey__trim" strokeWidth="1.5" />
        </>
      )}
      <text x="20" y={empty ? 26 : small ? 30 : 28.5} textAnchor="middle" fontSize={empty ? 10 : size} className="jersey__no">
        {text}
      </text>
    </svg>
  );
}

// 球場の絵（上から見た形）。flat のときは横長につぶして、打順の画面の上に小さく出す
function FieldPicture({ flat = false }: { flat?: boolean }) {
  const id = flat ? "f2" : "f1";
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio={flat ? "none" : "xMidYMid meet"}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        {/* 芝の刈り目（市松模様） */}
        <pattern id={`${id}-mow`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45 50 50)">
          <rect width="7" height="7" fill="rgb(255 255 255 / 0.07)" />
          <rect x="7" y="7" width="7" height="7" fill="rgb(255 255 255 / 0.07)" />
        </pattern>
        <pattern id={`${id}-stripe`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45 50 50)">
          <rect width="2" height="4" fill="rgb(255 255 255 / 0.06)" />
        </pattern>
        <radialGradient id={`${id}-dirt`} cx="50%" cy="80%" r="70%">
          <stop offset="0" stopColor="#c98a55" />
          <stop offset="1" stopColor="#a96a3c" />
        </radialGradient>
        <radialGradient id={`${id}-shade`} cx="50%" cy="45%" r="75%">
          <stop offset="0.6" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="1" stopColor="rgb(0 0 0 / 0.28)" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="#2f7d36" />
      <rect width="100" height="100" fill={`url(#${id}-mow)`} />
      {/* 内野の土 */}
      <path d="M50 102 L7 59 A44 44 0 0 1 93 59 Z" fill={`url(#${id}-dirt)`} />
      <circle cx="50" cy="87" r="8.5" fill={`url(#${id}-dirt)`} />
      {/* 内野の芝 */}
      <path d="M50 79.5 L65.5 64 L50 48.5 L34.5 64 Z" fill="#3a8c40" />
      <path d="M50 79.5 L65.5 64 L50 48.5 L34.5 64 Z" fill={`url(#${id}-stripe)`} />
      <circle cx="28" cy="64" r="3.6" fill="#b87a48" />
      <circle cx="72" cy="64" r="3.6" fill="#b87a48" />
      <circle cx="50" cy="42" r="3.6" fill="#b87a48" />
      {/* マウンド */}
      <circle cx="50" cy="64" r="3.4" fill="#c08250" />
      <rect x="48.6" y="63.6" width="2.8" height="0.8" fill="#fff" />
      {/* ファウルライン・バッターボックス */}
      <path d="M50 86 L-2 34 M50 86 L102 34" stroke="#fff" strokeWidth={flat ? 0.8 : 0.55} vectorEffect={flat ? "non-scaling-stroke" : undefined} />
      <path d="M44.6 84.4 h3 v5 h-3 z M52.4 84.4 h3 v5 h-3 z" stroke="#fff" strokeWidth="0.35" fill="none" />
      {/* ベース */}
      <rect x="48.6" y="40.6" width="2.8" height="2.8" fill="#fff" transform="rotate(45 50 42)" />
      <rect x="26.6" y="62.6" width="2.8" height="2.8" fill="#fff" transform="rotate(45 28 64)" />
      <rect x="70.6" y="62.6" width="2.8" height="2.8" fill="#fff" transform="rotate(45 72 64)" />
      <path d="M48.5 85.6 h3 v1.4 l-1.5 1.4 l-1.5 -1.4 z" fill="#fff" />
      <rect width="100" height="100" fill={`url(#${id}-shade)`} />
    </svg>
  );
}

// 奥行きのある球場（② 打順の上）：球場の絵を後ろへ倒して見せる（.ballpark3d__plane と同じ角度・遠近）
//   倒す角度 TILT、遠近の強さ PERSP（球場の幅を1として）、箱の高さ BOX_H（幅を1として）
const TILT = (55 * Math.PI) / 180;
const PERSP = 1.6;
const BOX_H = 0.44;
// 球場の絵の上の点（%）が、箱の中のどこに見えるか（%）と、遠いほど小さくする文字の倍率
function project3d(spot: { x: number; y: number }): { left: number; top: number; scale: number } {
  const u = spot.x / 100;
  const v = spot.y / 100;
  const s = PERSP / (PERSP + (1 - v) * Math.sin(TILT));
  const up = (1 - v) * Math.cos(TILT) * s;
  return { left: (0.5 + (u - 0.5) * s) * 100, top: (1 - up / BOX_H) * 100, scale: 0.75 + 0.3 * s };
}

// 名字だけ（「知久 大翔」→「知久」）
const surname = (name: string) => name.split(/[\s　]/)[0];

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
  // まだ守備についていない選手を先に（守備についている選手は後ろへ）
  const list = players
    .filter((p) => p.active && (filter === "all" || p.teamId === filter))
    .sort((x, y) => Number(!!positionOf(lineup, x.id)) - Number(!!positionOf(lineup, y.id)));
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 print:hidden" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-navy/10 px-4 py-2">
          <h3 className="text-base font-extrabold">{title}</h3>
          <button type="button" onClick={onClose} className="min-h-10 px-3 text-base font-bold text-navy-soft">
            閉じる
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {[{ id: "all", shortName: "全員" }, ...teams.filter((t) => t.active)].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`min-h-8 rounded-full px-3 text-sm font-bold ring-1 ${
                filter === t.id ? "bg-navy text-white ring-navy" : "bg-white ring-navy/15"
              }`}
            >
              {t.shortName}
            </button>
          ))}
        </div>
        <div className="pp-scroll">
          {current && onClear && (
            <button type="button" onClick={onClear} className="pp-clear">
              この守備位置を空ける
            </button>
          )}
          {list.length === 0 && <p className="pp-empty">選手がいません。メニューの「選手名簿」から登録してください。</p>}
          <ul className="pp-grid">
            {list.map((p) => {
              const pos = positionOf(lineup, p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick(p.id)}
                    className={`pp-item${p.id === current ? " is-current" : ""}${pos ? " is-playing" : ""}`}
                  >
                    <span className="pp-no">{p.number || "－"}</span>
                    <span className="pp-text">
                      <span className="pp-name">{p.name}</span>
                      <span className="pp-meta">
                        {teamName(p.teamId)}・{p.grade}年
                      </span>
                    </span>
                    {pos ? <PosBadge pos={pos} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function LineupWorkbench({
  lineup,
  onChange,
  players,
  teams,
  top,
  bottom,
}: {
  lineup: Lineup;
  onChange: (l: Lineup) => void;
  players: Player[];
  teams: Team[];
  top?: ReactNode;
  bottom?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("field");
  // 打順：「1番から順にタップ」で作っている途中の並び／入れ替えで1人目に選んだ打順
  const [draft, setDraft] = useState<string[] | null>(null);
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; dy: number; h: number } | null>(null);
  const dragY = useRef(0);
  const [picking, setPicking] = useState<string | null>(null); // 選手を選んでいる守備位置
  // メンバー表のPDF（A4の1枚）。作る → スマホの共有画面でLINE・メールを選ぶ
  const sheetRef = useRef<HTMLElement>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [png, setPng] = useState<File | null>(null);
  const [making, setMaking] = useState<"" | "pdf" | "png">("");
  const [pdfNote, setPdfNote] = useState("");
  useEffect(() => {
    setPdf(null);
    setPng(null);
    setPdfNote("");
  }, [lineup, players, teams]);
  const sheetDataRef = useRef<(() => Parameters<typeof lineupToPdf>[0]) | null>(null);
  const sheetData = () => sheetDataRef.current!();
  // 送る：PDF（A4）または画像（LINEのトークでそのまま見える）。iPhoneは作った後にもう一度押すと共有画面
  const send = async (kind: "pdf" | "png") => {
    if (!sheetRef.current || making) return;
    const title = lineup.title || "メンバー表";
    const word = kind === "pdf" ? "PDF" : "画像";
    const share = async (f: File) => {
      try {
        const r = await shareOrDownload(f, title);
        if (r === "downloaded") setPdfNote(`${word}を保存しました。LINEやメールに添付して送ってください。`);
      } catch {
        setPdfNote(`「${word}を送る」をもう一度押してください。`);
      }
    };
    const made = kind === "pdf" ? pdf : png;
    if (made) return share(made);
    setMaking(kind);
    try {
      const base = title.replace(/[\s/\\]+/g, "_");
      const f = kind === "pdf" ? await lineupToPdf(sheetData(), `${base}.pdf`) : await lineupToPng(sheetData(), `${base}.png`);
      if (kind === "pdf") setPdf(f);
      else setPng(f);
      await share(f);
    } catch {
      setPdfNote(`${word}を作れませんでした。もう一度お試しください。`);
    } finally {
      setMaking("");
    }
  };
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamName = (tid: string) => teams.find((t) => t.id === tid)?.shortName ?? "";
  const update = (patch: Partial<Lineup>) => onChange({ ...lineup, ...patch });
  // 守備についていない選手（背番号順）。打たない選手は全員控え
  const active = players.filter((p) => p.active);
  const total = active.length;
  const notPlayingFor = (positions: Record<string, string>) =>
    active
      .filter((p) => !Object.values(positions).includes(p.id))
      .sort((x, y) => (Number(x.number) || 999) - (Number(y.number) || 999));
  const notPlaying = notPlayingFor(lineup.positions);
  const extras = extrasOf(lineup, notPlaying, total); // 守備につかずに打つ選手（DH・10人目…）
  const benchIds = benchOf(lineup, notPlaying, total);
  const nBat = batCount(lineup, total);
  const need = extraNeed(lineup, total);
  const maxBat = Math.max(9, lineup.dh ? total - 1 : total); // 打てる人数の上限（全員打ち）
  // 打つ人数・DH・打つ選手を変えたら、打順を整えて保存
  const relineup = (l: Lineup): Lineup => {
    const np = notPlayingFor(l.positions);
    const ex = extrasOf(l, np, total);
    const trimmed = l.bats === "all" ? l.extra : ex;
    const next = { ...l, extra: trimmed ?? [] };
    return { ...next, order: battingOrder(next, np, total) };
  };
  const setBat = (patch: Partial<Lineup>) => onChange(relineup({ ...lineup, ...patch }));
  const toggleExtra = (pid: string) => {
    const cur = extras;
    if (cur.includes(pid)) setBat({ extra: cur.filter((x) => x !== pid) });
    else if (cur.length < need) setBat({ extra: [...cur, pid] });
  };

  // 次に空いている守備位置（投手 → 一塁 → 二塁 → 三塁 → 遊撃 → 左翼 → 中堅 → 右翼 → 捕手の順。from より後ろ → 前へ回る）
  const PICK_ORDER = ["1", "3", "4", "5", "6", "7", "8", "9", "2"];
  const nextEmpty = (positions: Record<string, string>, from = ""): string | null => {
    const keys = PICK_ORDER;
    const start = from ? keys.indexOf(from) + 1 : 0;
    const ring = [...keys.slice(start), ...keys.slice(0, start)];
    return ring.find((k) => !positions[k]) ?? null;
  };
  const assign = (posKey: string, playerId: string) => {
    const positions: Record<string, string> = {};
    for (const [k, v] of Object.entries(lineup.positions)) {
      if (v && v !== playerId && k !== posKey) positions[k] = v;
    }
    positions[posKey] = playerId;
    onChange(
      relineup({
        ...lineup,
        positions,
        extra: (lineup.extra ?? []).filter((x) => x !== playerId),
        bench: lineup.bench.filter((b) => b !== playerId),
      }),
    );
    // 空いていた守備位置なら、次の空いている守備位置（投→一→二→三→遊→左→中→右→捕）を続けて選ぶ
    setPicking(lineup.positions[posKey] ? null : nextEmpty(positions, posKey));
  };

  const clearPos = (posKey: string) => {
    const positions = { ...lineup.positions };
    delete positions[posKey];
    onChange(relineup({ ...lineup, positions }));
    setPicking(null);
  };

  const order = battingOrder(lineup, notPlaying, total);
  // 打順の行に出す守備（守備につかずに打つ選手は DH）
  const posOf = (pid: string) => positionOf(lineup, pid) || (extras.includes(pid) ? "DH" : "");
  // 打順：2人をタップで入れ替え
  const tapRow = (i: number) => {
    if (swapFrom == null) return setSwapFrom(i);
    if (swapFrom === i) return setSwapFrom(null);
    const next = [...order];
    [next[swapFrom], next[i]] = [next[i], next[swapFrom]];
    update({ order: next });
    setSwapFrom(null);
  };
  // 打順：右の「≡」を押したまま上下に動かして並べ替える
  const dragStart = (i: number, e: RPointerEvent<HTMLElement>) => {
    e.preventDefault();
    const li = e.currentTarget.closest("li");
    if (!li) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragY.current = e.clientY;
    setSwapFrom(null);
    setDrag({ from: i, dy: 0, h: li.getBoundingClientRect().height + 6 });
  };
  const dragTo = (d: { from: number; dy: number; h: number }) =>
    Math.max(0, Math.min(order.length - 1, d.from + Math.round(d.dy / d.h)));
  const dragMove = (e: RPointerEvent<HTMLElement>) => {
    if (drag) setDrag({ ...drag, dy: e.clientY - dragY.current });
  };
  const dragEnd = () => {
    if (!drag) return;
    const to = dragTo(drag);
    if (to !== drag.from) {
      const next = [...order];
      const [m] = next.splice(drag.from, 1);
      next.splice(to, 0, m);
      update({ order: next });
    }
    setDrag(null);
  };
  const dragStyle = (i: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (i === drag.from) return { transform: `translateY(${drag.dy}px)`, zIndex: 3, transition: "none" };
    const to = dragTo(drag);
    if (drag.from < to && i > drag.from && i <= to) return { transform: `translateY(${-drag.h}px)` };
    if (drag.from > to && i >= to && i < drag.from) return { transform: `translateY(${drag.h}px)` };
    return undefined;
  };
  // 打順：1番から順にタップ。全員入ったら決定
  const pick = (pid: string) => {
    if (!draft) return;
    const next = [...draft, pid];
    if (next.length >= order.length) {
      update({ order: next });
      setDraft(null);
    } else setDraft(next);
  };

  // 守備についていない選手は自動で控え。押すと外す／戻す

  const filled = POSITIONS.filter((p) => lineup.positions[p.key]).length;
  const bench = benchIds.map((b) => byId.get(b)).filter(Boolean) as Player[];
  // PDF に描く内容（画面のメンバー表と同じ）
  sheetDataRef.current = () => {
    const starters: SheetRow[] = Array.from({ length: Math.max(nBat, order.length) }).map((_, i) => {
      const pid = order[i];
      const p = pid ? byId.get(pid) : undefined;
      return {
        order: i + 1,
        pos: pid ? posOf(pid) : "",
        number: p?.number ?? "",
        name: p?.name ?? "",
        grade: p ? `${p.grade}年` : "",
        school: p ? teamName(p.teamId) : "",
      };
    });
    const rows: SheetRow[] = bench.map((p, i) => ({
      order: i + 1,
      number: p.number,
      name: p.name,
      grade: `${p.grade}年`,
      school: teamName(p.teamId),
    }));
    for (let i = rows.length; i < 5; i++) rows.push({ order: i + 1, number: "", name: "", grade: "", school: "" });
    // DHあり：投手は打たないので、打順の下に「投手」として書く
    const pitcher = lineup.dh ? byId.get(lineup.positions["1"] ?? "") : undefined;
    if (lineup.dh)
      starters.push({
        order: "投手",
        pos: "1",
        number: pitcher?.number ?? "",
        name: pitcher?.name ?? "",
        grade: pitcher ? `${pitcher.grade}年` : "",
        school: pitcher ? teamName(pitcher.teamId) : "",
      });
    return {
      team: "桜・浅羽野・住吉 連合チーム",
      title: lineup.title || "メンバー表",
      date: lineup.date ? formatDateLong(lineup.date) : "",
      opponent: lineup.opponent,
      starters,
      bench: rows,
    };
  };
  const sheet = sheetDataRef.current();
  const sheetRowH = startersRowH(sheet.starters.length);
  const sheetVars = { "--rh": `${sheetRowH}mm`, "--k": Math.max(0.62, sheetRowH / 16) } as CSSProperties;

  return (
    <>
      {top}
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
            {filled === 9 ? "● 守備9人がそろいました" : `▲ 守備 ${filled}/9人 ― ユニフォームをタップして選ぶ`}
          </p>
          {filled < 9 && (
            <button type="button" className="btn btn--primary" onClick={() => setPicking(nextEmpty(lineup.positions))}>
              {filled === 0 || !lineup.positions["1"] ? "投手から順に選ぶ" : "空いている守備を順に選ぶ"}
            </button>
          )}
          <div className="ballpark">
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
                  className={`ballpark__spot${player ? "" : " is-empty"}`}
                  aria-label={`${pos.label}：${player?.name ?? "未定"}`}
                >
                  <span className="ballpark__name">{player ? surname(player.name) : pos.label}</span>
                  <Jersey no={player?.number || pos.short} empty={!player} label={pos.short} />
                </button>
              );
            })}
            <button type="button" className="ballpark__corner" onClick={() => setTab("order")}>
              打順を決める ›
            </button>
          </div>
          <p className="ballpark__hint">投手から順に選べます。1つだけ変えるときは、ユニフォームをタップしてください。</p>
          <SecondaryButton onClick={() => setTab("order")}>次へ：② 打順を決める ›</SecondaryButton>
        </>
      )}

      {/* ② 打順 */}
      {tab === "order" && (
        <>
          <div className="ballpark3d">
            <div className="ballpark3d__plane" aria-hidden>
              <FieldPicture />
            </div>
            {POSITIONS.map((pos) => {
              const player = byId.get(lineup.positions[pos.key] ?? "");
              const p = project3d(SPOTS[pos.key]);
              return (
                <span
                  key={pos.key}
                  className={`ballpark3d__tag${player ? "" : " is-empty"}`}
                  style={{ left: `${p.left}%`, top: `${p.top}%`, fontSize: `${p.scale}em` }}
                >
                  {player ? surname(player.name) : POS_BADGE[pos.key].en}
                </span>
              );
            })}
            <button type="button" className="ballpark__corner" onClick={() => setTab("field")}>
              ‹ 守備を変える
            </button>
          </div>
          <section className="panel bat-setup">
            <h2 className="panel__title">打つ人数</h2>
            <div className="bat-row">
              <div className="bat-step" role="group" aria-label="打つ人数">
                <button
                  type="button"
                  aria-label="1人へらす"
                  disabled={lineup.bats !== "all" && nBat <= 9}
                  onClick={() => setBat({ bats: Math.max(9, nBat - 1) === 9 ? undefined : nBat - 1 })}
                >
                  −
                </button>
                <span>
                  <b>{nBat}</b>人
                </span>
                <button
                  type="button"
                  aria-label="1人ふやす"
                  disabled={nBat >= maxBat}
                  onClick={() => setBat({ bats: nBat + 1 >= maxBat ? "all" : nBat + 1 })}
                >
                  ＋
                </button>
              </div>
              <button
                type="button"
                className="pick"
                aria-pressed={lineup.bats === "all"}
                onClick={() => setBat({ bats: lineup.bats === "all" ? undefined : "all" })}
              >
                全員打ち
              </button>
              <button
                type="button"
                className="pick"
                aria-pressed={!!lineup.dh}
                onClick={() => setBat({ dh: !lineup.dh })}
              >
                DHあり
              </button>
            </div>
            <p className="f-hint m-0">
              {lineup.dh ? "DHあり：投手は打ちません。" : ""}
              {lineup.bats === "all"
                ? `全員打ち：守備についていない${notPlaying.length}人も全員打ちます。`
                : need > 0
                  ? `守備につかずに打つ選手（DH）が${need}人います。下から選んでください。`
                  : "ふつうの9人打ちです。DH・10人打ち・全員打ちは上で変えられます。"}
            </p>
            {lineup.bats !== "all" && need > 0 && (
              <>
                <p className={`bat-need${extras.length < need ? " is-short" : ""}`}>
                  打つだけの選手（DH） {extras.length}／{need}人
                  {extras.length < need && <small>あと{need - extras.length}人タップ</small>}
                </p>
                <div className="bat-pool">
                  {notPlaying.map((p) => {
                    const on = extras.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`bat-chip${on ? " is-on" : ""}`}
                        aria-pressed={on}
                        disabled={!on && extras.length >= need}
                        onClick={() => toggleExtra(p.id)}
                      >
                        <Jersey no={p.number || "－"} className="bat-chip__jersey" small />
                        <span>{p.name}</span>
                      </button>
                    );
                  })}
                  {notPlaying.length === 0 && <p className="f-hint m-0">守備についていない選手がいません。</p>}
                </div>
              </>
            )}
          </section>

          <section className="panel">
            <h2 className="panel__title">打順</h2>
            {order.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#8a6500]">▲ 先に「① 守備位置」で選手を選んでください。</p>
            ) : draft ? (
              <>
                <p className="bo-guide">
                  <b>{draft.length + 1}番</b>の選手をタップしてください
                  <small>（{draft.length}／{order.length}人）</small>
                </p>
                {/* まだ打順が決まっていない選手（守備の順） */}
                <div className="bo-pool">
                  {order
                    .filter((pid) => !draft.includes(pid))
                    .sort((x, y) => (Number(positionOf(lineup, x)) || 10) - (Number(positionOf(lineup, y)) || 10))
                    .map((pid) => {
                      const p = byId.get(pid);
                      return (
                        <button key={pid} type="button" className="bo-chip" onClick={() => pick(pid)}>
                          <PosBadge pos={posOf(pid)} />
                          <span className="bo-chip__name">{p?.name ?? "（削除された選手）"}</span>
                        </button>
                      );
                    })}
                </div>
                <ol className="bo-list">
                  {order.map((_, i) => {
                    const pid = draft[i];
                    const p = pid ? byId.get(pid) : undefined;
                    return (
                      <li key={i} className={`bo-row${!pid ? " is-empty" : ""}${i === draft.length ? " is-next" : ""}`}>
                        <span className="tile bo-no">{i + 1}</span>
                        {pid ? (
                          <>
                            <PosBadge pos={posOf(pid)} />
                            <span className="bo-name">{p?.name}</span>
                          </>
                        ) : (
                          <span className="bo-name bo-name--empty">{i === draft.length ? "← ここに入ります" : ""}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn btn--ghost btn--small" disabled={!draft.length} onClick={() => setDraft(draft.slice(0, -1))}>
                    1つ戻す
                  </button>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setDraft(null)}>
                    やめる（前の打順に戻す）
                  </button>
                </div>
              </>
            ) : (
              <>
                <button type="button" className="btn btn--primary" onClick={() => { setSwapFrom(null); setDraft([]); }}>
                  1番から順にタップして決める
                </button>
                {swapFrom != null ? (
                  <p className="bo-swap-note">
                    {swapFrom + 1}番と入れ替える選手をタップ
                    <button type="button" onClick={() => setSwapFrom(null)}>やめる</button>
                  </p>
                ) : (
                  <p className="f-hint mb-1 mt-2">
                    打順を変えるとき：替えたい2人を順にタップすると入れ替わります。右の「≡」を押したまま上下に動かしても並べ替えられます。
                  </p>
                )}
                <ol className={`bo-list bo-list--lineup${drag ? " is-dragging" : ""}`}>
                  {order.map((pid, i) => {
                    const p = byId.get(pid);
                    const posKey = posOf(pid);
                    return (
                      <li key={pid} className="bo-item" style={dragStyle(i)}>
                        <button
                          type="button"
                          className={`bo-row bo-row--btn bo-row--lineup${swapFrom === i ? " is-picked" : ""}${swapFrom != null && swapFrom !== i ? " is-target" : ""}${drag?.from === i ? " is-lifted" : ""}`}
                          onClick={() => tapRow(i)}
                          aria-pressed={swapFrom === i}
                        >
                          <span className="bo-ord">{i + 1}</span>
                          <PosBadge pos={posKey} />
                          <Jersey no={p?.number || "－"} className="bo-jersey" small />
                          <span className="bo-name">{p?.name ?? "（削除された選手）"}</span>
                          <span className="bo-meta">{p ? `${teamName(p.teamId)}・${p.grade}年` : ""}</span>
                        </button>
                        <span
                          className="bo-handle"
                          role="button"
                          aria-label={`${i + 1}番を動かす`}
                          onPointerDown={(e) => dragStart(i, e)}
                          onPointerMove={dragMove}
                          onPointerUp={dragEnd}
                          onPointerCancel={dragEnd}
                        >
                          <i />
                          <i />
                          <i />
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {lineup.dh && lineup.positions["1"] && (
                  <p className="bat-pitcher">
                    <PosBadge pos="1" />
                    <span>{byId.get(lineup.positions["1"])?.name}</span>
                    <small>DHのため打ちません</small>
                  </p>
                )}
              </>
            )}
          </section>

          <section className="panel">
            <h2 className="panel__title">
              控え選手<small>{benchIds.length}人</small>
            </h2>
            <p className="f-hint -mt-2 mb-1">守備にも打順にも入っていない選手は、全員控えに入ります。</p>
            {bench.length === 0 ? (
              <p className="text-sm text-navy-soft/70">控えの選手はいません。</p>
            ) : (
              <ul className="bench-list">
                {bench.map((p) => (
                  <li key={p.id} className="bench-item">
                    <Jersey no={p.number || "－"} className="bench-jersey" small />
                    <span className="bench-name">{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <SecondaryButton onClick={() => setTab("sheet")}>次へ：③ メンバー表を見る ›</SecondaryButton>
        </>
      )}

      {/* ③ メンバー表 */}
      {tab === "sheet" && (
        <>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 print:hidden">
            <button type="button" onClick={() => send("png")} disabled={!!making} className="btn btn--line">
              {making === "png" ? "画像を作っています…" : png ? "画像を送る" : "画像でLINEに送る"}
            </button>
            <button type="button" onClick={() => send("pdf")} disabled={!!making} className="btn btn--accent">
              {making === "pdf" ? "PDFを作っています…" : pdf ? "PDFを送る" : "PDFで送る"}
            </button>
            <button type="button" onClick={() => window.print()} className="btn btn--ghost px-5">
              印刷
            </button>
          </div>
          {pdfNote && <p className="m-0 rounded-xl border border-rule bg-white p-3 text-sm font-bold print:hidden">{pdfNote}</p>}
          <PaperPreview>
          <article ref={sheetRef} className="ms">
            <header className="ms-head">
              <p className="ms-team">桜・浅羽野・住吉 連合チーム</p>
              <h2 className="ms-title">{lineup.title || "メンバー表"}</h2>
              <dl className="ms-meta">
                <div>
                  <dt>日付</dt>
                  <dd>{lineup.date ? formatDateLong(lineup.date) : ""}</dd>
                </div>
                <div>
                  <dt>対戦相手</dt>
                  <dd>{lineup.opponent}</dd>
                </div>
              </dl>
            </header>

            <table className="ms-table ms-table--starters" style={sheetVars}>
              <colgroup>
                <col style={{ width: "11%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "12%" }} />
                <col />
                <col style={{ width: "10%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>打順</th>
                  <th>守備</th>
                  <th>背番号</th>
                  <th>氏名</th>
                  <th>学年</th>
                  <th>学校</th>
                </tr>
              </thead>
              <tbody>
                {sheet.starters.map((r, i) => (
                  <tr key={i} className={typeof r.order === "string" ? "ms-pitcher" : undefined}>
                    <td className="ms-order">{r.order}</td>
                    <td className="ms-num">{r.pos}</td>
                    <td className="ms-num">{r.number}</td>
                    <td className="ms-name">{r.name}</td>
                    <td>{r.grade}</td>
                    <td>{r.school}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="ms-sub">控え選手（{bench.length}人）</h3>
            <table className="ms-table ms-table--bench">
              <colgroup>
                <col style={{ width: "11%" }} />
                <col style={{ width: "12%" }} />
                <col />
                <col style={{ width: "10%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>背番号</th>
                  <th>氏名</th>
                  <th>学年</th>
                  <th>学校</th>
                </tr>
              </thead>
              <tbody>
                {sheet.bench.map((r, i) => (
                  <tr key={i}>
                    <td>{r.order}</td>
                    <td className="ms-num">{r.number}</td>
                    <td className="ms-name">{r.name}</td>
                    <td>{r.grade}</td>
                    <td>{r.school}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
          </PaperPreview>
        </>
      )}

      {bottom}
      {picking && (
        <PlayerPicker
          title={`${POSITIONS.find((p) => p.key === picking)?.label}を選ぶ（守備 ${filled}/9人）`}
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
