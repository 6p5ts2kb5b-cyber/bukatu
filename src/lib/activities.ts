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

export type DivisionKey =
  | "main"
  | "top"
  | "academy"
  | "sakura"
  | "sumiyoshi"
  | "asabano_sumiyoshi";

export const DIVISIONS: { key: DivisionKey; label: string }[] = [
  { key: "main", label: "連合チーム" },
  { key: "top", label: "トップ" },
  { key: "academy", label: "アカデミー" },
  { key: "sakura", label: "桜のみ" },
  { key: "sumiyoshi", label: "住吉のみ" },
  { key: "asabano_sumiyoshi", label: "浅羽野・住吉" },
];

export function divisionLabel(key: DivisionKey): string {
  return DIVISIONS.find((d) => d.key === key)?.label ?? key;
}

// 12〜4月はトップとアカデミー、5〜11月は連合チーム
// 平日（月〜金）は「住吉のみ」、土日は月によって連合チーム／トップ・アカデミー
export function defaultDivisions(date: string): DivisionKey[] {
  if (date && !isWeekend(date)) return ["sumiyoshi"];
  const month = Number(date.slice(5, 7));
  return month >= 12 || month <= 4 ? ["top", "academy"] : ["main"];
}

// ---- 活動種別 ----

export const ACTIVITY_TYPES = [
  "部活あり",
  "部活なし",
  "練習",
  "練習試合",
  "公式戦",
  "大会",
  "合同練習",
  "練習なし",
  "その他",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// 活動しない日（会場・時間などの欄を出さない）
export function isOffType(type: string): boolean {
  return type === "練習なし" || type === "部活なし";
}

// 平日の簡単入力（部活あり／なし＋再登校）
export function isSimpleType(type: string): boolean {
  return type === "部活あり" || type === "部活なし";
}

// ---- データの形 ----

// 試合（第1試合・第2試合…）
export type Game = {
  opponent: string; // 対戦相手（例：坂戸中）
  startTime: string; // 試合開始 "09:00"
};

// 試合がある種別
export function isMatchType(type: string): boolean {
  return type === "練習試合" || type === "公式戦" || type === "大会";
}

export type ActivityGroup = {
  division: DivisionKey;
  type: ActivityType;
  tournamentName: string; // 大会名（公式戦・大会のとき）
  venue: string; // 会場
  startTime: string; // 開始時間 "09:00"
  endTime: string; // 終了時間 "12:00"
  meetTime: string; // 集合時間 "08:30"
  meetPlace: string; // 集合場所（例：若葉駅、現地）
  packing: string[]; // 持ち物（選んだものだけ）
  returnToSchool: boolean; // 再登校あり（平日の部活ありのとき）
  returnTime: string; // 再登校の時間 "14:00"
  games: Game[]; // 試合（練習試合・公式戦・大会のとき）
  partners: string[]; // 合同練習の相手（合同練習のとき）
  note: string; // この区分の備考
};

export type Activity = {
  id: string;
  date: string; // "YYYY-MM-DD"
  note: string;
  groups: ActivityGroup[];
};

export function newGroup(division: DivisionKey, date = ""): ActivityGroup {
  return {
    division,
    type: date && !isWeekend(date) ? "部活あり" : "練習",
    tournamentName: "",
    venue: "",
    startTime: "",
    endTime: "",
    meetTime: "",
    meetPlace: "",
    packing: [],
    returnToSchool: false,
    returnTime: "",
    games: [],
    partners: [],
    note: "",
  };
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
      packing: Array.isArray(g.packing) ? g.packing : [],
      games: Array.isArray(g.games) ? g.games : [],
      returnToSchool: g.returnToSchool === true,
      partners: Array.isArray(g.partners) ? g.partners : [],
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

// 指定した期間の活動（日付の早い順）。from・to は "YYYY-MM-DD"
export async function listRange(from: string, to: string): Promise<Activity[]> {
  const q = query(
    collection(db(), "activities"),
    where("date", ">=", from),
    where("date", "<=", to),
    orderBy("date"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toActivity(d.id, d.data()));
}

// 土曜・日曜かどうか
export function isWeekend(date: string): boolean {
  const w = parseDate(date).getDay();
  return w === 0 || w === 6;
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

// 過去に入力した会場・集合場所・相手チーム（入力欄の候補に使う）
export async function recentPlaces(): Promise<{
  venues: string[];
  meetPlaces: string[];
  opponents: string[];
}> {
  const snap = await getDocs(query(collection(db(), "activities"), orderBy("date", "desc")));
  const venues = new Set<string>();
  const meetPlaces = new Set<string>();
  const opponents = new Set<string>();
  snap.docs.forEach((d) => {
    const groups = (d.data().groups ?? []) as Partial<ActivityGroup>[];
    groups.forEach((g) => {
      if (g.venue) venues.add(g.venue);
      if (g.meetPlace) meetPlaces.add(g.meetPlace);
      (g.games ?? []).forEach((x) => x.opponent && opponents.add(x.opponent));
      (g.partners ?? []).forEach((x) => x && opponents.add(x));
    });
  });
  return {
    venues: [...venues].slice(0, 30),
    meetPlaces: [...meetPlaces].slice(0, 30),
    opponents: [...opponents].slice(0, 50),
  };
}

// まだ決まっていない項目（ホームの「要確認」に使う）
export function missingFields(g: ActivityGroup): string[] {
  if (isOffType(g.type)) return [];
  if (g.type === "部活あり") {
    if (!g.returnToSchool) return [];
    return [!g.returnTime && "再登校の時間", !g.venue && "会場"].filter(Boolean) as string[];
  }
  const out: string[] = [];
  if (isMatchType(g.type) && !g.games.some((x) => x.opponent)) out.push("対戦相手");
  if (g.type === "合同練習" && g.partners.length === 0) out.push("合同練習の相手");
  if (!g.venue) out.push("会場");
  if (!g.meetTime && !g.meetPlace) out.push("集合");
  return out;
}
