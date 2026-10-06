"use client";

// 活動予定の新規作成画面です。

import { useRouter } from "next/navigation";
import { ActivityEditor } from "@/components/ActivityEditor";
import { PageHead } from "@/components/ui";
import { createActivity, defaultDivisions, newGroup, todayString } from "@/lib/activities";

export default function NewActivityPage() {
  const router = useRouter();
  const date = todayString();

  return (
    <>
      <PageHead kicker="NEW" title="予定を追加" />
      <ActivityEditor
        isNew
        initial={{ date, note: "", groups: defaultDivisions(date).map((k) => newGroup(k, date)) }}
        onSave={async (a) => {
          const id = await createActivity({ date: a.date, note: a.note, groups: a.groups });
          router.push(`/activities/${id}?saved=1`);
        }}
      />
    </>
  );
}
