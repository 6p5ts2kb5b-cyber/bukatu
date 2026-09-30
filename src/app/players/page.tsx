"use client";

// 選手名簿の画面です。ここに登録した選手を、メンバー表（守備位置・打順）で使います。

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  ErrorText,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
  Toast,
  ToggleButton,
} from "@/components/ui";
import { addPlayer, EMPTY_PLAYER, listPlayers, updatePlayer, type Player, type PlayerDraft } from "@/lib/players";
import { listTeams, type Team } from "@/lib/teams";

function PlayerForm({
  initial,
  teams,
  onSave,
  onCancel,
}: {
  initial: PlayerDraft;
  teams: Team[];
  onSave: (p: PlayerDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [p, setP] = useState<PlayerDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !initial.id;

  const submit = async () => {
    setError(null);
    if (!p.name.trim()) return setError("氏名を入力してください");
    if (!p.teamId) return setError("学校を選んでください");
    setSaving(true);
    try {
      await onSave(p);
    } catch {
      setError("保存できませんでした。電波の良い場所でもう一度お試しください。");
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="氏名">
          <input
            className={inputClass}
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
            placeholder="例：山田 太郎"
            autoComplete="off"
          />
        </Field>
        <Field label="背番号">
          <input
            className={`${inputClass} text-center text-lg font-bold`}
            value={p.number}
            onChange={(e) => setP({ ...p, number: e.target.value })}
            placeholder="10"
            inputMode="numeric"
            autoComplete="off"
          />
        </Field>
      </div>
      <Field label="ふりがな（任意）">
        <input
          className={inputClass}
          value={p.kana}
          onChange={(e) => setP({ ...p, kana: e.target.value })}
          placeholder="例：やまだ たろう"
          autoComplete="off"
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-navy-soft">学校</span>
        <div className="grid grid-cols-3 gap-2">
          {teams
            .filter((t) => t.active || t.id === p.teamId)
            .map((t) => (
              <ToggleButton key={t.id} on={p.teamId === t.id} label={t.shortName} onClick={() => setP({ ...p, teamId: t.id })} />
            ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-navy-soft">学年</span>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((g) => (
            <ToggleButton key={g} on={p.grade === g} label={`${g}年`} onClick={() => setP({ ...p, grade: g })} />
          ))}
        </div>
      </div>
      {!isNew && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-navy-soft">状態</span>
          <div className="grid grid-cols-2 gap-2">
            <ToggleButton on={p.active} label="在籍" onClick={() => setP({ ...p, active: true })} />
            <ToggleButton on={!p.active} label="卒業・退部" onClick={() => setP({ ...p, active: false })} />
          </div>
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

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const reload = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([listPlayers(), listTeams()]);
      setPlayers(p);
      setTeams(t);
    } catch {
      setError("選手名簿を読み込めませんでした。電波の良い場所で開き直してください。");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.shortName ?? "学校未設定";

  const shown = useMemo(
    () =>
      (players ?? []).filter(
        (p) => (showInactive || p.active) && (filter === "all" || p.teamId === filter),
      ),
    [players, filter, showInactive],
  );

  const saved = async (msg: string) => {
    setEditing(null);
    setToast(msg);
    await reload();
  };

  const activeCount = players?.filter((p) => p.active).length ?? 0;

  return (
    <>
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold">選手名簿</h2>
          {players && <span className="text-sm font-bold text-navy-soft/70">在籍 {activeCount}人</span>}
        </div>
        <p className="mt-1 text-sm text-navy-soft/80">メンバー表（守備位置・打順）で使う選手の一覧です。</p>
        {editing === "new" ? (
          <div className="mt-4 border-t border-navy/10 pt-4">
            <PlayerForm
              initial={{ ...EMPTY_PLAYER, teamId: filter !== "all" ? filter : "" }}
              teams={teams}
              onCancel={() => setEditing(null)}
              onSave={async (p) => {
                await addPlayer(p);
                await saved("登録しました");
              }}
            />
          </div>
        ) : (
          <div className="mt-4">
            <PrimaryButton onClick={() => setEditing("new")}>＋ 選手を追加</PrimaryButton>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {[{ id: "all", shortName: "全員" }, ...teams.filter((t) => t.active)].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`min-h-10 rounded-full px-4 text-sm font-bold ring-1 ${
              filter === t.id ? "bg-navy text-white ring-navy" : "bg-white ring-navy/15"
            }`}
          >
            {t.shortName}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowInactive(!showInactive)}
          className="ml-auto min-h-10 px-2 text-sm font-bold text-navy-soft/70 underline"
        >
          {showInactive ? "卒業・退部を隠す" : "卒業・退部も表示"}
        </button>
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {!players && !error && <p className="py-6 text-center text-sm text-navy-soft/70">読み込み中…</p>}
      {players && shown.length === 0 && (
        <p className="py-4 text-center text-sm text-navy-soft/70">選手はまだ登録されていません。</p>
      )}

      <ul className="flex flex-col gap-2">
        {shown.map((p) => (
          <li key={p.id} className={`rounded-2xl bg-white shadow-sm ring-1 ring-navy/5 ${p.active ? "" : "opacity-60"}`}>
            {editing === p.id ? (
              <div className="p-5">
                <PlayerForm
                  initial={p}
                  teams={teams}
                  onCancel={() => setEditing(null)}
                  onSave={async (next) => {
                    await updatePlayer(p.id, next);
                    await saved("保存しました");
                  }}
                />
              </div>
            ) : (
              <button type="button" onClick={() => setEditing(p.id)} className="flex w-full items-center gap-4 p-4 text-left">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy text-lg font-extrabold text-white">
                  {p.number || "－"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-extrabold">{p.name}</span>
                  <span className="block text-sm text-navy-soft/70">
                    {teamName(p.teamId)}・{p.grade}年{p.active ? "" : "（卒業・退部）"}
                  </span>
                </span>
                <span className="text-xl text-navy-soft/40" aria-hidden>
                  ›
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>

      <Toast message={toast} onDone={clearToast} />
    </>
  );
}
