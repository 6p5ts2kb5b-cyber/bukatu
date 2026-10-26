// サーバー側（Code.gs）を、偽のスプレッドシートで動かして確かめる（node test/server.test.mjs）
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

function fakeSheet(name) {
  const data = [];
  const sh = {
    name, data,
    getName: () => name,
    getLastRow: () => data.length,
    getMaxRows: () => Math.max(1000, data.length),
    setFrozenRows() {}, setColumnWidth() {},
    getRange(r, c, nr = 1, nc = 1) {
      const rg = {
        setValues(v) { for (let i = 0; i < nr; i++) { data[r - 1 + i] ??= []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = v[i][j]; } return rg; },
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((data[r - 1 + i] ?? [])[c - 1 + j] ?? ""); out.push(row); } return out; },
        setNumberFormat() { return rg; }, setNumberFormats() { return rg; },
        setFontWeight() { return rg; }, setBackground() { return rg; }, setFontColor() { return rg; },
        createTextFinder(t) {
          let caseOn = false;
          const f = { matchEntireCell() { return f; }, matchCase(v) { caseOn = v; return f; },
            findNext() { for (let i = 0; i < nr; i++) { const v = String((data[r - 1 + i] ?? [])[c - 1] ?? ""); if (caseOn ? v === t : v.toLowerCase() === t.toLowerCase()) return { getRow: () => r + i }; } return null; } };
          return f;
        },
      };
      return rg;
    },
    deleteRow(r) { data.splice(r - 1, 1); },
  };
  return sh;
}
const files = {};
function fakeSs(id, name) {
  const sheets = [fakeSheet("シート1")];
  const editors = new Set();
  const ss = {
    id, name, sheets, editors,
    getId: () => id,
    getSheetByName: (n) => sheets.find((s) => s.name === n) ?? null,
    getSheets: () => sheets,
    insertSheet(n) { const s = fakeSheet(n); sheets.push(s); return s; },
    deleteSheet(s) { sheets.splice(sheets.indexOf(s), 1); },
    addEditor(e) { if (!e.includes("@")) throw new Error("bad"); editors.add(e); },
    removeEditor(e) { editors.delete(e); },
  };
  files[id] = ss;
  return ss;
}
const active = fakeSs("MAIN", "部活アプリ");
let user = "owner@gmail.com";
let accessible = (id, who) => who === "owner@gmail.com" || files[id].editors.has(who);
const props = {};
const cache = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, put: (k, v) => m.set(k, v), getAll: (ks) => Object.fromEntries(ks.map((k) => [k, m.get(k)])), putAll: (o) => Object.entries(o).forEach(([k, v]) => m.set(k, v)) }; };
const scriptCache = cache();
const userCaches = {};
let n = 0;
const ctx = {
  SpreadsheetApp: {
    getActiveSpreadsheet: () => active,
    create: (name) => fakeSs("NEW" + ++n, name),
    openById: (id) => { if (!files[id] || !accessible(id, user)) throw new Error("権限がありません"); return files[id]; },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => (props[k] = v), getProperties: () => props }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => user }), getActiveUser: () => ({ getEmail: () => user }) },
  CacheService: { getScriptCache: () => scriptCache, getUserCache: () => (userCaches[user] ??= cache()) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ScriptApp: { getService: () => ({ getUrl: () => "https://script.google.com/macros/s/X/exec" }) },
  Logger: { log: () => {} },
  Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
  HtmlService: {},
  Date, JSON, Math, String, Number, Object, Array, Error,
};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../server/Code.gs", import.meta.url), "utf8"), ctx);

// 1. setup
assert.equal(ctx.setup(), "準備ができました");
assert.equal(props.SHEET_ID, "MAIN");
assert.ok(props.OPS_SHEET_ID);
assert.equal(props.OWNER_EMAIL, "owner@gmail.com");
assert.ok(!active.getSheetByName("シート1"), "シート1は消える");
assert.equal(active.getSheetByName("学校").data.length, 4);
assert.equal(active.getSheetByName("持ち物").data.length, 16);
assert.equal(active.getSheetByName("名簿").data.length, 4);
assert.equal(active.getSheetByName("スタッフ").data.length, 2);
ctx.setup(); // 2回目でも増えない
assert.equal(active.getSheetByName("学校").data.length, 4);

// 2. 持ち主で開く
let b = ctx.boot();
assert.equal(b.state, "staff");
assert.equal(b.data.teams.length, 3);
assert.equal(b.data.packingItems[0].name, "軽食");
assert.equal(b.data.staff[0].email, "owner@gmail.com");

// 3. 予定を保存（JSON）・読み直し
const act = { date: "2026-11-03", note: "", reserveStatus: "", groups: [{ division: "main", type: "練習", games: [{ opponent: "坂戸中", sh: 3, sa: null }] }], updatedAt: { __ts: 1761400000000 } };
ctx.write([{ col: "activities", id: "AbC123", doc: act }]);
b = ctx.boot();
assert.equal(b.data.activities.length, 1);
assert.deepEqual(b.data.activities[0].groups[0].games[0], { opponent: "坂戸中", sh: 3, sa: null });
assert.equal(b.data.activities[0].updatedAt.__ts, 1761400000000);
assert.equal(b.data.activities[0].id, "AbC123");
// 同じIDで上書き（行は増えない）、大文字小文字ちがいのIDは別の行
ctx.write([{ col: "activities", id: "AbC123", doc: { ...act, note: "雨天中止" } }]);
ctx.write([{ col: "activities", id: "abc123", doc: { ...act, date: "2026-11-04" } }]);
b = ctx.boot();
assert.equal(b.data.activities.length, 2);
assert.equal(b.data.activities.find((a) => a.id === "AbC123").note, "雨天中止");
// 消す
ctx.write([{ col: "activities", id: "abc123", doc: null }]);
assert.equal(ctx.boot().data.activities.length, 1);

// 4. 選手（数・文字）
ctx.write([{ col: "players", id: "p1", doc: { name: "石野", kana: "", teamId: "sakura", grade: 2, number: "01", active: true } }]);
const p1 = ctx.boot().data.players[0];
assert.equal(p1.number, "01");
assert.equal(p1.grade, 2);
assert.equal(p1.active, true);

// 5. 名簿にない人は入れない
user = "stranger@gmail.com";
assert.equal(ctx.boot().state, "denied");
assert.throws(() => ctx.write([{ col: "activities", id: "x", doc: act }]));

// 6. スタッフを足すと共有される → 入れる。無効にすると外れる
user = "owner@gmail.com";
ctx.write([{ col: "staff", id: "tanaka@gmail.com", doc: { email: "tanaka@gmail.com", name: "田中", canCoach: true, active: true } }]);
assert.ok(files.MAIN.editors.has("tanaka@gmail.com"));
assert.ok(files[props.OPS_SHEET_ID].editors.has("tanaka@gmail.com"));
user = "tanaka@gmail.com";
b = ctx.boot();
assert.equal(b.state, "staff");
assert.equal(b.me.name, "田中");
user = "owner@gmail.com";
ctx.write([{ col: "staff", id: "tanaka@gmail.com", doc: { email: "tanaka@gmail.com", name: "田中", active: false } }]);
assert.ok(!files.MAIN.editors.has("tanaka@gmail.com"));
user = "tanaka@gmail.com";
assert.equal(ctx.boot().state, "denied");

// 7. 大会運営だけの人
user = "owner@gmail.com";
ctx.write([{ col: "opsStaff", id: "ops@gmail.com", doc: { email: "ops@gmail.com", name: "大会 太郎", active: true } }]);
assert.ok(!files.MAIN.editors.has("ops@gmail.com"));
assert.ok(files[props.OPS_SHEET_ID].editors.has("ops@gmail.com"));
ctx.write([{ col: "opsTournaments", id: "t1", doc: { name: "STORM杯 1日目", rule: "storm", date: "2026-11-08", blocks: [] } }]);
user = "ops@gmail.com";
b = ctx.boot();
assert.equal(b.state, "ops");
assert.deepEqual(Object.keys(b.data), ["opsTournaments"]);
assert.equal(b.data.opsTournaments[0].name, "STORM杯 1日目");
ctx.write([{ col: "opsTournaments", id: "t1", doc: { name: "STORM杯 1日目（直し）", rule: "storm", date: "2026-11-08", blocks: [] } }]);
assert.throws(() => ctx.write([{ col: "players", id: "x", doc: { name: "x" } }]), /大会運営だけ|保存できません|権限/);

// 8. 持ち主以外は setup できない
user = "tanaka@gmail.com";
assert.throws(() => ctx.setup(), /持ち主/);

console.log("サーバーの確かめ：すべて合格");
