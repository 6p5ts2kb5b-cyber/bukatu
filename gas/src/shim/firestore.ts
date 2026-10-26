// "firebase/firestore" の代わり（GAS版）。
// いまのアプリのデータの読み書きのコード（src/lib/*.ts）を、そのまま使えるようにするための部品です。
//
//  ・開いたときにサーバーからまとめて読み込んだデータを、画面の中（メモリ）に持っておく
//  ・読むのはメモリから（すぐ返る）
//  ・保存は、メモリを先に変えて（画面はすぐ変わる）、うしろでサーバーに送る（楽観的な保存）
//  ・送れなかったら、赤い帯と「もう一度保存」を出す（SaveBar）

/* eslint-disable @typescript-eslint/no-explicit-any */
import { server, type WriteOp } from "./gas";

// ───── 時刻（Firestore の Timestamp の代わり） ─────
export class Timestamp {
  constructor(public ms: number) {}
  toMillis() {
    return this.ms;
  }
  toDate() {
    return new Date(this.ms);
  }
  get seconds() {
    return Math.floor(this.ms / 1000);
  }
  static now() {
    return new Timestamp(Date.now());
  }
}
const TS = { __serverTimestamp: true };
export function serverTimestamp(): any {
  return TS;
}

// サーバーとやりとりする形（{__ts: ms}）との変換
export function revive(v: any): any {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === "object") {
    if (typeof v.__ts === "number" && Object.keys(v).length === 1) return new Timestamp(v.__ts);
    if (v instanceof Timestamp) return v;
    const o: any = {};
    for (const k of Object.keys(v)) o[k] = revive(v[k]);
    return o;
  }
  return v;
}
export function encode(v: any): any {
  if (v instanceof Timestamp) return { __ts: v.ms };
  if (v === TS) return { __ts: Date.now() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === "object") {
    const o: any = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = encode(v[k]);
    return o;
  }
  return v;
}
function resolveTs(v: any): any {
  if (v === TS) return Timestamp.now();
  if (v instanceof Timestamp) return v;
  if (Array.isArray(v)) return v.map(resolveTs);
  if (v && typeof v === "object") {
    const o: any = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = resolveTs(v[k]);
    return o;
  }
  return v;
}
function clone(v: any): any {
  return revive(encode(v));
}

// ───── データの置き場所（メモリ） ─────
const store = new Map<string, Map<string, any>>();
const ID_KEY: Record<string, string> = { staff: "email", opsStaff: "email" };

function colMap(name: string): Map<string, any> {
  let m = store.get(name);
  if (!m) {
    m = new Map();
    store.set(name, m);
  }
  return m;
}

// 開いたとき（と読み直したとき）に、サーバーのデータを入れる
export function loadAll(data: Record<string, Record<string, unknown>[]>, keepPending = true) {
  for (const [col, list] of Object.entries(data)) {
    const m = new Map<string, any>();
    for (const raw of list) {
      const d = revive(raw) as any;
      const id = String(d.id ?? d[ID_KEY[col] ?? "id"] ?? "");
      if (!id) continue;
      delete d.id;
      m.set(id, d);
    }
    // まだ送っていない変更は、上書きしない
    if (keepPending) {
      for (const op of queue) {
        if (op.col !== col) continue;
        if (op.doc) m.set(op.id, revive(op.doc));
        else m.delete(op.id);
      }
    }
    store.set(col, m);
  }
  version++;
  emit();
}

// 端末に残す控え（次に開いたとき、先に表示するため）
export function snapshot(): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const [col, m] of store) out[col] = [...m.entries()].map(([id, d]) => ({ ...encode(d), id }));
  return out;
}

// ───── 保存の状態（画面下の帯に出す） ─────
export type SaveState = { state: "idle" | "saving" | "saved" | "error"; message?: string; warnings: string[]; pending: number };
let saveState: SaveState = { state: "idle", warnings: [], pending: 0 };
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((f) => f());
}
export function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
export function getSaveState(): SaveState {
  return saveState;
}
export function dataVersion(): number {
  return version;
}
function setSave(s: Partial<SaveState>) {
  saveState = { ...saveState, ...s, pending: queue.length };
  emit();
}
export function clearWarnings() {
  setSave({ warnings: [] });
}

// ───── うしろで保存する列 ─────
let queue: WriteOp[] = [];
let sending = false;
let savedTimer: ReturnType<typeof setTimeout> | null = null;

function enqueue(col: string, id: string, doc: any | null) {
  const op: WriteOp = { col, id, doc: doc ? encode({ ...doc, [ID_KEY[col] ?? "id"]: id }) : null };
  // 同じ行への変更は、最後のものだけ送ればよい（ただし送信中のものは残す）
  queue = queue.filter((q, i) => (sending && i < inFlight) || !(q.col === col && q.id === id));
  queue.push(op);
  setSave({ state: "saving" });
  void flush();
}

let inFlight = 0;
async function flush() {
  if (sending || queue.length === 0) return;
  sending = true;
  // 入力の続きをまとめて送るため、少し待つ
  await new Promise((r) => setTimeout(r, 120));
  const batch = queue.slice();
  inFlight = batch.length;
  setSave({ state: "saving" });
  try {
    const r = await server.write(batch);
    queue = queue.slice(batch.length);
    inFlight = 0;
    sending = false;
    if (r.warnings?.length) setSave({ warnings: [...saveState.warnings, ...r.warnings] });
    if (queue.length) {
      void flush();
      return;
    }
    setSave({ state: "saved", message: undefined });
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => {
      if (saveState.state === "saved") setSave({ state: "idle" });
    }, 2400);
  } catch (e) {
    inFlight = 0;
    sending = false;
    const msg = e instanceof Error ? e.message : String(e);
    setSave({ state: "error", message: msg });
  }
}
export function retrySave() {
  void flush();
}
export function hasPending(): boolean {
  return queue.length > 0;
}

// ───── Firestore と同じ名前の関数 ─────
export type Firestore = object;
export type DocumentData = Record<string, any>;
export function getFirestore(): Firestore {
  return {};
}

type ColRef = { kind: "col"; name: string };
type DocRef = { kind: "doc"; col: string; id: string };
type Constraint =
  | { kind: "where"; field: string; op: string; value: any }
  | { kind: "orderBy"; field: string; dir: "asc" | "desc" }
  | { kind: "limit"; n: number };
type Query = { kind: "query"; name: string; cons: Constraint[] };

export function collection(_db: unknown, name: string): ColRef {
  return { kind: "col", name };
}
export function doc(dbOrCol: any, col?: string, id?: string): DocRef {
  if (dbOrCol && dbOrCol.kind === "col") return { kind: "doc", col: dbOrCol.name, id: col ?? newId() };
  return { kind: "doc", col: String(col), id: String(id) };
}
export function where(field: string, op: string, value: any): Constraint {
  return { kind: "where", field, op, value };
}
export function orderBy(field: string, dir: "asc" | "desc" = "asc"): Constraint {
  return { kind: "orderBy", field, dir };
}
export function limit(n: number): Constraint {
  return { kind: "limit", n };
}
export function query(c: ColRef | Query, ...cons: Constraint[]): Query {
  if (c.kind === "query") return { ...c, cons: [...c.cons, ...cons] };
  return { kind: "query", name: c.name, cons };
}

function snap(col: string, id: string, d: any) {
  return {
    id,
    ref: { kind: "doc", col, id } as DocRef,
    exists: () => d !== undefined,
    data: () => (d === undefined ? undefined : clone(d)),
  };
}

function cmp(a: any, b: any): number {
  const v = (x: any) => (x instanceof Timestamp ? x.ms : x);
  const x = v(a);
  const y = v(b);
  if (x === y) return 0;
  if (x === undefined || x === null) return -1;
  if (y === undefined || y === null) return 1;
  return x < y ? -1 : 1;
}

export async function getDocs(q: ColRef | Query) {
  const name = q.name;
  const cons = q.kind === "query" ? q.cons : [];
  let rows = [...colMap(name).entries()];
  for (const c of cons) {
    if (c.kind !== "where") continue;
    rows = rows.filter(([, d]) => {
      const r = cmp(d[c.field], c.value);
      if (c.op === ">=") return r >= 0;
      if (c.op === "<=") return r <= 0;
      if (c.op === ">") return r > 0;
      if (c.op === "<") return r < 0;
      if (c.op === "==") return r === 0;
      if (c.op === "!=") return r !== 0;
      return true;
    });
  }
  const orders = cons.filter((c): c is Extract<Constraint, { kind: "orderBy" }> => c.kind === "orderBy");
  if (orders.length) {
    rows.sort(([, a], [, b]) => {
      for (const o of orders) {
        const r = cmp(a[o.field], b[o.field]);
        if (r) return o.dir === "desc" ? -r : r;
      }
      return 0;
    });
  }
  const lim = cons.find((c): c is Extract<Constraint, { kind: "limit" }> => c.kind === "limit");
  if (lim) rows = rows.slice(0, lim.n);
  const docs = rows.map(([id, d]) => snap(name, id, d));
  return { docs, empty: docs.length === 0, size: docs.length, forEach: (f: (d: any) => void) => docs.forEach(f) };
}

export async function getDoc(ref: DocRef) {
  return snap(ref.col, ref.id, colMap(ref.col).get(ref.id));
}

function put(col: string, id: string, data: any) {
  const d = resolveTs(data);
  delete d.id;
  colMap(col).set(id, d);
  version++;
  enqueue(col, id, d);
}

export async function setDoc(ref: DocRef, data: any) {
  put(ref.col, ref.id, data);
}
export async function updateDoc(ref: DocRef, data: any) {
  const cur = colMap(ref.col).get(ref.id);
  if (cur === undefined) throw new Error("not-found: 保存先が見つかりません（ほかの人が消した可能性があります）");
  put(ref.col, ref.id, { ...cur, ...data });
}
export async function addDoc(c: ColRef, data: any) {
  const id = newId();
  put(c.name, id, data);
  return { id, kind: "doc", col: c.name } as DocRef & { id: string };
}
export async function deleteDoc(ref: DocRef) {
  colMap(ref.col).delete(ref.id);
  version++;
  enqueue(ref.col, ref.id, null);
}
export function writeBatch() {
  const ops: (() => void)[] = [];
  return {
    set(ref: DocRef, data: any) {
      ops.push(() => put(ref.col, ref.id, data));
    },
    update(ref: DocRef, data: any) {
      ops.push(() => {
        const cur = colMap(ref.col).get(ref.id) ?? {};
        put(ref.col, ref.id, { ...cur, ...data });
      });
    },
    delete(ref: DocRef) {
      ops.push(() => {
        colMap(ref.col).delete(ref.id);
        enqueue(ref.col, ref.id, null);
      });
    },
    async commit() {
      ops.forEach((f) => f());
      version++;
    },
  };
}

// Firestore と同じ20文字のID
export function newId(): string {
  const s = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const a = new Uint8Array(20);
  crypto.getRandomValues(a);
  for (let i = 0; i < 20; i++) out += s[a[i] % s.length];
  return out;
}

// 削除を元に戻すため（使いやすさ 12-3）：消す前の中身を取り出す
export function peek(col: string, id: string): any {
  const d = colMap(col).get(id);
  return d === undefined ? undefined : clone(d);
}
export function restore(col: string, id: string, d: any) {
  put(col, id, d);
}
