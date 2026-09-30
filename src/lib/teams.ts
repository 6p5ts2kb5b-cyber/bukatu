// 学校（合同チーム）名簿（Firestoreの「teams」コレクション）を読み書きする部品です。
//
// teams = 所属学校（合同チーム）の名簿
//   中身 = 学校名、略称（画面に出す短い名前）、表示順、有効/無効

import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { firebaseApp } from "./firebase";

export type Team = {
  id: string;
  name: string; // 学校名（例：桜中学校）
  shortName: string; // 略称（例：桜中）
  order: number; // 表示順（小さいほど上）
  active: boolean; // 有効（false = 無効。一覧や判定に使わない）
};

// 最初に登録しておく3校（名簿が空のときだけ自動で入る）
const INITIAL_TEAMS: Team[] = [
  { id: "sakura", name: "桜中学校", shortName: "桜中", order: 1, active: true },
  { id: "asabano", name: "浅羽野中学校", shortName: "浅羽野中", order: 2, active: true },
  { id: "sumiyoshi", name: "住吉中学校", shortName: "住吉中", order: 3, active: true },
];

function db(): Firestore {
  return getFirestore(firebaseApp());
}

function toTeam(id: string, data: Partial<Team>): Team {
  return {
    id,
    name: data.name ?? "",
    shortName: data.shortName || data.name || "",
    order: typeof data.order === "number" ? data.order : 999,
    active: data.active !== false,
  };
}

export async function listTeams(): Promise<Team[]> {
  const snap = await getDocs(collection(db(), "teams"));
  if (snap.empty) {
    // 初めて開いたとき：3校を登録する（同じIDなので、2人同時に開いても重複しない）
    const batch = writeBatch(db());
    for (const t of INITIAL_TEAMS) {
      const { id, ...rest } = t;
      batch.set(doc(db(), "teams", id), {
        ...rest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return INITIAL_TEAMS;
  }
  return snap.docs
    .map((d) => toTeam(d.id, d.data() as Partial<Team>))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ja"));
}

export async function addTeam(t: Omit<Team, "id">): Promise<void> {
  await addDoc(collection(db(), "teams"), {
    name: t.name.trim(),
    shortName: t.shortName.trim() || t.name.trim(),
    order: t.order,
    active: t.active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateTeam(t: Team): Promise<void> {
  await updateDoc(doc(db(), "teams", t.id), {
    name: t.name.trim(),
    shortName: t.shortName.trim() || t.name.trim(),
    order: t.order,
    active: t.active,
    updatedAt: serverTimestamp(),
  });
}

// 2校の表示順を入れ替える
export async function swapOrder(a: Team, b: Team): Promise<void> {
  const batch = writeBatch(db());
  batch.update(doc(db(), "teams", a.id), { order: b.order, updatedAt: serverTimestamp() });
  batch.update(doc(db(), "teams", b.id), { order: a.order, updatedAt: serverTimestamp() });
  await batch.commit();
}
