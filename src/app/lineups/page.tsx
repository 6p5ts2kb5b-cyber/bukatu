"use client";

// メンバー表の一覧と新規作成の画面です。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, ErrorText, Field, inputClass, Loading, PageHead, PrimaryButton } from "@/components/ui";
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
      <PageHead kicker="LINEUP" title="メンバー表" lead="ダイヤモンドで守備位置を決め、打順を並べて印刷します。" />
      {creating ? (
        <Card>
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
        </Card>
      ) : (
        <PrimaryButton onClick={() => setCreating(true)}>＋ 新しいメンバー表</PrimaryButton>
      )}

      {error && <ErrorText>{error}</ErrorText>}
      {!lineups && !error && <Loading />}
      {lineups && lineups.length === 0 && (
        <p className="py-4 text-center text-sm text-navy-soft">メンバー表はまだありません。</p>
      )}

      <ul className="list">
        {lineups?.map((l) => {
          const filled = POSITIONS.filter((p) => l.positions[p.key]).length;
          return (
            <li key={l.id}>
              <Link href={`/lineups/${l.id}`} className="row">
                <span className="row__main">
                  <span className="row__sub">{l.date ? formatDate(l.date) : ""}</span>
                  <span className="row__title">{l.title}</span>
                  <span className="tags">
                    {l.opponent && <span className="tag">vs {l.opponent}</span>}
                    <span className={`tag ${filled === 9 ? "tag--ok" : ""}`}>守備 {filled}/9</span>
                  </span>
                </span>
                <span className="row__chev" aria-hidden />
              </Link>
              <button
                type="button"
                onClick={() => create(l)}
                disabled={saving}
                className="w-full border-t border-dashed border-rule py-2.5 text-xs font-bold text-navy-soft active:bg-field"
              >
                コピーして次の試合を作る
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
