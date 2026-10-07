// ホーム画面の「ランプ」（緑・黄・赤）を決める部品です。
// 状態はデータベースに保存せず、予定の中身から毎回計算します（ズレを防ぐため）。
//   ok   = 緑：決まっている
//   warn = 黄：確認中・まだの物がある
//   ng   = 赤：決まっていない・足りない
//   none = 対象外（消灯）

import {
  divisionLabel,
  gameStart,
  isMatchType,
  isOffType,
  isRef,
  normalizeTeam,
  type Activity,
  type ActivityGroup,
  type DivisionKey,
} from "./activities";

export type Level = "ok" | "warn" | "ng" | "none";
export type CheckItem = { key: string; label: string; level: Level; text: string };
export type Cell = { label: string; value: string }; // 時刻のマス目（value が空なら赤い「—」）

// 平日の「部活あり」（再登校なし）や「部活なし」「練習なし」は、準備するものがない日
export function isQuiet(g: ActivityGroup): boolean {
  return isOffType(g.type) || (g.type === "部活あり" && !g.returnToSchool);
}

function clock(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${Number(h)}:${m}`;
}

// 時刻のマス目：集合 → 試合（または開始・終了）
export function cellsOf(g: ActivityGroup): Cell[] {
  if (isQuiet(g)) return [];
  if (g.type === "部活あり") return [{ label: "再登校", value: clock(g.returnTime) }];
  const cells: Cell[] = [{ label: "集合", value: clock(g.meetTime) }];
  if (isMatchType(g.type) && g.games.length) {
    g.games.forEach((x, i) =>
      cells.push({ label: `第${i + 1}試合`, value: x.afterLunch ? `昼+${x.lunchMin || 40}` : clock(x.startTime) }),
    );
  } else {
    cells.push({ label: "開始", value: clock(g.startTime) }, { label: "終了", value: clock(g.endTime) });
  }
  return cells;
}

// 1つの予定（区分）について、決める必要がある項目ごとのランプ
//   noticeDone = この予定の送付書を作ったか（試合のときだけ使う）
export function checkGroup(g: ActivityGroup, noticeDone: boolean): CheckItem[] {
  if (isQuiet(g)) return [];
  const items: CheckItem[] = [];

  // 会場
  items.push(
    g.venue
      ? { key: "venue", label: "会場", level: "ok", text: g.venue }
      : { key: "venue", label: "会場", level: "ng", text: "未定" },
  );

  // 集合（時刻はマス目に出すので、ここは場所）
  if (g.type !== "部活あり") {
    if (!g.meetTime) items.push({ key: "meet", label: "集合", level: "ng", text: "時間が未定" });
    else if (!g.meetPlace) items.push({ key: "meet", label: "集合", level: "warn", text: "場所が未定" });
    else items.push({ key: "meet", label: "集合", level: "ok", text: g.meetPlace });
  }

  // 対戦相手・試合
  if (isMatchType(g.type)) {
    const games = g.games;
    if (!games.length) items.push({ key: "games", label: "対戦相手", level: "ng", text: "未定" });
    else {
      const missing = games.filter((x) => !normalizeTeam(x.opponent) || (x.others && !normalizeTeam(x.home ?? ""))).length;
      const noTime = games.filter((x) => !gameStart(x)).length;
      const real = [
        ...new Set(
          games.filter((x) => !x.others).map((x) => normalizeTeam(x.opponent)).filter((t) => t && !isRef(t)),
        ),
      ];
      if (missing) items.push({ key: "games", label: "対戦相手", level: "ng", text: `${missing}試合 未定` });
      else if (noTime) items.push({ key: "games", label: "対戦相手", level: "warn", text: `${noTime}試合 時刻未定` });
      else
        items.push({
          key: "games",
          label: "対戦相手",
          level: "ok",
          text: real.length ? `${real.slice(0, 2).join("・")}${real.length > 2 ? " ほか" : ""}（${games.length}試合）` : `${games.length}試合`,
        });
    }
  }

  // 合同練習の相手
  if (g.type === "合同練習") {
    items.push(
      g.partners.length
        ? { key: "partners", label: "合同相手", level: "ok", text: g.partners.join("・") }
        : { key: "partners", label: "合同相手", level: "ng", text: "未定" },
    );
  }

  // 持ち物
  items.push(
    g.packing.length
      ? { key: "packing", label: "持ち物", level: "ok", text: `${g.packing.length}点` }
      : { key: "packing", label: "持ち物", level: "warn", text: "未設定" },
  );

  // 送付書（試合のとき）
  if (isMatchType(g.type)) {
    items.push(
      noticeDone
        ? { key: "notice", label: "送付書", level: "ok", text: "作成済み" }
        : { key: "notice", label: "送付書", level: "warn", text: "未作成" },
    );
  }
  return items;
}

// 一番悪い状態
export function worstLevel(items: { level: Level }[]): Level {
  if (items.some((i) => i.level === "ng")) return "ng";
  if (items.some((i) => i.level === "warn")) return "warn";
  if (items.some((i) => i.level === "ok")) return "ok";
  return "none";
}

// 「準備OK」「確認中 2」「未確定 1」
export function stateText(items: CheckItem[]): string {
  const ng = items.filter((i) => i.level === "ng").length;
  const warn = items.filter((i) => i.level === "warn").length;
  if (ng) return `未確定 ${ng}`;
  if (warn) return `確認中 ${warn}`;
  return "準備OK";
}

export type Unit = {
  division: DivisionKey;
  name: string;
  group: ActivityGroup;
  checks: CheckItem[];
  cells: Cell[];
  level: Level;
};

export function unitsOf(a: Activity, noticeFor: (a: Activity) => boolean): Unit[] {
  return a.groups.map((g) => {
    const checks = checkGroup(g, noticeFor(a));
    return {
      division: g.division,
      name: divisionLabel(g.division),
      group: g,
      checks,
      cells: cellsOf(g),
      level: worstLevel(checks),
    };
  });
}

export type Issue = { date: string; activityId: string; division: DivisionKey; name: string; item: CheckItem };

// 要確認：ng と warn だけ。日付の近い順・同じ日は赤を先に
export function collectIssues(list: Activity[], noticeFor: (a: Activity) => boolean): Issue[] {
  const out: Issue[] = [];
  for (const a of list) {
    for (const u of unitsOf(a, noticeFor)) {
      for (const item of u.checks) {
        if (item.level === "ng" || item.level === "warn")
          out.push({ date: a.date, activityId: a.id, division: u.division, name: u.name, item });
      }
    }
  }
  return out.sort((x, y) =>
    x.date !== y.date ? (x.date < y.date ? -1 : 1) : (x.item.level === "ng" ? 0 : 1) - (y.item.level === "ng" ? 0 : 1),
  );
}
