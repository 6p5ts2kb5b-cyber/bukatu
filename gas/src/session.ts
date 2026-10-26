// 開いたときの読み込み（だれが使っているか・データ）と、端末に残す控え。

import { useSyncExternalStore } from "react";
import { server, type BootResult } from "./shim/gas";
import { hasPending, loadAll, snapshot } from "./shim/firestore";

export type Session =
  | { state: "loading" }
  | { state: "error"; message: string }
  | Exclude<BootResult, { data: unknown }>
  | { state: "staff"; me: Record<string, unknown>; url: string; owner: string; version: string; fromCache?: boolean }
  | { state: "ops"; name: string; email: string; url: string; version: string; fromCache?: boolean };

const CACHE_KEY = "bukatu-gas-snapshot-v1";
let session: Session = { state: "loading" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function useSession(): Session {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => session,
  );
}
export function getSession(): Session {
  return session;
}

let gen = 0;
// データを読み直した回数（一覧の画面を新しいデータで出し直すのに使う）
export function sessionGen(): number {
  return gen;
}
function apply(r: BootResult, fromCache: boolean) {
  if (r.state === "staff" || r.state === "ops") {
    loadAll(r.data, true);
    gen++;
    const { data: _d, ...rest } = r;
    session = { ...rest, fromCache } as Session;
  } else {
    session = r as Session;
  }
  emit();
}

function readCache(): BootResult | null {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    return s ? (JSON.parse(s) as BootResult) : null;
  } catch {
    return null;
  }
}
export function saveCache() {
  try {
    if (session.state !== "staff" && session.state !== "ops") return;
    const { fromCache: _f, ...rest } = session as Session & { fromCache?: boolean };
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...rest, data: snapshot() }));
  } catch {
    /* 端末に残せなくても動く */
  }
}
export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* なにもしない */
  }
}

let lastBoot = 0;
export async function startSession() {
  // 1. 前回の控えがあれば、先に出す（すぐ見られる）
  const cached = readCache();
  if (cached && (cached.state === "staff" || cached.state === "ops")) apply(cached, true);
  // 2. サーバーから最新を読む
  await refresh(true);
}

export async function refresh(first = false) {
  try {
    const r = await server.boot();
    lastBoot = Date.now();
    apply(r, false);
    if (r.state === "staff" || r.state === "ops") saveCache();
    else clearCache();
  } catch (e) {
    if (first && session.state === "loading") {
      session = {
        state: "error",
        message: `読み込めませんでした。電波の良い場所で開き直してください。（${e instanceof Error ? e.message : String(e)}）`,
      };
      emit();
    }
  }
}

// しばらく別のアプリを見てから戻ってきたら、ほかの人の変更を読み直す
export function watchFocus() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      saveCache();
      return;
    }
    if (Date.now() - lastBoot > 60_000 && !hasPending()) void refresh();
  });
  window.addEventListener("pagehide", saveCache);
}
