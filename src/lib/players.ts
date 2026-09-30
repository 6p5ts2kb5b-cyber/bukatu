// 選手名簿（Firestoreの「players」コレクション）を読み書きする部品です。
//
// players = 選手の一覧
//   中身 = 氏名、ふりがな、学校（teamsのID）、学年、背番号、有効/無効

import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { firebaseApp } from "./firebase";

export type Player = {
  id: string;
  name: string; // 氏名
  kana: string; // ふりがな（並べ替え用・任意）
  teamId: string; // 学校（teams のID）
  grade: number; // 学年（1〜3）
  number: string; // 背番号（空欄可）
  active: boolean; // 有効（false = 卒業・退部など）
};

export type PlayerDraft = Omit<Player, "id"> & { id?: string };

export const EMPTY_PLAYER: PlayerDraft = {
  name: "",
  kana: "",
  teamId: "",
  grade: 1,
  number: "",
  active: true,
};

function db(): Firestore {
  return getFirestore(firebaseApp());
}

function num(n: string): number {
  const v = parseInt(n, 10);
  return Number.isNaN(v) ? 9999 : v;
}

// 背番号順（背番号が無い人は後ろ、その中はふりがな・氏名順）
export function sortPlayers(list: Player[]): Player[] {
  return [...list].sort(
    (a, b) =>
      num(a.number) - num(b.number) ||
      (a.kana || a.name).localeCompare(b.kana || b.name, "ja"),
  );
}

export async function listPlayers(): Promise<Player[]> {
  const snap = await getDocs(collection(db(), "players"));
  return sortPlayers(
    snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        name: String(x.name ?? ""),
        kana: String(x.kana ?? ""),
        teamId: String(x.teamId ?? ""),
        grade: typeof x.grade === "number" ? x.grade : 1,
        number: String(x.number ?? ""),
        active: x.active !== false,
      };
    }),
  );
}

function clean(p: PlayerDraft) {
  return {
    name: p.name.trim(),
    kana: p.kana.trim(),
    teamId: p.teamId,
    grade: p.grade,
    number: p.number.trim(),
    active: p.active,
  };
}

export async function addPlayer(p: PlayerDraft): Promise<void> {
  await addDoc(collection(db(), "players"), {
    ...clean(p),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updatePlayer(id: string, p: PlayerDraft): Promise<void> {
  await updateDoc(doc(db(), "players", id), { ...clean(p), updatedAt: serverTimestamp() });
}
