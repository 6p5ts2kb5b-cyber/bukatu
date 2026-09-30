// メンバー表（Firestoreの「lineups」コレクション）を読み書きする部品です。
//
// lineups = 試合ごとのメンバー表
//   title     = 名前（例：10/12 大会 第1試合）
//   date      = 日付
//   opponent  = 対戦相手
//   positions = 守備位置 → 選手ID（"1"=投手 … "9"=右翼）
//   order     = 打順（選手IDを1番から順に）
//   bench     = 控え選手のID

import {
  addDoc,
  collection,
  deleteDoc,
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
  await updateDoc(doc(db(), "lineups", id), { ...rest, updatedAt: serverTimestamp() });
}

export async function deleteLineup(id: string): Promise<void> {
  await deleteDoc(doc(db(), "lineups", id));
}
