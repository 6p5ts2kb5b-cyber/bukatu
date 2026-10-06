"use client";

// 選手名簿の画面です。ここに登録した選手を、メンバー表（守備位置・打順）で使います。

import { useCallback, useEffect, useMemo, useState } from "react";
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
            className={`${inputClass} text-center`} style={{ fontFamily: "var(--num)", fontSize: 22 }}
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
        <span className="f-label">学校</span>
        <div className="grid grid-cols-3 gap-2">
          {teams
            .filter((t) => t.active || t.id === p.teamId)
            .map((t) => (
              <ToggleButton key={t.id} on={p.teamId === t.id} label={t.shortName} onClick={() => setP({ ...p, teamId: t.id })} />
            ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="f-label">学年</span>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((g) => (
            <ToggleButton key={g} on={p.grade === g} label={`${g}年`} onClick={() => setP({ ...p, grade: g })} />
          ))}
        </div>
      </div>
      {!isNew && (
        <div className="flex flex-col gap-1.5">
          <span className="f-label">状態</span>
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
      <PageHead kicker="PLAYERS" title="選手名簿" lead="メンバー表（守備位置・打順）で使う選手の一覧です。" />

      {editing === "new" ? (
        <section className="panel">
          <PlayerForm
            initial={{ ...EMPTY_PLAYER, teamId: filter !== "all" ? filter : "" }}
            teams={teams}
            onCancel={() => setEditing(null)}
            onSave={async (p) => {
              await addPlayer(p);
              await saved("登録しました");
            }}
          />
        </section>
      ) : (
        <PrimaryButton onClick={() => setEditing("new")}>＋ 選手を追加</PrimaryButton>
      )}

      <div className="filters">
        {[{ id: "all", shortName: "全員" }, ...teams.filter((t) => t.active)].map((t) => (
          <button key={t.id} type="button" className="filter" aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>
            {t.shortName}
          </button>
        ))}
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {!players && !error && <Loading />}
      {players && shown.length === 0 && (
        <p className="py-4 text-center text-sm text-navy-soft">選手はまだ登録されていません。</p>
      )}

      {players && shown.length > 0 && (
        <div className="flex items-baseline justify-between px-1">
          <p className="group-label p-0">
            {filter === "all" ? "在籍" : teamName(filter)} {shown.filter((p) => p.active).length}人
          </p>
          <button type="button" onClick={() => setShowInactive(!showInactive)} className="text-xs font-bold text-navy-soft underline">
            {showInactive ? "卒業・退部を隠す" : "卒業・退部も表示"}
          </button>
        </div>
      )}
      <ul className="list">
        {shown.map((p, i) => (
          <li key={p.id}>
            {editing === p.id ? (
              <div className="p-4">
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
              <button type="button" onClick={() => setEditing(p.id)} className={`row${p.active ? "" : " row--off"}`}>
                <span className="tile row__num" style={cssVars({ "--i": Math.min(i, 8) })}>
                  {p.number || "－"}
                </span>
                <span className="row__main">
                  <span className="row__title">{p.name}</span>
                  <span className="row__sub">
                    {teamName(p.teamId)}・{p.grade}年{p.active ? "" : "・卒業/退部"}
                  </span>
                </span>
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
