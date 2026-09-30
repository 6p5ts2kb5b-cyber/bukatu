"use client";

// スタッフ名簿の画面です。
// 登録した人（有効）だけがアプリにログインできます。

import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import {
  addStaff,
  EMPTY_STAFF,
  listStaff,
  normalizeEmail,
  changeStaffEmail,
  deleteStaff,
  type Staff,
} from "@/lib/staff";

type Flag = "canCoach" | "canUmpire" | "canPlateUmpire" | "canBaseUmpire";

const FLAGS: { key: Flag; label: string }[] = [
  { key: "canCoach", label: "指導" },
  { key: "canUmpire", label: "審判" },
  { key: "canPlateUmpire", label: "球審" },
  { key: "canBaseUmpire", label: "塁審" },
];

// タップで色が変わる大きな選択ボタン（小さなチェックボックスの代わり）
function ToggleButton({
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold text-navy-soft">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "min-h-12 w-full rounded-xl bg-field px-4 text-base ring-1 ring-navy/15 focus:outline-none focus:ring-2 focus:ring-navy";

function StaffForm({
  initial,
  isNew,
  isMe,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Staff;
  isNew: boolean;
  isMe: boolean;
  onSave: (s: Staff) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [s, setS] = useState<Staff>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (k: Flag) => setS((prev) => ({ ...prev, [k]: !prev[k] }));

  const submit = async () => {
    setError(null);
    if (!s.name.trim()) return setError("氏名を入力してください");
    const email = normalizeEmail(s.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return setError("Googleメールアドレスを正しく入力してください");
    }
    setSaving(true);
    try {
      await onSave({ ...s, email });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存できませんでした";
      setError(msg.includes("permission") ? "保存する権限がありません" : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="氏名">
        <input
          className={inputClass}
          value={s.name}
          onChange={(e) => setS({ ...s, name: e.target.value })}
          placeholder="例：田中 太郎"
          autoComplete="off"
        />
      </Field>
      <Field label="Googleメールアドレス（ログインに使うもの）">
        {isNew || !isMe ? (
          <input
            className={inputClass}
            value={s.email}
            onChange={(e) => setS({ ...s, email: e.target.value })}
            placeholder="例：tanaka@gmail.com"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="off"
          />
        ) : (
          <p className="break-all rounded-xl bg-field px-4 py-3 text-base text-navy-soft/80">
            {s.email}
            <span className="mt-1 block text-sm">（自分のメールアドレスはここでは変更できません）</span>
          </p>
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-navy-soft">できること（タップで切り替え）</span>
        <div className="grid grid-cols-2 gap-2">
          {FLAGS.map((f) => (
            <ToggleButton key={f.key} on={s[f.key]} label={f.label} onClick={() => toggle(f.key)} />
          ))}
        </div>
      </div>
      <Field label="備考">
        <input
          className={inputClass}
          value={s.note}
          onChange={(e) => setS({ ...s, note: e.target.value })}
          placeholder="例：土曜のみ参加"
          autoComplete="off"
        />
      </Field>
      {!isNew && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-navy-soft">ログイン</span>
          {isMe ? (
            <p className="text-sm text-navy-soft/80">自分自身は無効にできません。</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton on={s.active} label="有効" onClick={() => setS({ ...s, active: true })} />
              <ToggleButton on={!s.active} label="無効" onClick={() => setS({ ...s, active: false })} />
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="rounded-lg bg-ng/10 p-3 text-sm font-bold text-ng" role="alert">
          ■ {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-12 rounded-xl bg-white text-base font-bold ring-1 ring-navy/15 active:bg-field"
        >
          やめる
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="min-h-12 rounded-xl bg-navy text-base font-bold text-white active:bg-navy-soft disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存する"}
        </button>
      </div>
      {onDelete && !isMe && (
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(`${initial.name} さんを名簿から削除します。この人はアプリに入れなくなります。よろしいですか？`)) return;
            setSaving(true);
            try {
              await onDelete();
            } catch {
              setError("削除できませんでした。");
              setSaving(false);
            }
          }}
          disabled={saving}
          className="min-h-12 w-full rounded-xl text-base font-bold text-ng ring-1 ring-ng/30 active:bg-ng/10 disabled:opacity-50"
        >
          このスタッフを削除する
        </button>
      )}
    </div>
  );
}

function Tags({ s }: { s: Staff }) {
  const on = FLAGS.filter((f) => s[f.key]);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {on.length === 0 && <span className="text-sm text-navy-soft/60">担当なし</span>}
      {on.map((f) => (
        <span key={f.key} className="rounded-full bg-navy/5 px-2.5 py-0.5 text-sm font-bold text-navy-soft">
          {f.label}
        </span>
      ))}
    </div>
  );
}

export default function StaffPage() {
  const me = useMe();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 編集中のメール、"new" = 新規
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setStaff(await listStaff());
      setLoadError(null);
    } catch {
      setLoadError("スタッフ名簿を読み込めませんでした。電波の良い場所で開き直してください。");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const saved = async (msg: string) => {
    setEditing(null);
    setToast(msg);
    await reload();
  };

  const activeCount = staff?.filter((s) => s.active).length ?? 0;

  return (
    <>
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy/5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold">スタッフ名簿</h2>
          {staff && <span className="text-sm font-bold text-navy-soft/70">有効 {activeCount}人</span>}
        </div>
        <p className="mt-1 text-sm text-navy-soft/80">
          ここに登録して「有効」にした人だけが、Googleアカウントでアプリに入れます。
        </p>
        {editing === "new" ? (
          <div className="mt-4 border-t border-navy/10 pt-4">
            <StaffForm
              initial={EMPTY_STAFF}
              isNew
              isMe={false}
              onCancel={() => setEditing(null)}
              onSave={async (s) => {
                await addStaff(s);
                await saved("登録しました");
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-navy px-4 text-base font-bold text-white active:bg-navy-soft"
          >
            ＋ スタッフを追加
          </button>
        )}
      </section>

      {loadError && (
        <p className="rounded-xl bg-ng/10 p-4 text-sm font-bold text-ng" role="alert">
          ■ {loadError}
        </p>
      )}
      {!staff && !loadError && (
        <p className="py-6 text-center text-sm text-navy-soft/70">読み込み中…</p>
      )}

      <ul className="flex flex-col gap-3">
        {staff?.map((s) => (
          <li
            key={s.email}
            className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy/5 ${s.active ? "" : "opacity-60"}`}
          >
            {editing === s.email ? (
              <StaffForm
                initial={s}
                isNew={false}
                isMe={s.email === me.email}
                onCancel={() => setEditing(null)}
                onDelete={async () => {
                  await deleteStaff(s.email);
                  await saved("削除しました");
                }}
                onSave={async (next) => {
                  await changeStaffEmail(s.email, next);
                  await saved("保存しました");
                }}
              />
            ) : (
              <button type="button" onClick={() => setEditing(s.email)} className="block w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-extrabold">
                    {s.name}
                    {s.email === me.email && <span className="ml-2 text-sm text-navy-soft/60">（自分）</span>}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ring-1 ${
                      s.active ? "bg-ok/10 text-ok ring-ok/30" : "bg-navy/5 text-navy-soft/70 ring-navy/15"
                    }`}
                  >
                    {s.active ? "● 有効" : "■ 無効"}
                  </span>
                </div>
                <p className="mt-1 break-all text-sm text-navy-soft/70">{s.email}</p>
                <Tags s={s} />
                {s.note && <p className="mt-2 text-sm text-navy-soft/80">{s.note}</p>}
                <p className="mt-3 text-sm font-bold text-navy-soft/60">タップして編集 ›</p>
              </button>
            )}
          </li>
        ))}
      </ul>

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-20 mx-auto max-w-sm rounded-xl bg-ok px-4 py-3 text-center text-base font-bold text-white shadow-lg"
        >
          ✓ {toast}
        </div>
      )}
    </>
  );
}
