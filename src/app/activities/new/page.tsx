"use client";

// 活動予定の新規作成画面です。
// 「?date=2026-11-03」が付いていたら、その日で作ります（予備日の日を一覧から開いたときなど）。

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivityEditor } from "@/components/ActivityEditor";
import { PageHead } from "@/components/ui";
import { createActivity, defaultDivisions, newGroup, todayString } from "@/lib/activities";

export default function NewActivityPage() {
  const router = useRouter();
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date") ?? "";
    setDate(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayString());
  }, []);

  return (
    <>
      <PageHead kicker="NEW" title="予定を追加" />
      {date && (
        <ActivityEditor
          key={date}
          isNew
          initial={{ date, note: "", groups: defaultDivisions(date).map((k) => newGroup(k, date)) }}
          onSave={async (a) => {
            const id = await createActivity({
              date: a.date,
              note: a.note,
              groups: a.groups,
              ...(a.reserveStatus ? { reserveStatus: a.reserveStatus } : {}),
            });
            router.push(`/activities/${id}?saved=1`);
          }}
        />
      )}
    </>
  );
}
