"use client";

// 画面で何度も使う部品（ボタン・入力欄・「保存しました」表示）をまとめたファイルです。

import { useEffect, type ReactNode } from "react";

export const inputClass =
  "min-h-12 w-full rounded-xl bg-field px-4 text-base ring-1 ring-navy/15 focus:outline-none focus:ring-2 focus:ring-navy";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy/5 ${className}`}>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold text-navy-soft">{label}</span>
      {children}
    </label>
  );
}

// タップで色が変わる大きな選択ボタン（小さなチェックボックスの代わり）
export function ToggleButton({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-12 rounded-xl px-3 text-base font-bold ring-2 transition-colors ${
        on ? "bg-navy text-white ring-navy" : "bg-white text-navy-soft/60 ring-navy/15"
      }`}
    >
      {on ? "✓ " : ""}
      {label}
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 w-full items-center justify-center rounded-xl bg-navy px-4 text-base font-bold text-white active:bg-navy-soft disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-12 w-full rounded-xl bg-white px-4 text-base font-bold ring-1 ring-navy/15 active:bg-field"
    >
      {children}
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-ng/10 p-3 text-sm font-bold text-ng" role="alert">
      ■ {children}
    </p>
  );
}

// 画面下に数秒だけ出る「保存しました」表示
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-20 mx-auto max-w-sm rounded-xl bg-ok px-4 py-3 text-center text-base font-bold text-white shadow-lg"
    >
      ✓ {message}
    </div>
  );
}
