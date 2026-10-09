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
  // 3チーム以上の日の「他チーム同士」の試合（うちは出ない）。home = 片方のチーム名
  others?: boolean;
  home?: string;
  // 先に書いたチーム（うちの試合なら「うち」、他チーム同士なら「チーム1」）のベンチ。ふつうは1塁
  bench?: "1塁" | "3塁";
  afterLunch?: boolean; // 開始を「昼食後○分後」にする
  lunchMin?: number;
};

// ---- 「第1試合の勝者」のような、まだ決まっていない相手 ----
// 手で「対 1試合目負け」「1試合目勝ち」などと書かれていても、同じ形にそろえる
export function normalizeTeam(t: string): string {
  const s = (t ?? "").replace(/^\s*(対|vs\.?)\s*/i, "").trim();
  const m = s.match(/^第?\s*([0-9０-９]+)\s*試合目?\s*の?\s*(勝ち|勝者|勝|負け|敗者|負|敗)$/);
  if (m) {
    const n = Number(m[1].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
    return `第${n}試合の${/勝/.test(m[2]) ? "勝者" : "敗者"}`;
  }
  return s;
}

export function parseRef(t: string): { game: number; win: boolean } | null {
  const m = normalizeTeam(t).match(/^第(\d+)試合の(勝者|敗者)$/);
  return m ? { game: Number(m[1]), win: m[2] === "勝者" } : null;
}

export function isRef(t: string): boolean {
  return parseRef(t) !== null;
}

// 1つの欄に「富士見 対 入間メッツ」と書かれていたら、2チームに分ける
export function splitVs(t: string): [string, string] | null {
  const parts = (t ?? "").split(/\s*(?:対|vs\.?)\s*/i).map((x) => x.trim());
  if (parts.length === 2 && parts[0] && parts[1]) return [parts[0], parts[1]];
  return null;
}

// 試合の書き方をそろえる（上の2つをまとめて）
export function normalizeGame(x: Game): Game {
  let g = { ...x, home: x.home ?? "", others: x.others === true };
  if (!g.others) {
    const sp = splitVs(g.opponent);
    if (sp) g = { ...g, others: true, home: sp[0], opponent: sp[1] };
  }
  return { ...g, home: normalizeTeam(g.home ?? ""), opponent: normalizeTeam(g.opponent) };
}

// 「第1試合の勝者」→「富士見中と入間METSの勝者」（その試合の2チームが分かるとき）
//   pair = 試合ごとの2チーム（[1塁側, 3塁側] など）
export function describeRef(t: string, pairs: [string, string][]): string | null {
  const r = parseRef(t);
  if (!r) return null;
  const p = pairs[r.game - 1];
  if (!p || !p[0] || !p[1]) return null;
  const name = (x: string) => (isRef(x) ? x.replace(/^第(\d+)試合の/, "第$1試合") : x);
  return `${name(p[0])}と${name(p[1])}の${r.win ? "勝者" : "敗者"}`;
}

// 大会の日程（何日目・決勝など）
export const STAGES = ["1日目", "2日目", "3日目", "準決勝", "決勝", "準決・決勝"];

// 「秋季新人大会 2日目」のような大会の見出し
export function tournamentTitle(g: Pick<ActivityGroup, "tournamentName" | "stage">): string {
  return [g.tournamentName, g.stage].filter(Boolean).join(" ");
}

// ---- 大会の予備日 ----
// 大会・公式戦の予定に「予備日」が入っていると、その日は
//   ・大会が延期になったら → 大会（予備日）
//   ・大会が実施されたら   → その日の予定（休み・練習など）
// になる。予備日の日に、どちらになるかを分かるように出す。
export type ReserveInfo = { activityId: string; date: string; title: string; venue: string; second?: boolean };

export function reservesByDate(list: Activity[]): Map<string, ReserveInfo[]> {
  const map = new Map<string, ReserveInfo[]>();
  for (const a of list) {
    for (const g of a.groups) {
      if (!g.reserveDate) continue;
      const info: ReserveInfo = {
        activityId: a.id,
        date: a.date,
        title: tournamentTitle(g) || g.type,
        venue: g.reserveVenue || g.venue,
      };
      map.set(g.reserveDate, [...(map.get(g.reserveDate) ?? []), info]);
      // 予備日の予備日
      if (g.reserveDate2 && g.reserveDate2 !== g.reserveDate) {
        const second: ReserveInfo = { ...info, venue: g.reserveVenue2 || info.venue, second: true };
        map.set(g.reserveDate2, [...(map.get(g.reserveDate2) ?? []), second]);
      }
    }
  }
  return map;
}

// 予備日だけで、その日に予定が入っていない日の「仮の予定」（一覧・印刷に出すため）
export function reserveOnlyDays(list: Activity[], from: string, to: string): Activity[] {
  const map = reservesByDate(list);
  const out: Activity[] = [];
  map.forEach((infos, date) => {
    if (date < from || date > to) return;
    if (list.some((a) => a.date === date)) return;
    out.push({ id: `reserve-${date}`, date, note: "", groups: [] });
    void infos;
  });
  return out;
}

// 画面・印刷での種類の書き方。「部活なし」「練習なし」は「休養日」と書く
export function typeLabel(type: string): string {
  return type === "部活なし" || type === "練習なし" ? "休養日" : type;
}

// 予備日の日に「大会が実施されたとき」の予定を1行で（休みなら「休養日」）
export function heldPlanText(groups: ActivityGroup[]): string {
  const active = groups.filter((g) => !isOffType(g.type));
  if (!active.length) return "休養日";
  const hm = (t: string) => (t ? `${Number(t.split(":")[0])}:${t.split(":")[1]}` : "");
  return active
    .map((g) =>
      [g.type, g.venue, g.startTime || g.endTime ? `${hm(g.startTime)}〜${hm(g.endTime)}` : ""]
        .filter(Boolean)
        .join("　"),
    )
    .join("／");
}

// ---- 大会しだいの予定（予備日の日に、大会がどうなったかを選ぶ） ----
//   確認中       → 「延期のとき／実施のとき」を両方出す
//   実施される   → この日の予定（休養日・練習）
//   実施されない → この日の予定（休養日・練習）
//   延期         → この日に大会
export type ReserveStatus = "" | "held" | "cancelled" | "postponed";

export function toReserveStatus(v: unknown): ReserveStatus {
  return v === "held" || v === "cancelled" || v === "postponed" ? v : "";
}

export type ReserveView =
  | { mode: "both" }
  | { mode: "plan" | "tournament"; head: string; rest: boolean; reason: string; venue?: string };

export function reserveView(status: ReserveStatus | undefined, reserves: ReserveInfo[], groups: ActivityGroup[]): ReserveView {
  const titles = reserves.map((r) => r.title).join("・");
  if (status === "postponed") {
    const venue = reserves.map((r) => r.venue).filter(Boolean).join("・");
    return { mode: "tournament", head: titles, rest: false, venue, reason: `${titles}が延期になったため、この日に大会を行います。` };
  }
  if (status === "held" || status === "cancelled") {
    const plan = heldPlanText(groups);
    const rest = plan === "休養日";
    const why = status === "held" ? "実施される" : "実施されない";
    return {
      mode: "plan",
      head: plan,
      rest,
      reason: `${titles}が${why}ため、${rest ? "この日の練習はありません" : "この日は練習です"}。`,
    };
  }
  return { mode: "both" };
}

// 「10/12 JJBF大会 1日目」の短い書き方
export function reserveLabel(r: ReserveInfo): string {
  return `${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8))} ${r.title}`;
}

// 「10/12 JJBF 1日目 の予備日」「… の予備日の予備日」
export function reserveTitle(rs: ReserveInfo[]): string {
  return rs.map((r) => `${reserveLabel(r)} の${r.second ? "予備日の予備日" : "予備日"}`).join("・");
}

// ---- 勝ち上がり次第の日 ----
const hmText = (t: string) => (t ? `${Number(t.split(":")[0])}:${t.split(":")[1]}` : "");

// 敗退したときの予定を1行で（「練習　浅羽野中　6:45〜12:00」または「休養日」）
export function losePlanText(g: ActivityGroup): string {
  if (g.ifLose !== "練習") return "休養日";
  const time = g.loseStart || g.loseEnd ? `${hmText(g.loseStart)}〜${hmText(g.loseEnd)}` : "";
  return ["練習", g.loseVenue, time].filter(Boolean).join("　");
}

// 「10月24日（土）に」／日付が未入力なら「前の試合で」
export function advanceDayText(g: Pick<ActivityGroup, "decideDate">): string {
  if (!g.decideDate) return "前の試合で";
  const d = parseDate(g.decideDate);
  return `${d.getMonth() + 1}月${d.getDate()}日（${weekday(g.decideDate)}）に`;
}

export type AdvanceView =
  | { mode: "none" }
  | { mode: "both"; day: string; win: string; lose: string; loseRest: boolean }
  | { mode: "lose"; head: string; rest: boolean; reason: string };

export function advanceView(g: ActivityGroup): AdvanceView {
  if (!isMatchType(g.type) || !g.ifLose || g.advance === "win") return { mode: "none" };
  const title = tournamentTitle(g) || g.type;
  const lose = losePlanText(g);
  const rest = g.ifLose !== "練習";
  const day = advanceDayText(g);
  if (g.advance === "lose")
    return {
      mode: "lose",
      head: lose,
      rest,
      reason: `${day}${g.tournamentName || "大会"}で敗退したため、${rest ? "この日の練習はありません" : "この日は練習です"}。`,
    };
  return { mode: "both", day, win: title, lose, loseRest: rest };
}

// 試合の開始の書き方（「9:00」または「昼食後40分後」）
export function gameStart(x: Game): string {
  if (x.afterLunch) return `昼食後${x.lunchMin || 40}分後`;
  return x.startTime;
}

// うちが出ない試合（他チーム同士）か
export function isOthersGame(x: Game): boolean {
  return x.others === true;
}

// 試合の表示名：「坂戸中」または「坂戸中 対 鶴ヶ島中」
export function gameLabel(x: Game): string {
  if (isOthersGame(x)) return `${normalizeTeam(x.home ?? "") || "未定"} 対 ${normalizeTeam(x.opponent) || "未定"}`;
  return normalizeTeam(x.opponent);
}

// うちの対戦相手だけ（重なりは1つに）
export function ourOpponents(games: Game[]): string[] {
  return [...new Set(games.filter((x) => !isOthersGame(x)).map((x) => normalizeTeam(x.opponent)).filter(Boolean))];
}

// 試合がある種別
export function isMatchType(type: string): boolean {
  return type === "練習試合" || type === "公式戦" || type === "大会";
}

export type ActivityGroup = {
  division: DivisionKey;
  type: ActivityType;
  tournamentName: string; // 大会名（公式戦・大会のとき）
  stage: string; // 大会の何日目か（1日目・2日目・3日目・準決勝・決勝・準決・決勝）
  venue: string; // 会場
  venueAddress: string; // 会場の住所
  venueStation: string; // 最寄駅（駅からの時間も）
  reserveDate: string; // 予備日（試合のとき）
  reserveVenue: string; // 予備日の会場（ちがう場合）
  reserveVenueAddress: string;
  reserveVenueStation: string;
  reserveDate2: string; // 予備日の予備日
  reserveVenue2: string; // 予備日の予備日の会場（ちがう場合）
  // 勝ち上がり次第の日（大会の2日目など）。ifLose が "" なら使わない
  ifLose: "" | "練習" | "休養日"; // 敗退したときの予定
  decideDate: string; // どの日の試合の結果で決まるか（例：1日目の日付）
  loseVenue: string; // 敗退→練習のときの会場
  loseStart: string;
  loseEnd: string;
  advance: "" | "win" | "lose"; // 結果（"" = 確認中）
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
  // この日がほかの大会の予備日のとき、その大会がどうなったか（"" = 確認中）
  reserveStatus?: ReserveStatus;
};

export function newGroup(division: DivisionKey, date = ""): ActivityGroup {
  return {
    division,
    type: date && !isWeekend(date) ? "部活あり" : "練習",
    tournamentName: "",
    stage: "",
    venue: "",
    venueAddress: "",
    venueStation: "",
    reserveDate: "",
    reserveVenue: "",
    reserveVenueAddress: "",
    reserveVenueStation: "",
    reserveDate2: "",
    reserveVenue2: "",
    ifLose: "",
    decideDate: "",
    loseVenue: "",
    loseStart: "",
    loseEnd: "",
    advance: "",
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
    reserveStatus: toReserveStatus(data.reserveStatus),
    groups: groups.map((g) => ({
      ...newGroup((g.division as DivisionKey) ?? "main"),
      ...g,
      packing: Array.isArray(g.packing) ? g.packing : [],
      games: Array.isArray(g.games)
        ? g.games.map((x) =>
            normalizeGame({
              opponent: String(x.opponent ?? ""),
              startTime: String(x.startTime ?? ""),
              home: String(x.home ?? ""),
              others: x.others === true,
              bench: x.bench === "3塁" ? "3塁" : "1塁",
              afterLunch: x.afterLunch === true,
              lunchMin: Number(x.lunchMin) || 40,
            }),
          )
        : [],
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
  tournaments: string[];
}> {
  const snap = await getDocs(query(collection(db(), "activities"), orderBy("date", "desc")));
  const venues = new Set<string>();
  const meetPlaces = new Set<string>();
  const opponents = new Set<string>();
  const tournaments = new Set<string>();
  snap.docs.forEach((d) => {
    const groups = (d.data().groups ?? []) as Partial<ActivityGroup>[];
    groups.forEach((g) => {
      if (g.venue) venues.add(g.venue);
      if (g.meetPlace) meetPlaces.add(g.meetPlace);
      if (g.tournamentName) tournaments.add(g.tournamentName.trim());
      (g.games ?? []).forEach((x) => {
        if (x.opponent) opponents.add(x.opponent);
        if (x.home) opponents.add(x.home);
      });
      (g.partners ?? []).forEach((x) => x && opponents.add(x));
    });
  });
  return {
    venues: [...venues].slice(0, 30),
    meetPlaces: [...meetPlaces].slice(0, 30),
    opponents: [...opponents].slice(0, 50),
    tournaments: [...tournaments].slice(0, 12),
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
  if (isMatchType(g.type) && ourOpponents(g.games).length === 0) out.push("対戦相手");
  if (g.type === "合同練習" && g.partners.length === 0) out.push("合同練習の相手");
  if (!g.venue) out.push("会場");
  if (!g.meetTime && !g.meetPlace) out.push("集合");
  return out;
}
