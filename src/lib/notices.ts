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
import { describeRef, isRef, normalizeTeam, todayString, type Activity } from "./activities";
import { findVenue } from "./directory";

export const OUR_TEAM = "桜・浅羽野・住吉連合";

// 試合（第1試合・第2試合…）。first = 1塁ベンチ、third = 3塁ベンチ
export type NoticeGame = {
  first: string;
  third: string;
  time: string; // "09:00"
  timeNote: "開始" | "予定";
  plate: string; // 主審
  base: string; // 塁審
  afterLunch?: boolean; // 時刻の代わりに「昼食後○分後」
  lunchMin?: number; // 昼食後の分（ふつう40）
};

// 試合の時刻の書き方（「9:00」または「昼食後40分後」）
export function gameTimeText(g: NoticeGame): string {
  if (g.afterLunch) return `昼食後${g.lunchMin || 40}分後`;
  if (!g.time) return "";
  const [h, m] = g.time.split(":");
  return `${Number(h)}:${m}`;
}

// 送付書の種類
export type NoticeKind = "tournament" | "practice2" | "practice3";
export const NOTICE_KINDS: { key: NoticeKind; label: string; short: string }[] = [
  { key: "tournament", label: "大会", short: "大会" },
  { key: "practice2", label: "練習試合（2チーム）", short: "練習試合・2チーム" },
  { key: "practice3", label: "練習試合（3チーム）", short: "練習試合・3チーム" },
];

export type Notice = {
  id: string;
  kind: NoticeKind;
  activityId: string; // 読み込んだ予定
  teams: string[]; // この日のチーム（ボタンで選べるように）
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
  venueStation: string; // 最寄駅
  reserveVenue: string;
  reserveVenueAddress: string;
  reserveVenueStation: string;
  games: NoticeGame[];
  rain: string; // 雨天判定（例：6:00 住吉中 池田 090-…）
  contact: string; // 問い合わせ先
  notes: string; // 連絡事項（1行に1つ）
  // ---- 保護者へのLINE文で使う ----
  mapUrl: string; // 地図のURL
  groundIn: string; // グラウンドイン "07:30"
  parking: string; // 駐車場の案内
  parentGreeting: string; // あいさつ
  parentNote: string; // そのほかの連絡
  packing: string; // 持ち物（予定から。「・」区切り）
  meet: string; // 生徒の集合（予定から。例：7:10　若葉駅）
};

export type NoticeDraft = Omit<Notice, "id">;

export const DEFAULT_NOTES = "駐車場が広くありませんので、乗り合いでお願いします。";

export function defaultBody(): string {
  return [
    "お世話になっております。標記の件につきまして送信させて頂きました。",
    "下記の日程で、よろしくお願いいたします。",
  ].join("\n");
}

export function emptyGame(): NoticeGame {
  return { first: "", third: "", time: "", timeNote: "予定", plate: "", base: "" };
}

export function blankNotice(): NoticeDraft {
  return {
    kind: "tournament",
    activityId: "",
    teams: [OUR_TEAM],
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
    venueStation: "",
    reserveVenue: "",
    reserveVenueAddress: "",
    reserveVenueStation: "",
    games: [{ ...emptyGame(), timeNote: "開始" }],
    rain: "",
    contact: "",
    notes: DEFAULT_NOTES,
    mapUrl: "",
    groundIn: "",
    parking: "",
    parentGreeting: "お疲れ様です。",
    parentNote: "",
    packing: "",
    meet: "",
  };
}

// 練習試合のひな形（試合順と審判）。休みのチームが審判をする
//   2チーム：うち 対 相手 → 相手 対 うち
//   3チーム：うち 対 A（審判 B）→ A 対 B（審判 うち）→ B 対 うち（審判 A）
export function practiceGames(kind: NoticeKind, a: string, b: string): NoticeGame[] {
  const A = a || "相手チーム1";
  const B = b || "相手チーム2";
  const g = (first: string, third: string, time: string, ump: string, i: number): NoticeGame => ({
    first,
    third,
    time,
    timeNote: i === 0 ? "開始" : "予定",
    plate: ump,
    base: ump,
  });
  if (kind === "practice2") {
    return [g(OUR_TEAM, A, "09:00", "両チームより", 0), g(A, OUR_TEAM, "11:00", "両チームより", 1)];
  }
  return [g(OUR_TEAM, A, "09:00", B, 0), g(A, B, "11:00", OUR_TEAM, 1), g(B, OUR_TEAM, "13:30", A, 2)];
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
    parking: prev.parking,
    parentGreeting: prev.parentGreeting || b.parentGreeting,
  };
}

// 予定の対戦相手（うちの相手を先に）
export function activityOpponents(a: Activity): string[] {
  const g = a.groups.find((x) => x.games.length > 0) ?? a.groups[0];
  if (!g) return [];
  return [
    ...new Set(
      g.games
        .flatMap((x) => [x.others ? normalizeTeam(x.home ?? "") : "", normalizeTeam(x.opponent)])
        .filter((t) => t && t !== OUR_TEAM && !isPlaceholderTeam(t)),
    ),
  ];
}

// 勝者・敗者のような「チーム名でない」もの
export function isPlaceholderTeam(t: string): boolean {
  return isRef(t) || /勝者|敗者|勝ち|負け|対/.test(t);
}

// 試合のチーム名を、読む人に分かる形に（「第1試合の勝者」→「富士見中と入間METSの勝者」）
export function teamText(t: string, games: NoticeGame[]): string {
  return describeRef(t, games.map((g) => [g.first, g.third] as [string, string])) ?? t;
}

// 審判をひな形で入れる
//   3チーム：その試合に出ていないチーム／2チーム：両チームより
export function fillUmpires(kind: NoticeKind, games: NoticeGame[], teams: string[]): NoticeGame[] {
  if (kind === "tournament") return games;
  return games.map((g) => {
    if (g.plate || g.base) return g;
    let ump = "両チームより";
    if (kind === "practice3") {
      // 「第1試合の勝者」などが入った試合は、休みのチームが決まらないので空けておく
      if (isPlaceholderTeam(g.first) || isPlaceholderTeam(g.third)) return g;
      const rest = teams.filter((t) => t !== g.first && t !== g.third);
      if (rest.length === 1) ump = rest[0];
    }
    return { ...g, plate: ump, base: ump };
  });
}

// 予定（試合の日）から、件名・期日・会場・相手チーム・試合順・審判を入れる
export function applyActivity(n: NoticeDraft, a: Activity): NoticeDraft {
  const g = a.groups.find((x) => x.games.length > 0 || x.tournamentName) ?? a.groups[0];
  if (!g) return n;
  const opponents = activityOpponents(a);
  const teams = [OUR_TEAM, ...opponents];
  // 種類：練習試合なら相手の数で 2チーム／3チーム
  const kind: NoticeKind =
    g.type === "練習試合" ? (opponents.length >= 2 ? "practice3" : "practice2") : n.kind === "tournament" ? "tournament" : n.kind;
  let games: NoticeGame[] = g.games.map((x, i) => ({
    first: x.others ? normalizeTeam(x.home ?? "") : OUR_TEAM,
    third: normalizeTeam(x.opponent),
    time: x.startTime,
    timeNote: i === 0 ? "開始" : "予定",
    plate: "",
    base: "",
  }));
  if (!games.length && kind !== "tournament") games = practiceGames(kind, opponents[0] ?? "", opponents[1] ?? "");
  games = fillUmpires(kind, games, teams);
  return {
    ...n,
    kind,
    activityId: a.id,
    teams,
    // 持ち物は予定から（お弁当・水筒など）
    packing: g.packing.join("・"),
    meet: meetText(g.meetTime, g.meetPlace),
    subject: g.tournamentName || (g.type === "練習試合" ? "練習試合" : n.subject),
    date: a.date,
    venue: g.venue || n.venue,
    // 3校の会場なら、住所と最寄駅も入れる
    ...(() => {
      const v = findVenue(g.venue || n.venue, []);
      return v ? { venue: v.name, venueAddress: v.number, venueStation: v.extra ?? "" } : {};
    })(),
    games: games.length ? games : n.games,
    to: opponents.length ? `${opponents.join("・")}　代表者` : n.to,
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
  const kind = x.kind === "practice2" || x.kind === "practice3" ? x.kind : "tournament";
  return {
    id,
    kind,
    activityId: String(x.activityId ?? ""),
    teams: Array.isArray(x.teams) ? (x.teams as string[]) : [OUR_TEAM],
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
    venueStation: s("venueStation"),
    reserveVenue: s("reserveVenue"),
    reserveVenueAddress: s("reserveVenueAddress"),
    reserveVenueStation: s("reserveVenueStation"),
    games: Array.isArray(x.games)
      ? (x.games as Partial<NoticeGame>[]).map((g) => ({
          ...emptyGame(),
          ...g,
          timeNote: g.timeNote === "開始" ? "開始" : "予定",
          afterLunch: g.afterLunch === true,
          lunchMin: Number(g.lunchMin) || 40,
        }))
      : [],
    rain: s("rain"),
    contact: s("contact"),
    notes: s("notes"),
    mapUrl: s("mapUrl"),
    groundIn: s("groundIn"),
    parking: s("parking"),
    parentGreeting: s("parentGreeting"),
    parentNote: s("parentNote"),
    packing: s("packing"),
    meet: s("meet"),
  };
}

// ---- 保護者に送るLINEの文 ----
function shortDate(date: string): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return `${m}.${d}（${WD[new Date(y, m - 1, d).getDay()]}）`;
}
function clock(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${Number(h)}:${m}`;
}

export function parentMessage(n: NoticeDraft): string {
  const out: string[] = [];
  if (n.parentGreeting.trim()) out.push(n.parentGreeting.trim(), "");
  const what = n.kind === "tournament" && n.subject ? `${n.subject}　` : n.kind !== "tournament" ? "練習試合　" : "";
  if (n.date) {
    out.push(`${shortDate(n.date)}${what}よろしくお願いします。`);
    // 予備日は上の方に（会場がちがえば、その会場も）
    if (n.reserveDate) {
      out.push(`予備日　${shortDate(n.reserveDate)}`);
      if (n.reserveVenue) out.push(`予備日の会場　${n.reserveVenue}`);
    }
    out.push("");
  }
  if (n.venue) {
    out.push(`✅会場　${n.venue}`);
    if (n.venueStation) out.push(`最寄駅　${n.venueStation}`);
    if (n.parking.trim()) out.push(n.parking.trim());
    out.push("");
  }
  if (n.mapUrl.trim()) out.push(n.mapUrl.trim(), "");
  if (n.meet.trim()) out.push(`集合　${n.meet.trim()}`, "");
  // グラウンドインは相手チーム向け（送付書に載せる）。保護者の文には入れない
  const games = n.games.filter((g) => g.first || g.third);
  if (games.length) {
    out.push("試合順は");
    games.forEach((g, i) => {
      const ump = g.plate ? `　球審　${teamText(g.plate, games)}` : "";
      out.push(`${i + 1}試合目　${teamText(g.first, games) || "未定"}　対　${teamText(g.third, games) || "未定"}`);
      out.push(`${g.afterLunch ? `${gameTimeText(g)}開始` : g.time ? `${clock(g.time)}〜` : "時間未定"}${ump}`);
      if (i < games.length - 1) out.push("");
    });
    out.push("");
  }
  if (n.packing.trim()) out.push(`持ち物　${n.packing.trim()}`, "");
  if (n.parentNote.trim()) out.push(n.parentNote.trim(), "");
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join("\n");
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

// 携帯番号を「090-1234-5678」の形に
export function formatPhone(v: string): string {
  const d = v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, "");
  if (/^0[789]0\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return v.trim();
}

// 生徒の集合（予定の集合時間と場所から）「7:10　若葉駅」
export function meetText(time: string, place: string): string {
  const t = time ? `${Number(time.split(":")[0])}:${time.split(":")[1]}` : "";
  return [t, place].filter(Boolean).join("　");
}
