// 大会運営（Firestoreの「opsTournaments」）：うちが出ないブロックも含めた、1日目のリーグ戦の結果を管理します。
//
// opsTournaments = 大会ごと
//   name   = 大会名（例：第13回STORM杯 1日目）
//   rule   = 順位の決め方（jjbf ／ storm）
//   date   = 日付
//   blocks = ブロック（3チームのリーグ戦）
//     name  = ブロック名（例：Aブロック）
//     venue = 会場
//     teams = 3チーム
//     games = 3試合（チーム名は teams か「第1試合の勝者／敗者」）

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
import type { Game } from "./activities";
import type { LeagueRule } from "./league";

export type OpsBlock = {
  name: string;
  venue: string;
  teams: string[];
  games: Game[];
};

export type OpsTournament = {
  id: string;
  name: string;
  rule: LeagueRule;
  date: string;
  blocks: OpsBlock[];
};

export type OpsDraft = Omit<OpsTournament, "id">;

const COL = "opsTournaments";

function db(): Firestore {
  return getFirestore(firebaseApp());
}

// 試合（他チーム同士の形）。点数などは未入力
function game(home: string, opponent: string, startTime = ""): Game {
  return { home, opponent, others: true, startTime, bench: "1塁" };
}

// よくある1日目の組み方：①A対B ②第1試合の敗者対C ③第1試合の勝者対C
export function newBlock(n: number): OpsBlock {
  const name = `${String.fromCharCode(65 + (n % 26))}ブロック`;
  return {
    name,
    venue: "",
    teams: ["", "", ""],
    games: [game("", ""), game("第1試合の敗者", ""), game("第1試合の勝者", "")],
  };
}

export function blankTournament(): OpsDraft {
  return { name: "", rule: "storm", date: "", blocks: [newBlock(0)] };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toGame(x: Record<string, unknown>): Game {
  return {
    home: String(x.home ?? ""),
    opponent: String(x.opponent ?? ""),
    others: true,
    startTime: String(x.startTime ?? ""),
    bench: x.bench === "3塁" ? "3塁" : "1塁",
    sh: num(x.sh),
    sa: num(x.sa),
    oh: num(x.oh),
    oa: num(x.oa),
    called: x.called === true,
    inn: num(x.inn),
    lh: Array.isArray(x.lh) ? x.lh.map(num) : [],
    la: Array.isArray(x.la) ? x.la.map(num) : [],
    first: x.first === "r" ? "r" : "l",
  };
}

function toTournament(id: string, x: Record<string, unknown>): OpsTournament {
  const blocks = Array.isArray(x.blocks) ? (x.blocks as Record<string, unknown>[]) : [];
  return {
    id,
    name: String(x.name ?? ""),
    rule: x.rule === "jjbf" ? "jjbf" : "storm",
    date: String(x.date ?? ""),
    blocks: blocks.map((b) => ({
      name: String(b.name ?? ""),
      venue: String(b.venue ?? ""),
      teams: Array.isArray(b.teams) ? (b.teams as unknown[]).map(String) : ["", "", ""],
      games: Array.isArray(b.games) ? (b.games as Record<string, unknown>[]).map(toGame) : [],
    })),
  };
}

export async function listOps(): Promise<OpsTournament[]> {
  const snap = await getDocs(query(collection(db(), COL), orderBy("date", "desc")));
  return snap.docs.map((d) => toTournament(d.id, d.data()));
}

export async function getOps(id: string): Promise<OpsTournament | null> {
  const snap = await getDoc(doc(db(), COL, id));
  return snap.exists() ? toTournament(snap.id, snap.data()) : null;
}

export async function createOps(t: OpsDraft): Promise<string> {
  const ref = await addDoc(collection(db(), COL), { ...t, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function saveOps(t: OpsTournament): Promise<void> {
  const { id, ...rest } = t;
  await updateDoc(doc(db(), COL, id), { ...rest, updatedAt: serverTimestamp() });
}

export async function deleteOps(id: string): Promise<void> {
  await deleteDoc(doc(db(), COL, id));
}
