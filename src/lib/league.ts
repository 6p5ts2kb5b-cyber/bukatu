// 3チームのリーグ戦：スコアから順位を出し、残りの試合の結果しだいで「2日目に進めるか」を文にします。
// 決まり（JJBF埼玉県 第47回 選抜大会 要項 10⑨）：
//   勝ち点（勝ち3・引き分け1）→ 失点の少ない方 → 得失点差の多い方 → 出塁数の多い方 → 抽選
// 1位だけが2ndステージ（2日目）に進む。

import { parseRef, type Game } from "./activities";

export const OUR = "うち";

export type LeagueRule = "jjbf" | "diff";
type Key = "points" | "allowed" | "diff" | "onBase" | "lots";

export const LEAGUE_RULES: { key: LeagueRule; label: string; order: Key[] }[] = [
  { key: "jjbf", label: "JJBF埼玉（勝ち点→失点の少なさ→得失点差→出塁数→抽選）", order: ["points", "allowed", "diff", "onBase", "lots"] },
  { key: "diff", label: "一般（勝ち点→得失点差→失点の少なさ→抽選）", order: ["points", "diff", "allowed", "lots"] },
];

const KEY_WORD: Record<Key, string> = {
  points: "勝ち点",
  allowed: "失点",
  diff: "得失点差",
  onBase: "出塁数",
  lots: "抽選",
};

// 1試合（チーム名は「第1試合の勝者」などを結果から読み替えたもの。分からなければ null）
export type LGame = {
  a: string | null;
  b: string | null;
  sa: number | null; // a の得点
  sb: number | null;
  oa: number | null; // a の出塁数
  ob: number | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// 試合の並びから、チーム名を読み替える
export function resolveGames(games: Game[]): LGame[] {
  const out: LGame[] = [];
  games.forEach((g) => {
    const name = (t: string): string | null => {
      const r = parseRef(t);
      if (!r) return t.trim() || null;
      const p = out[r.game - 1];
      if (!p || p.a == null || p.b == null || p.sa == null || p.sb == null || p.sa === p.sb) return null;
      const aWin = p.sa > p.sb;
      return r.win === aWin ? p.a : p.b;
    };
    out.push({
      a: g.others ? name(g.home ?? "") : OUR,
      b: name(g.opponent),
      sa: num(g.sh),
      sb: num(g.sa),
      oa: num(g.oh),
      ob: num(g.oa),
    });
  });
  return out;
}

export type Row = { team: string; played: number; win: number; draw: number; lose: number; points: number; runs: number; allowed: number; diff: number; onBase: number | null };

export function standings(teams: string[], games: LGame[]): Row[] {
  const rows = new Map<string, Row>(
    teams.map((t) => [t, { team: t, played: 0, win: 0, draw: 0, lose: 0, points: 0, runs: 0, allowed: 0, diff: 0, onBase: 0 }]),
  );
  for (const g of games) {
    if (g.a == null || g.b == null || g.sa == null || g.sb == null) continue;
    const A = rows.get(g.a);
    const B = rows.get(g.b);
    if (!A || !B) continue;
    A.played++;
    B.played++;
    A.runs += g.sa;
    A.allowed += g.sb;
    B.runs += g.sb;
    B.allowed += g.sa;
    if (g.sa > g.sb) {
      A.win++;
      A.points += 3;
      B.lose++;
    } else if (g.sa < g.sb) {
      B.win++;
      B.points += 3;
      A.lose++;
    } else {
      A.draw++;
      B.draw++;
      A.points++;
      B.points++;
    }
    A.onBase = A.onBase == null || g.oa == null ? null : A.onBase + g.oa;
    B.onBase = B.onBase == null || g.ob == null ? null : B.onBase + g.ob;
  }
  for (const r of rows.values()) r.diff = r.runs - r.allowed;
  return [...rows.values()];
}

// 1位はだれか。決まらなければ「出塁数で決まる」「抽選」を返す
export type Top = { team: string } | { tie: Key; teams: string[] };

export function topOf(rows: Row[], order: Key[]): Top {
  let cand = rows;
  for (const k of order) {
    if (cand.length === 1) break;
    if (k === "lots") return { tie: "lots", teams: cand.map((r) => r.team) };
    if (k === "onBase") {
      if (cand.some((r) => r.onBase == null)) return { tie: "onBase", teams: cand.map((r) => r.team) };
      const best = Math.max(...cand.map((r) => r.onBase!));
      cand = cand.filter((r) => r.onBase === best);
      continue;
    }
    const val = (r: Row) => (k === "points" ? r.points : k === "allowed" ? -r.allowed : r.diff);
    const best = Math.max(...cand.map(val));
    cand = cand.filter((r) => val(r) === best);
  }
  if (cand.length === 1) return { team: cand[0].team };
  return { tie: "lots", teams: cand.map((r) => r.team) };
}

// 1位が決まった「理由」（並んだときに何で差がついたか）
function decidedBy(rows: Row[], order: Key[], winner: string): string {
  let cand = rows;
  for (const k of order) {
    if (k === "lots" || k === "onBase") return KEY_WORD[k];
    const val = (r: Row) => (k === "points" ? r.points : k === "allowed" ? -r.allowed : r.diff);
    const best = Math.max(...cand.map(val));
    const next = cand.filter((r) => val(r) === best);
    if (next.length === 1 && next[0].team === winner) return KEY_WORD[k];
    cand = next;
  }
  return "";
}

type Res = "yes" | "no" | "onBase" | "lots";
type Case = { x: number; y: number; r: Res; leader?: string; by?: string };

export type Scenario = { mark: "◎" | "×" | "△"; text: string };
export type LeagueView = {
  teams: string[];
  rows: Row[];
  ruleLabel: string;
  // 全部終わったとき
  final?: { text: string; ok: boolean | null };
  // 残り1試合のとき
  next?: { title: string; lines: Scenario[] };
  waiting?: string; // まだ計算できない理由
};

const MAX = 12; // 調べる点数の上限

// 1つのグループ（勝ち・引き分け・負け）の結果を、短い文にまとめる
// runsLabel：区切りに使う点数の名前（うちの試合なら「失点」、他チーム同士なら「○○中の得点」）
function summarize(
  cases: Case[],
  head: string,
  runsOf: (c: Case) => number,
  marginOf: (c: Case) => number,
  runsLabel: string,
  win: string, // 点差の言い方（「勝ち」「〇〇中の勝ち」）
): Scenario {
  const yes = cases.filter((c) => c.r === "yes");
  const unsure = cases.filter((c) => c.r === "onBase" || c.r === "lots");
  const tieWord = unsure.some((c) => c.r === "onBase") ? "出塁数" : "抽選";
  if (yes.length === cases.length) return { mark: "◎", text: `${head}進出（点差は関係なし）` };
  if (yes.length === 0 && unsure.length === 0) {
    const leaders = [...new Set(cases.map((c) => c.leader).filter(Boolean))];
    const by = [...new Set(cases.map((c) => c.by).filter(Boolean))];
    return {
      mark: "×",
      text: `${head}敗退${leaders.length === 1 ? `（${leaders[0]}が1位${by.length === 1 && by[0] !== "勝ち点" ? `・${by[0]}の差` : ""}）` : ""}`,
    };
  }
  if (yes.length === 0) return { mark: "△", text: `${head}${tieWord}で決まる（点数によっては敗退）` };

  // 点数（失点など）ごとに、進出・敗退・点差しだい を調べて、続く点数はまとめる
  type Seg = { from: number; to: number; kind: "yes" | "no" | "cond"; text: string };
  const segs: Seg[] = [];
  const ys = [...new Set(cases.map(runsOf))].sort((p, q) => p - q);
  for (const y of ys) {
    const cs = cases.filter((c) => runsOf(c) === y);
    let kind: Seg["kind"];
    let text = "";
    if (cs.every((c) => c.r === "yes")) kind = "yes";
    else if (cs.every((c) => c.r === "no")) kind = "no";
    else {
      kind = "cond";
      let m = 1;
      for (; m <= MAX; m++) if (cs.every((c) => (c.r === "yes") === (marginOf(c) >= m))) break;
      text = m <= MAX ? `${m}点差以上の${win}なら進出` : cs.some((c) => c.r !== "no" && c.r !== "yes") ? `並べば${tieWord}` : "点数しだい";
    }
    const last = segs[segs.length - 1];
    if (last && last.kind === kind && last.text === text && last.to === y - 1) last.to = y;
    else segs.push({ from: y, to: y, kind, text });
  }
  const top = ys[ys.length - 1];
  const range = (s: Seg) =>
    s.to === top && s.from !== s.to && s.from > 0
      ? `${runsLabel}${s.from}点以上`
      : s.from === s.to
        ? `${runsLabel}${s.from}点`
        : s.from === 0
          ? `${runsLabel}${s.to}点以内`
          : `${runsLabel}${s.from}〜${s.to}点`;
  const parts = segs.map((s) => `${range(s)}：${s.kind === "yes" ? "進出" : s.kind === "no" ? "敗退" : s.text}`);
  return { mark: "△", text: `${head}${parts.join("／")}` };
}

export function leagueView(games: Game[], rule: LeagueRule = "jjbf"): LeagueView | null {
  const R = LEAGUE_RULES.find((r) => r.key === rule) ?? LEAGUE_RULES[0];
  const lg = resolveGames(games);
  // 3チーム・3試合のリーグ戦だけ
  if (lg.length !== 3) return null;
  const names = new Set<string>();
  lg.forEach((g) => {
    if (g.a) names.add(g.a);
    if (g.b) names.add(g.b);
  });
  if (!names.has(OUR)) return null;
  const scored = lg.filter((g) => g.sa != null && g.sb != null).length;
  if (scored === 0) return null;
  const teams = [...names];
  const rows = standings(teams, lg).sort((x, y) => y.points - x.points || x.allowed - y.allowed || y.diff - x.diff);
  const view: LeagueView = { teams, rows, ruleLabel: R.label };

  if (teams.length !== 3 || lg.some((g) => g.a == null || g.b == null)) {
    view.waiting = "前の試合のスコアを入れると、残りの試合の相手が決まって計算できます。";
    return view;
  }

  const rest = lg.map((g, i) => ({ g, i })).filter(({ g }) => g.sa == null || g.sb == null);
  if (rest.length === 0) {
    const top = topOf(rows, R.order);
    if ("team" in top) {
      const by = decidedBy(rows, R.order, top.team);
      view.final = {
        ok: top.team === OUR,
        text: `${top.team === OUR ? "1位　2日目に進出" : `${top.team}が1位（うちは敗退）`}${by && by !== "勝ち点" ? `　※${by}の差` : ""}`,
      };
    } else {
      view.final = {
        ok: top.teams.includes(OUR) ? null : false,
        text: `${top.teams.join("・")}が並び、${KEY_WORD[top.tie]}で決まります`,
      };
    }
    return view;
  }
  if (rest.length > 1) {
    view.waiting = `あと${rest.length}試合。1試合ずつスコアを入れると、最後の試合の条件を出します。`;
    return view;
  }

  // 残り1試合：結果を全部ためして、うちが1位になるか
  const { g, i } = rest[0];
  const A = g.a!;
  const B = g.b!;
  const cases: Case[] = [];
  for (let x = 0; x <= MAX; x++) {
    for (let y = 0; y <= MAX; y++) {
      const sim = lg.map((h, j) => (j === i ? { ...h, sa: x, sb: y, oa: null, ob: null } : h));
      const rs = standings(teams, sim);
      const top = topOf(rs, R.order);
      let r: Res;
      let leader: string | undefined;
      let by: string | undefined;
      if ("team" in top) {
        r = top.team === OUR ? "yes" : "no";
        leader = top.team;
        by = decidedBy(rs, R.order, top.team);
      } else r = top.teams.includes(OUR) ? (top.tie === "onBase" ? "onBase" : "lots") : "no";
      cases.push({ x, y, r, leader, by });
    }
  }
  const ours = A === OUR || B === OUR;
  // うちの目線にそろえる（うち＝x）
  const me = (c: Case) => (A === OUR ? { u: c.x, t: c.y } : { u: c.y, t: c.x });
  const lines: Scenario[] = [];
  if (ours) {
    const opp = A === OUR ? B : A;
    const win = cases.filter((c) => me(c).u > me(c).t);
    const draw = cases.filter((c) => me(c).u === me(c).t);
    const lose = cases.filter((c) => me(c).u < me(c).t);
    const allowed = (c: Case) => me(c).t;
    const margin = (c: Case) => me(c).u - me(c).t;
    lines.push(summarize(win, "勝てば　", allowed, margin, "失点", "勝ち"));
    lines.push(summarize(draw, "引き分けは　", allowed, margin, "失点", "引き分け"));
    lines.push(summarize(lose, "負けたら　", allowed, (c) => me(c).t - me(c).u, "失点", "負け"));
    view.next = { title: `第${i + 1}試合（うち 対 ${opp}）で2日目に進むには`, lines };
  } else {
    const aWin = cases.filter((c) => c.x > c.y);
    const draw = cases.filter((c) => c.x === c.y);
    const bWin = cases.filter((c) => c.x < c.y);
    lines.push(summarize(aWin, `${A}が勝てば、うちは　`, (c) => c.y, (c) => c.x - c.y, `${B}の得点`, `${A}の勝ち`));
    lines.push(summarize(draw, "引き分けなら、うちは　", (c) => c.y, () => 0, "", "引き分け"));
    lines.push(summarize(bWin, `${B}が勝てば、うちは　`, (c) => c.x, (c) => c.y - c.x, `${A}の得点`, `${B}の勝ち`));
    view.next = { title: `第${i + 1}試合（${A} 対 ${B}）の結果で決まります`, lines };
  }
  return view;
}
