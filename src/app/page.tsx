"use client";

// ホーム画面です。
// 一番上に「次の活動」を大きく、その下に「このあとの予定」を並べます。

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityCard } from "@/components/ActivityCard";
import { ErrorText } from "@/components/ui";
import { divisionLabel, listUpcoming, missingFields, type Activity } from "@/lib/activities";

export default function Home() {
  const [upcoming, setUpcoming] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todo, setTodo] = useState<Activity[]>([]);

  useEffect(() => {
    listUpcoming()
      .then((list) => {
        setUpcoming(list.slice(0, 4));
        setTodo(list.slice(0, 12));
      })
      .catch(() => setError("予定を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, []);

  const [next, ...rest] = upcoming ?? [];

  // 近い予定のうち、まだ決まっていない項目
  const missing = todo
    .flatMap((a) =>
      a.groups.map((g) => ({
        a,
        label: a.groups.length > 1 || g.division !== "main" ? divisionLabel(g.division) : "",
        items: missingFields(g),
      })),
    )
    .filter((x) => x.items.length > 0);

  return (
    <>
      {error && <ErrorText>{error}</ErrorText>}
      {!upcoming && !error && <p className="py-10 text-center text-sm text-navy-soft">読み込み中…</p>}

      {upcoming && upcoming.length === 0 && (
        <section className="rounded-[14px] border border-rule bg-white p-6 text-center">
          <p className="text-base font-bold">これからの予定はまだありません</p>
          <p className="mt-1 text-sm text-navy-soft">次の練習や試合を登録すると、ここに表示されます。</p>
          <Link
            href="/activities/new"
            className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-navy px-4 text-base font-bold text-white active:opacity-90"
          >
            予定を追加する
          </Link>
        </section>
      )}

      {missing.length > 0 && (
        <section className="todo" aria-labelledby="todo-title">
          <p className="todo__head" id="todo-title">
            <span className="tile">{missing.length}</span>
            まだ決まっていないこと
          </p>
          <ul>
            {missing.slice(0, 4).map((m, i) => (
              <li key={i}>
                <Link href={`/activities/${m.a.id}`}>
                  <b>
                    {Number(m.a.date.slice(5, 7))}/{Number(m.a.date.slice(8))}
                  </b>
                  <span>
                    {m.label && `${m.label}：`}
                    {m.items.join("・")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {next && (
        <section className="flex flex-col gap-2" aria-labelledby="next-title">
          <div className="section-head">
            <h2 id="next-title">次の活動</h2>
          </div>
          <ActivityCard activity={next} featured />
        </section>
      )}

      {rest.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="rest-title">
          <div className="section-head mt-2">
            <h2 id="rest-title">このあとの予定</h2>
            <Link href="/activities">すべて見る</Link>
          </div>
          <ul className="flex flex-col gap-2.5">
            {rest.map((a) => (
              <li key={a.id}>
                <ActivityCard activity={a} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
