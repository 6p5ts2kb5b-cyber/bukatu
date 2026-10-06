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

export function Loading() {
  return <p className="py-10 text-center text-sm font-bold text-navy-soft">読み込み中…</p>;
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
