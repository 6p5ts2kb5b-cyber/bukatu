"use client";

// スタッフ名簿の画面です。
// 登録した人（有効）だけがアプリにログインできます。

import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import {
  Choices,
  ErrorText,
  Field,
  inputClass,
  Loading,
  PageHead,
  PrimaryButton,
  SecondaryButton,
  Toast,
  ToggleButton,
} from "@/components/ui";
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
    <div className="flex flex-col gap-4 p-4">
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
          <span className="f-input flex flex-col justify-center break-all py-2 text-navy-soft">
            {s.email}
            <span className="text-xs font-semibold">自分のメールアドレスはここでは変更できません</span>
          </span>
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="f-label">できること</span>
        <Choices cols={4}>
          {FLAGS.map((f) => (
            <ToggleButton key={f.key} small on={s[f.key]} label={f.label} onClick={() => toggle(f.key)} />
          ))}
        </Choices>
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
          <span className="f-label">ログイン</span>
          {isMe ? (
            <p className="f-hint">自分自身は無効にできません。</p>
          ) : (
            <Choices cols={2}>
              <ToggleButton on={s.active} label="有効" onClick={() => setS({ ...s, active: true })} />
              <ToggleButton on={!s.active} label="無効" onClick={() => setS({ ...s, active: false })} />
            </Choices>
          )}
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <div className="grid grid-cols-2 gap-2">
        <SecondaryButton onClick={onCancel}>やめる</SecondaryButton>
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "保存中…" : "保存する"}
        </PrimaryButton>
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
          className="btn btn--danger"
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
    <span className="tags">
      {on.length === 0 && <span className="tag">担当なし</span>}
      {on.map((f) => (
        <span key={f.key} className="tag">
          {f.label}
        </span>
      ))}
    </span>
  );
}

export default function StaffPage() {
  const me = useMe();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 編集中のメール、"new" = 新規
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

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

  const saved = async (msg: string) => {
    setEditing(null);
    setToast(msg);
    await reload();
  };

  const activeCount = staff?.filter((s) => s.active).length ?? 0;

  return (
    <>
      <PageHead
        kicker="STAFF"
        title="スタッフ名簿"
        lead="ここに登録して「有効」にした人だけが、Googleアカウントでアプリに入れます。"
      />

      {editing === "new" ? (
        <section className="panel p-0">
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
        </section>
      ) : (
        <PrimaryButton onClick={() => setEditing("new")}>＋ スタッフを追加</PrimaryButton>
      )}

      {loadError && <ErrorText>{loadError}</ErrorText>}
      {!staff && !loadError && <Loading />}

      {staff && <p className="group-label">有効 {activeCount}人</p>}
      <ul className="list">
        {staff?.map((s) => (
          <li key={s.email}>
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
              <button type="button" onClick={() => setEditing(s.email)} className={`row${s.active ? "" : " row--off"}`}>
                <span className="row__main">
                  <span className="row__title">
                    {s.name}
                    {s.email === me.email && <span className="ml-2 text-xs font-bold text-navy-soft">自分</span>}
                  </span>
                  <span className="row__sub break-all">{s.email}</span>
                  <Tags s={s} />
                  {s.note && <span className="row__sub mt-1">{s.note}</span>}
                </span>
                <span className={`tag ${s.active ? "tag--ok" : "tag--off"}`}>{s.active ? "有効" : "無効"}</span>
                <span className="row__chev" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>

      <Toast message={toast} onDone={clearToast} />
    </>
  );
}
