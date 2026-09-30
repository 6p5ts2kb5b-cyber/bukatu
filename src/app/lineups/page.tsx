"use client";

// メンバー表の一覧と新規作成の画面です。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, ErrorText, Field, inputClass, PrimaryButton } from "@/components/ui";
import { formatDate, todayString } from "@/lib/activities";
import { createLineup, listLineups, POSITIONS, type Lineup } from "@/lib/lineups";

export default function LineupsPage() {
  const router = useRouter();
  const [lineups, setLineups] = useState<Lineup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayString());
  const [opponent, setOpponent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listLineups()
      .then(setLineups)
      .catch(() => setError("メンバー表を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, []);

  const create = async (copyFrom?: Lineup) => {
    setSaving(true);
    try {
      const id = await createLineup({
        title: copyFrom ? `${copyFrom.title}（コピー）` : title.trim() || `${formatDate(date)} メンバー表`,
        date: copyFrom ? todayString() : date,
        opponent: copyFrom ? copyFrom.opponent : opponent.trim(),
        positions: copyFrom ? copyFrom.positions : {},
        order: copyFrom ? copyFrom.order : [],
        bench: copyFrom ? copyFrom.bench : [],
      });
      router.push(`/lineups/${id}`);
    } catch {
      setError("作成できませんでした。");
      setSaving(false);
    }
  };

  return (
    <>
      <h1 className="px-1 text-xl font-extrabold">メンバー表</h1>
      <Card>
        {creating ? (
          <div className="flex flex-col gap-4">
            <Field label="名前">
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：10/12 秋季大会 第1試合"
                autoComplete="off"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="日付">
                <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="対戦相手">
                <input
                  className={inputClass}
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                  placeholder="例：坂戸中"
                  autoComplete="off"
                />
              </Field>
            </div>
            <PrimaryButton onClick={() => create()} disabled={saving}>
              {saving ? "作成中…" : "作成して守備位置を決める"}
            </PrimaryButton>
          </div>
        ) : (
          <PrimaryButton onClick={() => setCreating(true)}>＋ 新しいメンバー表</PrimaryButton>
        )}
      </Card>

      {error && <ErrorText>{error}</ErrorText>}
      {!lineups && !error && <p className="py-6 text-center text-sm text-navy-soft/70">読み込み中…</p>}
      {lineups && lineups.length === 0 && (
        <p className="py-4 text-center text-sm text-navy-soft/70">メンバー表はまだありません。</p>
      )}

      <ul className="flex flex-col gap-3">
        {lineups?.map((l) => {
          const filled = POSITIONS.filter((p) => l.positions[p.key]).length;
          return (
            <li key={l.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-navy/5">
              <Link href={`/lineups/${l.id}`} className="block p-5 active:bg-field">
                <p className="text-sm font-bold text-navy-soft/70">{l.date ? formatDate(l.date) : ""}</p>
                <p className="text-lg font-extrabold">{l.title}</p>
                {l.opponent && <p className="text-base font-bold">vs {l.opponent}</p>}
                <p className={`mt-1 text-sm font-bold ${filled === 9 ? "text-ok" : "text-[#8a6500]"}`}>
                  {filled === 9 ? "● 守備9人 決定" : `▲ 守備 ${filled}/9人`}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => create(l)}
                disabled={saving}
                className="w-full border-t border-navy/10 py-3 text-sm font-bold text-navy-soft active:bg-field"
              >
                このメンバー表をコピーして新しく作る
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
