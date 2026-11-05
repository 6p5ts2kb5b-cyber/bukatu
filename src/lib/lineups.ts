// メンバー表（Firestoreの「lineups」コレクション）を読み書きする部品です。
//
// lineups = 試合ごとのメンバー表
//   title     = 名前（例：10/12 大会 第1試合）
//   date      = 日付
//   opponent  = 対戦相手
//   positions = 守備位置 → 選手ID（"1"=投手 … "9"=右翼）
//   order     = 打順（選手IDを1番から順に）
//   bench     = 控え選手のID（表示用に保存。決め方は benchOff）
//   benchOff  = （以前の名残。今は使わない：守備についていない選手は必ず全員控え）
//   dh        = DHあり（投手は打たない）
//   bats      = 打つ人数（9・10・11…、"all" = 全員打ち。なければ9）
//   extra     = 守備につかずに打つ選手（DH・10人目など）のID

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { firebaseApp } from "./firebase";

export const POSITIONS: { key: string; short: string; label: string }[] = [
  { key: "1", short: "投", label: "投手" },
  { key: "2", short: "捕", label: "捕手" },
  { key: "3", short: "一", label: "一塁手" },
  { key: "4", short: "二", label: "二塁手" },
  { key: "5", short: "三", label: "三塁手" },
  { key: "6", short: "遊", label: "遊撃手" },
  { key: "7", short: "左", label: "左翼手" },
  { key: "8", short: "中", label: "中堅手" },
  { key: "9", short: "右", label: "右翼手" },
];

export type Lineup = {
  id: string;
  title: string;
  date: string;
  opponent: string;
  positions: Record<string, string>;
  order: string[];
  bench: string[];
  // 控えに入れない選手（守備についていない選手は、ここに無ければ自動で控えになる）
  benchOff?: string[];
  dh?: boolean;
  bats?: number | "all";
  extra?: string[];
};

export type LineupDraft = Omit<Lineup, "id">;

function db(): Firestore {
  return getFirestore(firebaseApp());
}

function toLineup(id: string, x: Record<string, unknown>): Lineup {
  return {
    id,
    title: String(x.title ?? ""),
    date: String(x.date ?? ""),
    opponent: String(x.opponent ?? ""),
    positions: (x.positions as Record<string, string>) ?? {},
    order: Array.isArray(x.order) ? (x.order as string[]) : [],
    bench: Array.isArray(x.bench) ? (x.bench as string[]) : [],
    ...(Array.isArray(x.benchOff) ? { benchOff: x.benchOff as string[] } : {}),
    ...(x.dh === true ? { dh: true } : {}),
    ...(x.bats === "all" || (typeof x.bats === "number" && x.bats > 9) ? { bats: x.bats as number | "all" } : {}),
    ...(Array.isArray(x.extra) ? { extra: x.extra as string[] } : {}),
  };
}

// 守備位置に入っている選手の守備番号（いなければ ""）
export function positionOf(l: Pick<Lineup, "positions">, playerId: string): string {
  return Object.keys(l.positions).find((k) => l.positions[k] === playerId) ?? "";
}

// 守備についている選手に合わせて打順を整える
//   ・守備から外れた選手は打順から消す
//   ・新しく守備についた選手は打順の最後に足す（守備番号の順）
export function syncOrder(positions: Record<string, string>, order: string[]): string[] {
  const fielders = POSITIONS.map((p) => positions[p.key]).filter(Boolean);
  const kept = order.filter((id) => fielders.includes(id));
  const added = fielders.filter((id) => !kept.includes(id));
  return [...kept, ...added];
}

export async function listLineups(): Promise<Lineup[]> {
  const snap = await getDocs(query(collection(db(), "lineups"), orderBy("date", "desc")));
  return snap.docs.map((d) => toLineup(d.id, d.data()));
}

export async function getLineup(id: string): Promise<Lineup | null> {
  const snap = await getDoc(doc(db(), "lineups", id));
  return snap.exists() ? toLineup(snap.id, snap.data()) : null;
}

export async function createLineup(l: LineupDraft): Promise<string> {
  const ref = await addDoc(collection(db(), "lineups"), {
    ...l,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function saveLineup(l: Lineup): Promise<void> {
  const { id, ...rest } = l;
  // 空（undefined）の項目は、保存先からも消す（9人打ちに戻したときなど）
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) data[k] = v === undefined ? deleteField() : v;
  await updateDoc(doc(db(), "lineups", id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteLineup(id: string): Promise<void> {
  await deleteDoc(doc(db(), "lineups", id));
}

// ---- 打つ人数（DHあり・10人打ち・全員打ち） ----

// 打つ人数。total = 出られる選手の人数（全員打ちのとき）
export function batCount(l: Pick<Lineup, "bats" | "dh">, total: number): number {
  if (l.bats === "all") return Math.max(9, l.dh ? total - 1 : total); // DHありなら投手は打たない
  return typeof l.bats === "number" && l.bats > 9 ? l.bats : 9;
}

// 守備につかずに打つ選手（DH・10人目…）が何人いるか
export function extraNeed(l: Pick<Lineup, "bats" | "dh">, total: number): number {
  return Math.max(0, batCount(l, total) - (l.dh ? 8 : 9));
}

// 守備につかずに打つ選手。notPlaying = 守備についていない選手（背番号順）
//   全員打ち … 守備についていない選手は全員打つ
//   それ以外 … 選んだ選手（extra）を、必要な人数まで
export function extrasOf(l: Lineup, notPlaying: { id: string }[], total: number): string[] {
  const ids = notPlaying.map((p) => p.id);
  if (l.bats === "all") return ids;
  return (l.extra ?? []).filter((id) => ids.includes(id)).slice(0, extraNeed(l, total));
}

// 打順：打つ選手（守備の9人〔DHありなら投手を除く〕＋守備につかずに打つ選手）に合わせて整える
//   ・打たなくなった選手は打順から消す ・新しく打つ選手は最後に足す
export function battingOrder(l: Lineup, notPlaying: { id: string }[], total: number): string[] {
  const fielders = POSITIONS.filter((p) => !(l.dh && p.key === "1"))
    .map((p) => l.positions[p.key])
    .filter(Boolean);
  const batters = [...fielders, ...extrasOf(l, notPlaying, total)];
  const kept = l.order.filter((id) => batters.includes(id));
  return [...kept, ...batters.filter((id) => !kept.includes(id))];
}

// 控え選手：守備についていない選手のうち、打たない選手は全員
export function benchOf(l: Lineup, notPlaying: { id: string }[], total = notPlaying.length + 9): string[] {
  // 守備についていない選手は、必ず全員控えに入る（外すことはない）。ただし打つ選手（DHなど）は除く
  const ex = extrasOf(l, notPlaying, total);
  return notPlaying.map((p) => p.id).filter((id) => !ex.includes(id));
}
