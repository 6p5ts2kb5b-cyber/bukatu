"use client";

// メンバー表の作成画面です（作る部分は LineupWorkbench）。
//   タブ1「守備位置」… 野球のダイヤモンド上の丸をタップして選手を選ぶ
//   タブ2「打順」   … 1番から順にタップして決める（2人タップで入れ替え）、控え選手を選ぶ
//   タブ3「メンバー表」… 打順・守備・背番号・氏名の表を確認して印刷する
// 変更は自動で保存されます。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorText, SecondaryButton, Loading } from "@/components/ui";
import { LineupWorkbench } from "@/components/LineupWorkbench";
import { deleteLineup, getLineup, saveLineup, type Lineup } from "@/lib/lineups";
import { listPlayers, type Player } from "@/lib/players";
import { listTeams, type Team } from "@/lib/teams";

export default function LineupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lineup, setLineup] = useState<Lineup | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const loaded = useRef(false);

  useEffect(() => {
    Promise.all([getLineup(id), listPlayers(), listTeams()])
      .then(([l, p, t]) => {
        setLineup(l);
        setPlayers(p);
        setTeams(t);
      })
      .catch(() => setError("読み込めませんでした。電波の良い場所で開き直してください。"));
  }, [id]);

  // 変更があったら少し待ってから自動保存
  useEffect(() => {
    if (!lineup) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      saveLineup(lineup)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 700);
    return () => clearTimeout(t);
  }, [lineup]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (lineup === undefined) return <Loading />;
  if (lineup === null) return <ErrorText>このメンバー表は見つかりませんでした。</ErrorText>;

  const remove = async () => {
    if (!window.confirm("このメンバー表を削除します。元に戻せません。よろしいですか？")) return;
    await deleteLineup(lineup.id);
    router.push("/lineups");
  };

  return (
    <LineupWorkbench
      lineup={lineup}
      onChange={setLineup}
      players={players}
      teams={teams}
      top={
        <div className="flex items-center justify-between px-1 print:hidden">
          <Link href="/lineups" className="text-sm font-bold text-navy-soft/70">
            ‹ メンバー表一覧
          </Link>
          <span
            className={`text-sm font-bold ${
              saveState === "error" ? "text-ng" : saveState === "saving" ? "text-navy-soft/60" : "text-ok"
            }`}
          >
            {saveState === "error" ? "■ 保存できません" : saveState === "saving" ? "保存中…" : "✓ 保存済み"}
          </span>
        </div>
      }
      bottom={
        <div className="mt-6 print:hidden">
          <SecondaryButton danger onClick={remove}>このメンバー表を削除する</SecondaryButton>
        </div>
      }
    />
  );
}
