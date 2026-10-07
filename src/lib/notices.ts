// 大会の連絡（送付書）を Firestore の「notices」に保存する部品です。
// 相手チーム・自チームに送る「送付書」を、前回の内容を引き継いで手早く作れるようにします。

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { firebaseApp } from "./firebase";
import { todayString, type Activity } from "./activities";

export const OUR_TEAM = "桜・浅羽野・住吉連合";

// 試合（第1試合・第2試合…）。first = 1塁ベンチ、third = 3塁ベンチ
export type NoticeGame = {
  first: string;
  third: string;
  time: string; // "09:00"
  timeNote: "開始" | "予定";
  plate: string; // 主審
  base: string; // 塁審
};

export type Notice = {
  id: string;
  issueDate: string; // 発信日 YYYY-MM-DD
  sheets: string; // 送信枚数（本票を含め）
  to: string; // 送付先
  fromOrg: string; // 発信元（学校・チーム）
  fromRole: string; // 役職（例：部活動指導員）
  fromName: string; // 氏名
  fromAddress: string; // 住所
  fromPhone: string; // 携帯
  fromTel: string; // 電話・FAX
  subject: string; // 件名（大会名）
  body: string; // 本文
  date: string; // 期日
  reserveDate: string; // 予備日
  venue: string;
  venueAddress: string;
  reserveVenue: string;
  reserveVenueAddress: string;
  games: NoticeGame[];
  rain: string; // 雨天判定（例：6:00 住吉中 池田 090-…）
  contact: string; // 問い合わせ先
  notes: string; // 連絡事項（1行に1つ）
};

export type NoticeDraft = Omit<Notice, "id">;

export const DEFAULT_NOTES = [
  "駐車場が広くありませんので、乗り合いでお願いします。",
  "送信が届きましたら、ショートメールでチーム名・お名前を送信してください。",
  "学校に問い合わせ頂いても不在が多いため、何かありましたら下記の連絡先までお願いします。",
].join("\n");

export function defaultBody(): string {
  return [
    "お世話になっております。標記の件につきまして送信させて頂きました。",
    "下記の日程で、よろしくお願いいたします。",
    "尚、予備日でのご都合が悪い場合は、ご連絡を下さい。",
  ].join("\n");
}

export function emptyGame(): NoticeGame {
  return { first: "", third: "", time: "", timeNote: "予定", plate: "", base: "" };
}

export function blankNotice(): NoticeDraft {
  return {
    issueDate: todayString(),
    sheets: "1",
    to: "",
    fromOrg: OUR_TEAM,
    fromRole: "",
    fromName: "",
    fromAddress: "",
    fromPhone: "",
    fromTel: "",
    subject: "",
    body: defaultBody(),
    date: "",
    reserveDate: "",
    venue: "",
    venueAddress: "",
    reserveVenue: "",
    reserveVenueAddress: "",
    games: [{ ...emptyGame(), timeNote: "開始" }],
    rain: "",
    contact: "",
    notes: DEFAULT_NOTES,
  };
}

// 前回の送付書から、毎回同じになる部分（発信元・連絡事項など）を引き継ぐ
export function fromPrevious(prev: Notice | null): NoticeDraft {
  const b = blankNotice();
  if (!prev) return b;
  return {
    ...b,
    fromOrg: prev.fromOrg,
    fromRole: prev.fromRole,
    fromName: prev.fromName,
    fromAddress: prev.fromAddress,
    fromPhone: prev.fromPhone,
    fromTel: prev.fromTel,
    body: prev.body || b.body,
    rain: prev.rain,
    contact: prev.contact,
    notes: prev.notes,
  };
}

// 予定（試合の日）から、件名・期日・会場・試合順を入れる
export function applyActivity(n: NoticeDraft, a: Activity): NoticeDraft {
  const g = a.groups.find((x) => x.games.length > 0 || x.tournamentName) ?? a.groups[0];
  if (!g) return n;
  const games: NoticeGame[] = g.games.map((x, i) => ({
    first: x.others ? x.home ?? "" : OUR_TEAM,
    third: x.opponent,
    time: x.startTime,
    timeNote: i === 0 ? "開始" : "予定",
    plate: "",
    base: "",
  }));
  const teams = [
    ...new Set(
      g.games.flatMap((x) => [x.others ? x.home ?? "" : "", x.opponent]).filter((t) => t && t !== OUR_TEAM),
    ),
  ];
  return {
    ...n,
    subject: g.tournamentName || (g.type === "練習試合" ? "練習試合" : n.subject),
    date: a.date,
    venue: g.venue || n.venue,
    games: games.length ? games : n.games,
    to: n.to || (teams.length ? `${teams.join("・")}　代表者` : ""),
  };
}

// ---- 日付の書き方（令和） ----
const WD = ["日", "月", "火", "水", "木", "金", "土"];
export function reiwa(date: string, withYear = true): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const wd = WD[new Date(y, m - 1, d).getDay()];
  return `${withYear ? `令和${y - 2018}年` : ""}${m}月${d}日（${wd}）`;
}

// ---- 読み書き ----
function db(): Firestore {
  return getFirestore(firebaseApp());
}

function toNotice(id: string, x: Record<string, unknown>): Notice {
  const b = blankNotice();
  const s = (k: keyof NoticeDraft) => (x[k] === undefined ? (b[k] as string) : String(x[k] ?? ""));
  return {
    id,
    issueDate: s("issueDate"),
    sheets: s("sheets"),
    to: s("to"),
    fromOrg: s("fromOrg"),
    fromRole: s("fromRole"),
    fromName: s("fromName"),
    fromAddress: s("fromAddress"),
    fromPhone: s("fromPhone"),
    fromTel: s("fromTel"),
    subject: s("subject"),
    body: s("body"),
    date: s("date"),
    reserveDate: s("reserveDate"),
    venue: s("venue"),
    venueAddress: s("venueAddress"),
    reserveVenue: s("reserveVenue"),
    reserveVenueAddress: s("reserveVenueAddress"),
    games: Array.isArray(x.games)
      ? (x.games as Partial<NoticeGame>[]).map((g) => ({
          ...emptyGame(),
          ...g,
          timeNote: g.timeNote === "開始" ? "開始" : "予定",
        }))
      : [],
    rain: s("rain"),
    contact: s("contact"),
    notes: s("notes"),
  };
}

export async function listNotices(): Promise<Notice[]> {
  const snap = await getDocs(query(collection(db(), "notices"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => toNotice(d.id, d.data()));
}

export async function latestNotice(): Promise<Notice | null> {
  const snap = await getDocs(query(collection(db(), "notices"), orderBy("createdAt", "desc"), limit(1)));
  return snap.empty ? null : toNotice(snap.docs[0].id, snap.docs[0].data());
}

export async function getNotice(id: string): Promise<Notice | null> {
  const snap = await getDoc(doc(db(), "notices", id));
  return snap.exists() ? toNotice(snap.id, snap.data()) : null;
}

export async function createNotice(n: NoticeDraft): Promise<string> {
  const ref = await addDoc(collection(db(), "notices"), {
    ...n,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function saveNotice(n: Notice): Promise<void> {
  const { id, ...rest } = n;
  await updateDoc(doc(db(), "notices", id), { ...rest, updatedAt: serverTimestamp() });
}

export async function deleteNotice(id: string): Promise<void> {
  await deleteDoc(doc(db(), "notices", id));
}
