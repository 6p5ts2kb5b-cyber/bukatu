// 試す用の偽のサーバー（GASの外のブラウザで画面を確かめるときだけ使う）。
// ?mock=staff / ?mock=ops / ?mock=denied / ?mock=nologin / ?mock=fail で状態を切り替えます。
import { setMockServer, type BootResult, type WriteOp } from "./shim/gas";

const KEY = "bukatu-mock-db";
type DB = Record<string, Record<string, Record<string, unknown>>>;

function load(): DB {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return JSON.parse(s);
  } catch {
    /* 空から */
  }
  const db: DB = {};
  const put = (col: string, id: string, d: Record<string, unknown>) => ((db[col] ??= {})[id] = d);
  put("teams", "sakura", { name: "桜中学校", shortName: "桜中", order: 1, active: true });
  put("teams", "asabano", { name: "浅羽野中学校", shortName: "浅羽野中", order: 2, active: true });
  put("teams", "sumiyoshi", { name: "住吉中学校", shortName: "住吉中", order: 3, active: true });
  put("staff", "owner@gmail.com", { email: "owner@gmail.com", name: "玉城 義将", canCoach: true, canUmpire: true, canPlateUmpire: true, canBaseUmpire: true, phone: "090-1234-5678", note: "持ち主", active: true });
  put("staff", "tanaka@gmail.com", { email: "tanaka@gmail.com", name: "田中 太郎", canCoach: true, canUmpire: false, canPlateUmpire: false, canBaseUmpire: false, phone: "", note: "土曜のみ参加", active: true });
  ["軽食", "お弁当", "水筒", "着替え", "筆記用具", "メモ帳", "野球note", "半袖", "短パン", "ユニフォーム", "グローブ", "スパイク", "帽子", "防寒着", "雨具"].forEach((n, i) =>
    put("packingItems", `item${String(i + 1).padStart(2, "0")}`, { name: n, order: i + 1, active: true }),
  );
  return db;
}
function save(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* なにもしない */
  }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function installMock() {
  const mode = new URLSearchParams(window.location.search).get("mock") || "staff";
  setMockServer({
    async boot(): Promise<BootResult> {
      await wait(600);
      const url = "https://script.google.com/macros/s/EXAMPLE/exec";
      if (mode === "nologin") return { state: "nologin", url };
      if (mode === "denied") return { state: "denied", email: "someone@gmail.com", url };
      const db = load();
      const data: Record<string, Record<string, unknown>[]> = {};
      for (const [col, m] of Object.entries(db)) data[col] = Object.entries(m).map(([id, d]) => ({ ...d, id }));
      if (mode === "ops")
        return { state: "ops", name: "大会 太郎", email: "ops@gmail.com", data: { opsTournaments: data.opsTournaments ?? [] }, url, version: "mock", now: Date.now() };
      return { state: "staff", me: { ...(db.staff["owner@gmail.com"] as object), email: "owner@gmail.com" }, data, url, owner: "owner@gmail.com", version: "mock", now: Date.now() };
    },
    async write(ops: WriteOp[]) {
      await wait(500);
      if (mode === "fail") throw new Error("電波がありません（試し）");
      const db = load();
      const warnings: string[] = [];
      for (const op of ops) {
        if (op.doc) (db[op.col] ??= {})[op.id] = op.doc;
        else delete db[op.col]?.[op.id];
      }
      save(db);
      return { ok: true, warnings, now: Date.now() };
    },
  });
}
