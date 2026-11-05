// 生徒の動静表（長期休業：春休み・夏休み・冬休み）を読み書きする部品です。
//
// doseiTerms   = 動静表（休みごと）。スタッフが作る
//   kind     = spring ／ summer ／ winter
//   title    = 名前（例：2026年 冬休み）
//   start・end = 期間 "YYYY-MM-DD"
//   message  = 全体への連絡（記入ページの上に出る）
//   members  = 記入できる選手（作ったときの選手名簿の写し：氏名・背番号・学校・学年）
//   days     = 日ごとの予定（作ったときのアプリの予定の写し。例「練習 9:00〜12:00」）
//   open     = 受付中（false なら記入ページは見るだけ）
//
// doseiEntries = 保護者・生徒が送った内容（1家庭1件。IDは推測できない長い文字＝修正用URL）
//   ※ ログインなしで「IDを知っている人だけ」読める・直せる。一覧（全件）はスタッフだけ
//
// doseiNotes   = 先生の記入欄（ID：動静表ID_選手ID）。スタッフだけ

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
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { firebaseApp } from "./firebase";
import { msOf } from "./activities";

export type DoseiKind = "spring" | "summer" | "winter";
export const KIND_LABEL: Record<DoseiKind, string> = { spring: "春休み", summer: "夏休み", winter: "冬休み" };

export type DoseiMember = { id: string; name: string; number: string; school: string; grade: number };
export type DoseiDay = { date: string; plan: string };

export type DoseiTerm = {
  id: string;
  kind: DoseiKind;
  title: string;
  start: string;
  end: string;
  message: string;
  members: DoseiMember[];
  days: DoseiDay[];
  open: boolean;
};
export type DoseiTermDraft = Omit<DoseiTerm, "id">;

// 出欠：空欄は出席
export type DayStatus = "" | "欠" | "遅" | "早" | "他";
export const STATUS_LABEL: Record<Exclude<DayStatus, "">, string> = { 欠: "欠席", 遅: "遅刻", 早: "早退", 他: "その他" };
export type DayEntry = { s: DayStatus; time?: string; reason?: string };

export type Contact = { who: string; tel: string };

export type DoseiEntry = {
  id: string;
  termId: string;
  memberId: string;
  name: string;
  writer: "本人" | "保護者";
  parentName: string;
  contacts: Contact[];
  days: Record<string, DayEntry>;
  trip: string; // 帰省・旅行（行き先・期間）
  health: string; // 体調・けがのこと
  updatedMs?: number;
};

export type DoseiNote = { note: string; checked: boolean };

function db(): Firestore {
  return getFirestore(firebaseApp());
}

const str = (v: unknown, max = 500) => String(v ?? "").slice(0, max);

// ---- 日付 ----

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 期間の日付（start〜end。最大70日）
export function datesBetween(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const [y, m, d] = start.split("-").map(Number);
  const cur = new Date(y, m - 1, d);
  const out: string[] = [];
  while (out.length < 70) {
    const s = ymd(cur);
    if (s > end) break;
    out.push(s);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// 休みの種類から、だいたいの期間（あとで直せる）。今日から見て次に来る休み
export function defaultPeriod(kind: DoseiKind, today = new Date()): { start: string; end: string; title: string } {
  const y = today.getFullYear();
  const mo = today.getMonth() + 1;
  if (kind === "winter") {
    const yy = mo >= 2 && mo <= 12 ? y : y - 1; // 1月なら去年の冬休み
    return { start: `${yy}-12-25`, end: `${yy + 1}-01-07`, title: `${yy}年度 冬休み` };
  }
  if (kind === "spring") {
    const yy = mo <= 4 ? y : y + 1;
    return { start: `${yy}-03-25`, end: `${yy}-04-06`, title: `${yy - 1}年度 春休み` };
  }
  const yy = mo <= 8 ? y : y + 1;
  return { start: `${yy}-07-21`, end: `${yy}-08-31`, title: `${yy}年度 夏休み` };
}

// ---- 動静表（スタッフ） ----

function toTerm(id: string, x: Record<string, unknown>): DoseiTerm {
  const kind = x.kind === "spring" || x.kind === "summer" ? x.kind : "winter";
  return {
    id,
    kind,
    title: str(x.title, 100),
    start: str(x.start, 10),
    end: str(x.end, 10),
    message: str(x.message, 2000),
    members: Array.isArray(x.members)
      ? (x.members as Record<string, unknown>[]).map((m) => ({
          id: str(m.id, 60),
          name: str(m.name, 60),
          number: str(m.number, 10),
          school: str(m.school, 30),
          grade: Number(m.grade) || 1,
        }))
      : [],
    days: Array.isArray(x.days)
      ? (x.days as Record<string, unknown>[]).map((d) => ({ date: str(d.date, 10), plan: str(d.plan, 60) }))
      : [],
    open: x.open !== false,
  };
}

export async function listTerms(): Promise<DoseiTerm[]> {
  const snap = await getDocs(query(collection(db(), "doseiTerms"), orderBy("start", "desc")));
  return snap.docs.map((d) => toTerm(d.id, d.data()));
}

// 記入ページ（ログインなし）からも読む
export async function getTerm(id: string): Promise<DoseiTerm | null> {
  const snap = await getDoc(doc(db(), "doseiTerms", id));
  return snap.exists() ? toTerm(snap.id, snap.data()) : null;
}

export async function createTerm(t: DoseiTermDraft): Promise<string> {
  const ref = await addDoc(collection(db(), "doseiTerms"), { ...t, createdAt: serverTimestamp() });
  return ref.id;
}

export async function saveTerm(t: DoseiTerm): Promise<void> {
  const { id, ...rest } = t;
  await updateDoc(doc(db(), "doseiTerms", id), { ...rest, updatedAt: serverTimestamp() });
}

export async function deleteTerm(id: string): Promise<void> {
  await deleteDoc(doc(db(), "doseiTerms", id));
}

// ---- 記入（保護者・生徒） ----

function toEntry(id: string, x: Record<string, unknown>): DoseiEntry {
  const days: Record<string, DayEntry> = {};
  const raw = (x.days ?? {}) as Record<string, Record<string, unknown>>;
  for (const [k, v] of Object.entries(raw)) {
    const s = v?.s;
    if (s === "欠" || s === "遅" || s === "早" || s === "他")
      days[k] = { s, ...(v.time ? { time: str(v.time, 5) } : {}), ...(v.reason ? { reason: str(v.reason, 200) } : {}) };
  }
  return {
    id,
    termId: str(x.termId, 60),
    memberId: str(x.memberId, 60),
    name: str(x.name, 60),
    writer: x.writer === "本人" ? "本人" : "保護者",
    parentName: str(x.parentName, 60),
    contacts: Array.isArray(x.contacts)
      ? (x.contacts as Record<string, unknown>[]).slice(0, 2).map((c) => ({ who: str(c.who, 20), tel: str(c.tel, 20) }))
      : [],
    days,
    trip: str(x.trip, 500),
    health: str(x.health, 500),
    updatedMs: msOf(x.updatedAt),
  };
}

// 推測できない長いID（修正用URLになる）
export function newEntryId(): string {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

export async function getEntry(id: string): Promise<DoseiEntry | null> {
  const snap = await getDoc(doc(db(), "doseiEntries", id));
  return snap.exists() ? toEntry(snap.id, snap.data()) : null;
}

// 送る（はじめて・直すときも同じ）。空の項目は入れない
export async function saveEntry(e: DoseiEntry, isNew: boolean): Promise<void> {
  const days: Record<string, DayEntry> = {};
  for (const [k, v] of Object.entries(e.days)) {
    if (!v.s) continue;
    days[k] = { s: v.s, ...(v.time && (v.s === "遅" || v.s === "早") ? { time: v.time } : {}), ...(v.reason ? { reason: v.reason } : {}) };
  }
  const data = {
    termId: e.termId,
    memberId: e.memberId,
    name: e.name,
    writer: e.writer,
    parentName: e.parentName.trim(),
    contacts: e.contacts.filter((c) => c.tel.trim()).map((c) => ({ who: c.who.trim(), tel: c.tel.trim() })),
    days,
    trip: e.trip.trim(),
    health: e.health.trim(),
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp() } : {}),
  };
  await setDoc(doc(db(), "doseiEntries", e.id), data, { merge: !isNew });
}

// この動静表に届いた記入（スタッフ）
export async function listEntries(termId: string): Promise<DoseiEntry[]> {
  const snap = await getDocs(query(collection(db(), "doseiEntries"), where("termId", "==", termId)));
  return snap.docs.map((d) => toEntry(d.id, d.data()));
}

export async function deleteEntry(id: string): Promise<void> {
  await deleteDoc(doc(db(), "doseiEntries", id));
}

// ---- 先生の記入欄（スタッフ） ----

export async function listNotes(termId: string): Promise<Record<string, DoseiNote>> {
  const snap = await getDocs(query(collection(db(), "doseiNotes"), where("termId", "==", termId)));
  const out: Record<string, DoseiNote> = {};
  snap.docs.forEach((d) => {
    const x = d.data();
    out[str(x.memberId, 60)] = { note: str(x.note, 1000), checked: x.checked === true };
  });
  return out;
}

export async function saveNote(termId: string, memberId: string, n: DoseiNote): Promise<void> {
  await setDoc(doc(db(), "doseiNotes", `${termId}_${memberId}`), {
    termId,
    memberId,
    note: n.note,
    checked: n.checked,
    updatedAt: serverTimestamp(),
  });
}

// ---- 一覧の計算 ----

// 選手ごとの最新の記入（同じ選手に2件あれば新しい方。count は件数）
export function latestByMember(entries: DoseiEntry[]): Map<string, DoseiEntry & { count: number }> {
  const m = new Map<string, DoseiEntry & { count: number }>();
  for (const e of entries) {
    const cur = m.get(e.memberId);
    if (!cur || (e.updatedMs ?? 0) > (cur.updatedMs ?? 0)) m.set(e.memberId, { ...e, count: (cur?.count ?? 0) + 1 });
    else cur.count += 1;
  }
  return m;
}

// 表のマスに出す文字（出席は空欄）
export function cellText(d?: DayEntry): string {
  if (!d || !d.s) return "";
  return d.time && (d.s === "遅" || d.s === "早") ? `${d.s}${d.time}` : d.s;
}

// 電話番号のかんたんな形のチェック（数字とハイフン 10〜13けた）
export function telOk(t: string): boolean {
  const n = t.replace(/[\s-‐－ー]/g, "").normalize("NFKC");
  return /^0\d{9,10}$/.test(n);
}
