"use client";

// 学校（合同チーム）名簿の画面です。
// ここに登録した学校が、テスト休みの判定や参加状況の表示に使われます。

import { useCallback, useEffect, useState } from "react";
import {
  ErrorText,
  Loading,
  PageHead,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
  Toast,
  ToggleButton,
  cssVars,
} from "@/components/ui";
import { addTeam, listTeams, swapOrder, updateTeam, type Team } from "@/lib/teams";

type Draft = Omit<Team, "id"> & { id?: string };

function TeamForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Draft;
  onSave: (t: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const [t, setT] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !initial.id;

  const submit = async () => {
    setError(null);
    if (!t.name.trim()) return setError("学校名を入力してください");
    setSaving(true);
    try {
      await onSave(t);
    } catch {
      setError("保存できませんでした。電波の良い場所でもう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="学校名">
        <input
          className={inputClass}
          value={t.name}
          onChange={(e) => setT({ ...t, name: e.target.value })}
          placeholder="例：桜中学校"
          autoComplete="off"
        />
      </Field>
      <Field label="略称（画面や警告に出る短い名前）">
        <input
          className={inputClass}
          value={t.shortName}
          onChange={(e) => setT({ ...t, shortName: e.target.value })}
          placeholder="例：桜中"
          autoComplete="off"
        />
      </Field>
      {!isNew && (
        <div className="flex flex-col gap-1.5">
          <span className="f-label">状態</span>
          <div className="grid grid-cols-2 gap-2">
            <ToggleButton on={t.active} label="有効" onClick={() => setT({ ...t, active: true })} />
            <ToggleButton on={!t.active} label="無効" onClick={() => setT({ ...t, active: false })} />
          </div>
          <p className="f-hint">
            合同チームから外れた学校は「無効」にします（データは消えません）。
          </p>
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <div className="grid grid-cols-2 gap-2">
        <SecondaryButton onClick={onCancel}>やめる</SecondaryButton>
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "保存中…" : "保存する"}
        </PrimaryButton>
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 編集中のID、"new" = 新規
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const reload = useCallback(async () => {
    try {
      setTeams(await listTeams());
      setLoadError(null);
    } catch {
      setLoadError("学校名簿を読み込めませんでした。電波の良い場所で開き直してください。");
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

  const move = async (index: number, dir: -1 | 1) => {
    if (!teams) return;
    const other = teams[index + dir];
    if (!other) return;
    await swapOrder(teams[index], other);
    await reload();
  };

  const activeTeams = teams?.filter((t) => t.active) ?? [];
  const nextOrder = (teams?.reduce((m, t) => Math.max(m, t.order), 0) ?? 0) + 1;

  return (
    <>
      <PageHead
        kicker="SCHOOLS"
        title="学校"
        lead="合同チームを組む学校です。予定の区分や、印刷・選手名簿の学校分けに使います。"
      />

      {editing === "new" ? (
        <section className="panel">
          <TeamForm
            initial={{ name: "", shortName: "", order: nextOrder, active: true }}
            onCancel={() => setEditing(null)}
            onSave={async (t) => {
              await addTeam(t);
              await saved("登録しました");
            }}
          />
        </section>
      ) : (
        <PrimaryButton onClick={() => setEditing("new")}>＋ 学校を追加</PrimaryButton>
      )}

      {loadError && <ErrorText>{loadError}</ErrorText>}
      {!teams && !loadError && <Loading />}

      {teams && <p className="group-label">有効 {activeTeams.length}校・▲▼で並べ替え</p>}
      <ul className="list">
        {teams?.map((t, i) => (
          <li key={t.id}>
            {editing === t.id ? (
              <div className="p-4">
                <TeamForm
                  initial={t}
                  onCancel={() => setEditing(null)}
                  onSave={async (next) => {
                    await updateTeam({ ...t, ...next, id: t.id });
                    await saved("保存しました");
                  }}
                />
              </div>
            ) : (
              <div className={`flex items-center ${t.active ? "" : "row--off"}`}>
                <button type="button" onClick={() => setEditing(t.id)} className="row flex-1">
                  <span className="tile row__num" style={cssVars({ "--i": i })}>
                    {i + 1}
                  </span>
                  <span className="row__main">
                    <span className="row__title">{t.shortName}</span>
                    <span className="row__sub">{t.name}</span>
                  </span>
                  <span className={`tag ${t.active ? "tag--ok" : "tag--off"}`}>{t.active ? "有効" : "無効"}</span>
                </button>
                <div className="flex shrink-0 flex-col pr-2">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`${t.shortName}を上へ`}
                    className="h-10 w-11 rounded-lg text-sm text-navy-soft active:bg-field disabled:opacity-25"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === (teams?.length ?? 0) - 1}
                    aria-label={`${t.shortName}を下へ`}
                    className="h-10 w-11 rounded-lg text-sm text-navy-soft active:bg-field disabled:opacity-25"
                  >
                    ▼
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Toast message={toast} onDone={clearToast} />
    </>
  );
}
