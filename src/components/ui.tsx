"use client";

// 画面で何度も使う部品（見出し・ボタン・入力欄・「保存しました」表示）をまとめたファイルです。
// 見た目は design.css で決めています（得点板のデザイン）。

import { useEffect, type CSSProperties, type ReactNode } from "react";

// CSSの変数（--i など）を style に渡すための小さな道具
export function cssVars(v: Record<string, number | string>): CSSProperties {
  return v as unknown as CSSProperties;
}

export const inputClass = "f-input";

// 画面の見出し：小さな英字（kicker）＋日本語のタイトル
export function PageHead({
  kicker,
  title,
  lead,
  action,
}: {
  kicker: string;
  title: string;
  lead?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="min-w-0">
        <span className="page-head__kicker">{kicker}</span>
        <h1>{title}</h1>
        {lead && <p className="page-head__lead">{lead}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

// 面の見出し。no を渡すと、めくり数字の番号が付く
export function PanelTitle({ no, children, aside }: { no?: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <h2 className="panel__title">
      {no !== undefined && <span className="tile">{no}</span>}
      {children}
      {aside && <small>{aside}</small>}
    </h2>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="f-label">{label}</span>
      {children}
      {hint && <span className="f-hint block">{hint}</span>}
    </label>
  );
}

// タップで選ぶ大きなボタン（小さなチェックボックスの代わり）。選ぶと得点板の緑になる
export function ToggleButton({
  on,
  label,
  onClick,
  small,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`choice${small ? " choice--sm" : ""}`}>
      {label}
    </button>
  );
}

// ToggleButton を並べる枠（cols = 1行に並べる数）
export function Choices({ cols = 3, children }: { cols?: number; children: ReactNode }) {
  return (
    <div className="choices" style={cssVars({ "--cols": cols })}>
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  accent,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn ${accent ? "btn--accent" : "btn--primary"}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className={`btn ${danger ? "btn--danger" : "btn--ghost"}`}>
      {children}
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="alert" role="alert">
      {children}
    </p>
  );
}

// 読み込み中：縫い目が回るボールと、塁を順に回るランナー（ダイヤモンド）
export function Loading({ small = false, label = "読み込み中" }: { small?: boolean; label?: string }) {
  return (
    <div className={`loading${small ? " loading--small" : ""}`} role="status" aria-live="polite">
      <span className="loading__field" aria-hidden>
        <svg viewBox="0 0 64 64" className="loading__diamond">
          <path d="M32 8 56 32 32 56 8 32Z" />
          <rect className="loading__base loading__base--1" x="51" y="27" width="10" height="10" rx="1.5" transform="rotate(45 56 32)" />
          <rect className="loading__base loading__base--2" x="27" y="3" width="10" height="10" rx="1.5" transform="rotate(45 32 8)" />
          <rect className="loading__base loading__base--3" x="3" y="27" width="10" height="10" rx="1.5" transform="rotate(45 8 32)" />
          <path className="loading__home" d="M27 52h10v4l-5 5-5-5z" />
        </svg>
        <svg viewBox="0 0 48 48" className="loading__ball">
          <circle cx="24" cy="24" r="20" fill="#fff" stroke="#d4dcd1" strokeWidth="1.5" />
          <path
            d="M11 9c6 6 6 24 0 30M37 9c-6 6-6 24 0 30"
            fill="none"
            stroke="#c42b3b"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray="2 3.2"
          />
        </svg>
      </span>
      <span className="loading__text">{label}…</span>
    </div>
  );
}

// 画面下に数秒だけ出る「保存しました」表示
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div role="status" className="toast">
      <i aria-hidden>✓</i>
      {message}
    </div>
  );
}
