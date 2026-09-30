// 活動予定（Firestoreの「activities」コレクション）を読み書きする部品です。
//
// activities = 活動日の基本情報（1日分の箱）
//   date   = 日付（"2026-10-10" の形）
//   note   = 備考
//   groups = その日の区分ごとの予定（連合チーム、または トップ／アカデミー）
//            会場・試合・集合・移動・指導者・審判・持ち物は、後のSTEPでこの中に追加していきます。

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
  where,
  type Firestore,
} from "firebase/firestore";
import { firebaseApp } from "./firebase";

// ---- 区分（連合チーム／トップ／アカデミー） ----

export type DivisionKey = "main" | "top" | "academy";

export const DIVISIONS: { key: DivisionKey; label: string }[] = [
  { key: "main", label: "連合チーム" },
  { key: "top", label: "トップ" },
  { key: "academy", label: "アカデミー" },
];

export function divisionLabel(key: DivisionKey): string {
  return DIVISIONS.find((d) => d.key === key)?.label ?? key;
}

// 12〜4月はトップとアカデミー、5〜11月は連合チーム
export function defaultDivisions(date: string): DivisionKey[] {
  const month = Number(date.slice(5, 7));
  return month >= 12 || month <= 4 ? ["top", "academy"] : ["main"];
}

// ---- 活動種別 ----

export const ACTIVITY_TYPES = ["練習", "練習試合", "公式戦", "大会", "合同練習", "その他"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// ---- データの形 ----

export type ActivityGroup = {
  division: DivisionKey;
  type: ActivityType;
  tournamentName: string; // 大会名（公式戦・大会のとき）
  note: string; // この区分の備考
};

export type Activity = {
  id: string;
  date: string; // "YYYY-MM-DD"
  note: string;
  groups: ActivityGroup[];
};

export function newGroup(division: DivisionKey): ActivityGroup {
  return { division, type: "練習", tournamentName: "", note: "" };
}

// ---- 日付の表示 ----

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function weekday(date: string): string {
  return WEEKDAYS[parseDate(date).getDay()];
}

// "10/10（土）" の形
export function formatDate(date: string): string {
  const d = parseDate(date);
  return `${d.getMonth() + 1}/${d.getDate()}（${weekday(date)}）`;
}

// "2026年10月10日（土）" の形
export function formatDateLong(date: string): string {
  const d = parseDate(date);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekday(date)}）`;
}

export function todayString(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// 土曜は青、日曜は赤で表示するための色
export function weekdayColor(date: string): string {
  const w = parseDate(date).getDay();
  if (w === 0) return "text-ng";
  if (w === 6) return "text-[#1d4ed8]";
  return "";
}

// ---- 読み書き ----

function db(): Firestore {
  return getFirestore(firebaseApp());
}

function toActivity(id: string, data: Record<string, unknown>): Activity {
  const groups = Array.isArray(data.groups) ? (data.groups as Partial<ActivityGroup>[]) : [];
  return {
    id,
    date: String(data.date ?? ""),
    note: String(data.note ?? ""),
    groups: groups.map((g) => ({
      ...newGroup((g.division as DivisionKey) ?? "main"),
      ...g,
    })) as ActivityGroup[],
  };
}

// 今日以降の活動（日付の早い順）
export async function listUpcoming(): Promise<Activity[]> {
  const q = query(
    collection(db(), "activities"),
    where("date", ">=", todayString()),
    orderBy("date"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toActivity(d.id, d.data()));
}

// 過去の活動（新しい順）
export async function listPast(): Promise<Activity[]> {
  const q = query(
    collection(db(), "activities"),
    where("date", "<", todayString()),
    orderBy("date", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toActivity(d.id, d.data()));
}

export async function getActivity(id: string): Promise<Activity | null> {
  const snap = await getDoc(doc(db(), "activities", id));
  return snap.exists() ? toActivity(snap.id, snap.data()) : null;
}

export async function createActivity(a: Omit<Activity, "id">): Promise<string> {
  const ref = await addDoc(collection(db(), "activities"), {
    ...a,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function saveActivity(a: Activity): Promise<void> {
  const { id, ...rest } = a;
  await updateDoc(doc(db(), "activities", id), { ...rest, updatedAt: serverTimestamp() });
}

export async function deleteActivity(id: string): Promise<void> {
  await deleteDoc(doc(db(), "activities", id));
}
