// 3チームのリーグ戦：スコアから順位を出し、残りの試合の結果しだいで「2日目に進めるか」を文にします。
// 決まり：
//   JJBF埼玉（第47回 選抜大会 要項 10⑨）：勝ち点（勝ち3・引き分け1）→ 失点の少なさ → 得失点差 → 出塁数 → 抽選
//   STORM杯（第13回 要項 12(1)④）：勝ち点（勝ち3・引き分け1・コールド勝ち＋1・完封勝ち＋1）
//                                    → 失点率（失点÷守った回数）→ 得失点差 → 出塁数 → 抽選（じゃんけん）
// どちらも各リーグの1位だけが2日目に進む。

import { parseRef, parseUmp, umpireOf, umpText, type Game } from "./activities";

// 自分たちのチーム名（表や文に出す名前）
export const OUR = "桜・浅羽野・住吉連合";

export type LeagueRule = "jjbf" | "storm";
type Key = "points" | "allowed" | "rate" | "diff" | "onBase" | "lots";

export const LEAGUE_RULES: { key: LeagueRule; label: string; order: Key[]; bonus: boolean }[] = [
  {
    key: "jjbf",
    label: "勝ち点→失点の少なさ→得失点差→出塁数→抽選（JJBF埼玉の要項）",
    order: ["points", "allowed", "diff", "onBase", "lots"],
    bonus: false,
  },
  {
    key: "storm",
    label: "勝ち点（コールド勝ち・完封勝ちは＋1）→失点率→得失点差→出塁数→抽選（STORM杯の要項）",
    order: ["points", "rate", "diff", "onBase", "lots"],
    bonus: true,
  },
];

// この大会のリーグ戦の決まり（JJBF大会・STORM杯だけ。ほかは null＝計算しない）
export function leagueRuleOf(g: { tournamentName: string; type: string }): LeagueRule | null {
  if (g.type !== "公式戦" && g.type !== "大会") return null;
  const n = g.tournamentName.normalize("NFKC");
  if (/jjbf/i.test(n)) return "jjbf";
  if (/storm\s*杯|ストーム杯|山下杯/i.test(n)) return "storm";
  return null;
}

// 結果（点数）を入れて保護者に送れる試合：リーグ戦（JJBF・STORM杯）、トーナメント（新人戦・学総など）、練習試合
export type ResultKind = LeagueRule | "tournament" | "practice";
export function resultKindOf(g: { tournamentName: string; type: string }): ResultKind | null {
  const lr = leagueRuleOf(g);
  if (lr) return lr;
  if (g.type === "練習試合") return "practice";
  if (g.type !== "公式戦" && g.type !== "大会") return null;
  const n = g.tournamentName.normalize("NFKC");
  return /新人|学総|学校総合|総体|中体連/.test(n) ? "tournament" : null;
}

const KEY_WORD: Record<Key, string> = {
  points: "勝ち点",
  allowed: "失点",
  rate: "失点率",
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
  called: boolean; // コールドゲーム
  inn: number; // 試合の回数（ふつう7）
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// 試合の並びから、チーム名を読み替える
// 審判の名前：「第1試合の勝者」は、結果が入っていればチーム名に（まだなら「第1試合の勝者」のまま）
export function umpireName(type: string, games: Game[], i: number): string {
  const u = umpireOf(type, games, i);
  if (!u) return "";
  // 「第1試合の敗者」→ 結果が入っていればチーム名に
  const res = resolveGames(games);
  const name = (t: string) => {
    const r = parseRef(t);
    if (!r) return t;
    const p = res[r.game - 1];
    if (!p || p.a == null || p.b == null || p.sa == null || p.sb == null || p.sa === p.sb) return t;
    return r.win === p.sa > p.sb ? p.a : p.b;
  };
  // 組み合わせ：「第1・第2試合の敗者より1名ずつ、連盟より2名」
  return umpText(parseUmp(u, games, OUR), name);
}

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
      called: g.called === true,
      inn: num(g.inn) ?? 7,
    });
  });
  return out;
}

export type Row = {
  team: string;
  played: number;
  win: number;
  draw: number;
  lose: number;
  points: number;
  runs: number;
  allowed: number;
  diff: number;
  inn: number; // 守った回数
  rate: number; // 失点率（失点÷守った回数）
  onBase: number | null;
};

export function standings(teams: string[], games: LGame[], bonus = false): Row[] {
  const rows = new Map<string, Row>(
    teams.map((t) => [
      t,
      { team: t, played: 0, win: 0, draw: 0, lose: 0, points: 0, runs: 0, allowed: 0, diff: 0, inn: 0, rate: 0, onBase: 0 },
    ]),
  );
  // 勝ったチームのおまけ（STORM杯：コールド勝ち＋1、完封勝ち＋1）
  const extra = (g: LGame, loserRuns: number) => (bonus ? (g.called ? 1 : 0) + (loserRuns === 0 ? 1 : 0) : 0);
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
    A.inn += g.inn;
    B.inn += g.inn;
    if (g.sa > g.sb) {
      A.win++;
      A.points += 3 + extra(g, g.sb);
      B.lose++;
    } else if (g.sa < g.sb) {
      B.win++;
      B.points += 3 + extra(g, g.sa);
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
  for (const r of rows.values()) {
    r.diff = r.runs - r.allowed;
    r.rate = r.inn ? r.allowed / r.inn : 0;
  }
  return [...rows.values()];
}

// 比べる値（大きい方が上）
function valueOf(r: Row, k: Key): number {
  if (k === "points") return r.points;
  if (k === "allowed") return -r.allowed;
  if (k === "rate") return -Math.round(r.rate * 1e6);
  return r.diff;
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
    const val = (r: Row) => valueOf(r, k);
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
    const val = (r: Row) => valueOf(r, k);
    const best = Math.max(...cand.map(val));
    const next = cand.filter((r) => val(r) === best);
    if (next.length === 1 && next[0].team === winner) return KEY_WORD[k];
    cand = next;
  }
  return "";
}

type Res = "yes" | "no" | "onBase" | "lots";
type Case = { x: number; y: number; r: Res; leader?: string; by?: string; called?: boolean };

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
      // 同じ点数でも、コールドかどうかで変わる
      const byCalled = cs.some((c) => cs.some((d) => d.x === c.x && d.y === c.y && d.called !== c.called && d.r !== c.r));
      text = byCalled
        ? "コールド勝ちなら進出（7回まで戦うと敗退）"
        : m <= MAX
          ? `${m}点差以上の${win}なら進出`
          : cs.some((c) => c.r !== "no" && c.r !== "yes")
            ? `並べば${tieWord}`
            : "点数しだい";
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
  const rows = standings(teams, lg, R.bonus).sort((x, y) => {
    for (const k of R.order) {
      if (k === "onBase" || k === "lots") break;
      const d = valueOf(y, k) - valueOf(x, k);
      if (d) return d;
    }
    return 0;
  });
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
        text: `${top.team === OUR ? "1位　2日目に進出" : `${top.team}が1位（${OUR}は敗退）`}${by && by !== "勝ち点" ? `　※${by}の差` : ""}`,
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
      // STORM杯：7点差以上はコールドの場合（5回まで）と、7回まで戦った場合の両方を調べる
      const variants = R.bonus && Math.abs(x - y) >= 7 ? [false, true] : [false];
      for (const called of variants) {
        const sim = lg.map((h, j) => (j === i ? { ...h, sa: x, sb: y, oa: null, ob: null, called, inn: called ? 5 : 7 } : h));
        const rs = standings(teams, sim, R.bonus);
        const top = topOf(rs, R.order);
        let r: Res;
        let leader: string | undefined;
        let by: string | undefined;
        if ("team" in top) {
          r = top.team === OUR ? "yes" : "no";
          leader = top.team;
          by = decidedBy(rs, R.order, top.team);
        } else r = top.teams.includes(OUR) ? (top.tie === "onBase" ? "onBase" : "lots") : "no";
        cases.push({ x, y, r, leader, by, called });
      }
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
    view.next = { title: `第${i + 1}試合（${OUR} 対 ${opp}）で2日目に進むには`, lines };
  } else {
    const aWin = cases.filter((c) => c.x > c.y);
    const draw = cases.filter((c) => c.x === c.y);
    const bWin = cases.filter((c) => c.x < c.y);
    lines.push(summarize(aWin, `${A}が勝てば、${OUR}は　`, (c) => c.y, (c) => c.x - c.y, `${B}の得点`, `${A}の勝ち`));
    lines.push(summarize(draw, `引き分けなら、${OUR}は　`, (c) => c.y, () => 0, "", "引き分け"));
    lines.push(summarize(bWin, `${B}が勝てば、${OUR}は　`, (c) => c.x, (c) => c.y - c.x, `${A}の得点`, `${B}の勝ち`));
    view.next = { title: `第${i + 1}試合（${A} 対 ${B}）の結果で決まります`, lines };
  }
  return view;
}

// ═════ 大会運営：うちが出ないブロック（3チームのリーグ戦）を、どのチームにもかたよらずに見る ═════
export type BlockView = {
  teams: string[];
  rows: Row[];
  ruleLabel: string;
  // 3試合終わったとき：1位（並んだら、何で決まるか）
  final?: { text: string; top?: string };
  // 残り1試合のとき：結果ごとに、どこが1位になるか
  next?: { title: string; lines: string[] };
  waiting?: string;
};

export function blockView(games: Game[], rule: LeagueRule = "jjbf"): BlockView | null {
  const R = LEAGUE_RULES.find((r) => r.key === rule) ?? LEAGUE_RULES[0];
  const lg = resolveGames(games);
  if (lg.length !== 3) return null;
  const names = new Set<string>();
  lg.forEach((g) => {
    if (g.a) names.add(g.a);
    if (g.b) names.add(g.b);
  });
  const teams = [...names];
  const rows = standings(teams, lg, R.bonus).sort((x, y) => {
    for (const k of R.order) {
      if (k === "onBase" || k === "lots") break;
      const d = valueOf(y, k) - valueOf(x, k);
      if (d) return d;
    }
    return 0;
  });
  const view: BlockView = { teams, rows, ruleLabel: R.label };
  const scored = lg.filter((g) => g.sa != null && g.sb != null).length;
  if (scored === 0) {
    view.waiting = "試合が終わったら、スコアを入れてください。";
    return view;
  }
  if (teams.length !== 3 || lg.some((g) => g.a == null || g.b == null)) {
    view.waiting = "前の試合のスコアを入れると、残りの試合の相手が決まります。";
    return view;
  }
  const rest = lg.map((g, i) => ({ g, i })).filter(({ g }) => g.sa == null || g.sb == null);
  const label = (rs: Row[]) => {
    const top = topOf(rs, R.order);
    if ("team" in top) {
      const by = decidedBy(rs, R.order, top.team);
      return { leader: top.team, text: top.team, by: by && by !== "勝ち点" ? `（${by}の差）` : "" };
    }
    return { leader: "", text: `${top.teams.join("・")}が並び、${KEY_WORD[top.tie]}で決まる`, by: "" };
  };
  if (rest.length === 0) {
    const l = label(rows);
    view.final = { text: l.leader ? `1位　${l.text}${l.by}　2日目に進出` : l.text, top: l.leader || undefined };
    return view;
  }
  if (rest.length > 1) {
    view.waiting = `あと${rest.length}試合。最後の1試合になったら、結果ごとの1位を出します。`;
    return view;
  }

  // 残り1試合：点数を全部ためして、どこが1位になるか
  const { g, i } = rest[0];
  const A = g.a!;
  const B = g.b!;
  type C = { x: number; y: number; called: boolean; text: string; by: string };
  const cases: C[] = [];
  for (let x = 0; x <= MAX; x++) {
    for (let y = 0; y <= MAX; y++) {
      const variants = R.bonus && Math.abs(x - y) >= 7 ? [false, true] : [false];
      for (const called of variants) {
        const sim = lg.map((h, j) => (j === i ? { ...h, sa: x, sb: y, oa: null, ob: null, called, inn: called ? 5 : 7 } : h));
        const l = label(standings(teams, sim, R.bonus));
        cases.push({ x, y, called, text: l.text, by: l.by });
      }
    }
  }
  // 勝ち・引き分け・負けごとに、点差（と負けた側の点数）で1位を言いわける
  const describe = (cs: C[], head: string, margin: (c: C) => number, runs: (c: C) => number, runsLabel: string): string => {
    const uniq = (xs: string[]) => [...new Set(xs)];
    const all = uniq(cs.map((c) => c.text));
    if (all.length === 1) {
      if (/で決まる$/.test(all[0])) return `${head}${all[0]}`;
      const bys = uniq(cs.map((c) => c.by));
      return `${head}${all[0]}が1位${bys.length === 1 ? bys[0] : ""}`;
    }
    const say = (t: string) => (/で決まる$/.test(t) ? t : `${t}が1位`);
    // コールドかどうかで変わるか
    const byCalled = cs.some((c) => cs.some((d) => d.x === c.x && d.y === c.y && d.called !== c.called && d.text !== c.text));
    // 点差だけで決まるか
    const ms = uniq(cs.map((c) => String(margin(c)))).map(Number).sort((p, q) => p - q);
    const byMargin = !byCalled && ms.every((m) => uniq(cs.filter((c) => margin(c) === m).map((c) => c.text)).length === 1);
    const segs: { from: number; to: number; text: string }[] = [];
    const push = (v: number, text: string) => {
      const last = segs[segs.length - 1];
      if (last && last.text === text && last.to === v - 1) last.to = v;
      else segs.push({ from: v, to: v, text });
    };
    if (byMargin) {
      ms.forEach((m) => push(m, cs.find((c) => margin(c) === m)!.text));
      const top = ms[ms.length - 1];
      const r = (s: { from: number; to: number }) =>
        s.to === top && s.from !== s.to ? `${s.from}点差以上` : s.from === s.to ? `${s.from}点差` : `${s.from}〜${s.to}点差`;
      return `${head}${segs.map((s) => `${r(s)}：${say(s.text)}`).join("／")}`;
    }
    if (byCalled) {
      const c1 = uniq(cs.filter((c) => c.called).map((c) => c.text));
      const c0 = uniq(cs.filter((c) => !c.called && Math.abs(c.x - c.y) >= 7).map((c) => c.text));
      if (c1.length === 1 && c0.length === 1)
        return `${head}7点差以上でコールドなら ${say(c1[0])}、7回まで戦うと ${say(c0[0])}（ほかの点差は点数しだい）`;
    }
    // 負けた側の点数ごとに、点差で言いわける（同じ言い方が続く点数はまとめる）
    const ys = uniq(cs.map((c) => String(runs(c)))).map(Number).sort((p, q) => p - q);
    const per: { y: number; text: string }[] = ys.map((y) => {
      const sub = cs.filter((c) => runs(c) === y && !c.called);
      const t = uniq(sub.map((c) => c.text));
      if (t.length <= 1) return { y, text: say(t[0] ?? "") };
      const first = sub.find((c) => margin(c) === Math.min(...sub.map(margin)))!.text;
      let m = 1;
      for (; m <= MAX; m++) if (sub.every((c) => (c.text === first) === (margin(c) < m))) break;
      const other = uniq(sub.filter((c) => margin(c) >= m).map((c) => c.text));
      return {
        y,
        text: m <= MAX && other.length === 1 ? `${m}点差以上なら ${say(other[0])}、それより少ないと ${say(first)}` : "点数しだい",
      };
    });
    const groups: { from: number; to: number; text: string }[] = [];
    per.forEach((p) => {
      const last = groups[groups.length - 1];
      if (last && last.text === p.text && last.to === p.y - 1) last.to = p.y;
      else groups.push({ from: p.y, to: p.y, text: p.text });
    });
    const topY = ys[ys.length - 1];
    const rng = (s: { from: number; to: number }) =>
      s.to === topY && s.from !== s.to && s.from > 0
        ? `${runsLabel}${s.from}点以上`
        : s.from === s.to
          ? `${runsLabel}${s.from}点`
          : s.from === 0
            ? `${runsLabel}${s.to}点以内`
            : `${runsLabel}${s.from}〜${s.to}点`;
    return `${head}${groups.map((s) => `${rng(s)}：${s.text}`).join("／")}`;
  };
  const aWin = cases.filter((c) => c.x > c.y);
  const draw = cases.filter((c) => c.x === c.y);
  const bWin = cases.filter((c) => c.x < c.y);
  view.next = {
    title: `第${i + 1}試合（${A} 対 ${B}）の結果で決まります`,
    lines: [
      describe(aWin, `${A}が勝てば　`, (c) => c.x - c.y, (c) => c.y, `${B}の得点`),
      describe(draw, "引き分けなら　", () => 0, (c) => c.x, "両チーム"),
      describe(bWin, `${B}が勝てば　`, (c) => c.y - c.x, (c) => c.x, `${A}の得点`),
    ],
  };
  return view;
}
