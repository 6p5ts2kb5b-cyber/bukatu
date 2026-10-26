// 画面の切り替え（Next.js のページ移動の代わり）。
// GASの画面は枠（iframe）の中で動くので、アドレスの「#」のうしろに今の画面を書き、
// google.script.history で戻る・進むができるようにします。

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSyncExternalStore } from "react";
declare const google: any;

export type Loc = { path: string; search: string };

function parse(hash: string): Loc {
  const h = decodeURIComponent((hash || "").replace(/^#/, ""));
  const [p, s] = h.split("?");
  const path = "/" + (p || "").replace(/^\/+/, "");
  return { path: path === "" ? "/" : path, search: s ? `?${s}` : "" };
}

let loc: Loc = { path: "/", search: "" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
let guard: ((to: Loc) => boolean) | null = null;

const hasHistory = () => typeof google !== "undefined" && google.script && google.script.history;

function hashOf(l: Loc) {
  return `${l.path.replace(/^\//, "")}${l.search}`;
}

export function initRouter(initialHash: string) {
  loc = parse(initialHash);
  if (hasHistory()) {
    google.script.history.setChangeHandler((e: any) => {
      const next = parse(e?.location?.hash ?? "");
      loc = next;
      emit();
      window.scrollTo(0, 0);
    });
  } else {
    window.addEventListener("popstate", () => {
      loc = parse(window.location.hash);
      emit();
    });
  }
}

// 入力の途中で移ろうとしたときに確かめる（使いやすさ 12-3）
export function setLeaveGuard(f: ((to: Loc) => boolean) | null) {
  guard = f;
}

export function navigate(to: string, replace = false) {
  const next = parse(to.startsWith("/") ? to : `/${to}`);
  if (guard && !guard(next)) return;
  loc = next;
  const h = hashOf(next);
  if (hasHistory()) {
    if (replace) google.script.history.replace(null, {}, h);
    else google.script.history.push(null, {}, h);
  } else {
    const url = `#${h}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }
  emit();
  window.scrollTo(0, 0);
}

export function back() {
  window.history.back();
}

export function currentLoc(): Loc {
  return loc;
}

export function useLoc(): Loc {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => loc,
  );
}

// いまのアプリのコードの window.location.search の代わり
export function routeSearch(): string {
  return loc.search;
}
// window.history.replaceState(null, "", url) の代わり
export function routeReplace(url: string) {
  loc = parse(url);
  if (hasHistory()) google.script.history.replace(null, {}, hashOf(loc));
}
