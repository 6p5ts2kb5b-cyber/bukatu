"use client";

// ログインなしでメンバー表を作るページ（共有URL／QRコードから開く）。
// 選手の名簿はURLの「#」の後ろに入っています。アプリのデータベースには何も読み書きしません。
// 作業の途中は、このスマホの中（ブラウザ）にだけ残します。

import { useEffect, useState } from "react";
import { ErrorText, Loading, SecondaryButton } from "@/components/ui";
import { LineupWorkbench } from "@/components/LineupWorkbench";
import { todayString } from "@/lib/activities";
import { decodeRoster, shortHash } from "@/lib/lineupShare";
import type { Lineup } from "@/lib/lineups";
import type { Player } from "@/lib/players";
import type { Team } from "@/lib/teams";

const blank = (): Lineup => ({
  id: "share",
  title: "",
  date: todayString(),
  opponent: "",
  positions: {},
  order: [],
  bench: [],
});

function readSaved(key: string): Lineup | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const x = JSON.parse(raw);
    return { ...blank(), ...x, id: "share" };
  } catch {
    return null;
  }
}

export function SharedLineup() {
  const [state, setState] = useState<
    | { s: "loading" }
    | { s: "bad" }
    | { s: "ok"; key: string; players: Player[]; teams: Team[] }
  >({ s: "loading" });
  const [lineup, setLineup] = useState<Lineup>(blank);

  useEffect(() => {
    const load = () => {
      const code = window.location.hash.slice(1);
      const roster = code ? decodeRoster(code) : null;
      if (!roster) return setState({ s: "bad" });
      const key = `bukatu-m:${shortHash(code)}`;
      setLineup(readSaved(key) ?? blank());
      setState({ s: "ok", key, ...roster });
    };
    load();
    window.addEventListener("hashchange", load);
    return () => window.removeEventListener("hashchange", load);
  }, []);

  const change = (l: Lineup) => {
    setLineup(l);
    if (state.s !== "ok") return;
    try {
      window.localStorage.setItem(state.key, JSON.stringify(l));
    } catch {
      // 残せなくても、画面の上では作業を続けられる
    }
  };

  if (state.s === "loading") return <Loading />;
  if (state.s === "bad")
    return (
      <ErrorText>
        このURLは読み取れませんでした。送られてきたURL（またはQRコード）を、最後まで省略せずに開き直してください。
      </ErrorText>
    );

  return (
    <LineupWorkbench
      lineup={lineup}
      onChange={change}
      players={state.players}
      teams={state.teams}
      top={
        <p className="share-note print:hidden">
          ログインなしで使えるメンバー表です。<b>アプリには保存されません</b>
          （途中まではこのスマホに残ります）。できあがったら「③ メンバー表」から画像・PDFで送ってください。
        </p>
      }
      bottom={
        <div className="mt-6 print:hidden">
          <SecondaryButton
            danger
            onClick={() => {
              if (!window.confirm("守備・打順・控えを全部消して、最初からやり直します。よろしいですか？")) return;
              change(blank());
            }}
          >
            最初からやり直す
          </SecondaryButton>
        </div>
      }
    />
  );
}
