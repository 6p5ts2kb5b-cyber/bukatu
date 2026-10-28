// 動きの小さな部品（motion-prompt から、このアプリに合うものだけ）
//  #085 リップル：ボタンを押したところから輪が広がる（押せたことが指で分かる）
//  #151 トップへ戻る：長い一覧で下まで行ったら、右下に「↑」
// 「動きを減らす」設定の端末では、どちらも動かさない

import { useEffect, useState } from "react";

const reduced = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export function Ripple() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (reduced()) return;
      const el = (e.target as HTMLElement | null)?.closest?.(".btn, .choice, .row, .tabbar a, .side__add") as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled) return;
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const dot = document.createElement("span");
      dot.className = "ripple";
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - r.left - size / 2}px`;
      dot.style.top = `${e.clientY - r.top - size / 2}px`;
      el.classList.add("ripple-host");
      el.appendChild(dot);
      setTimeout(() => dot.remove(), 600);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setShow(window.scrollY > window.innerHeight * 1.5));
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button
      type="button"
      className={`to-top${show ? " to-top--on" : ""}`}
      aria-label="いちばん上へ戻る"
      tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" })}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
