"use client";

// 活動予定の詳細・編集画面です。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ActivityEditor } from "@/components/ActivityEditor";
import { ErrorText, SecondaryButton, Toast, PageHead } from "@/components/ui";
import { deleteActivity, getActivity, saveActivity, type Activity } from "@/lib/activities";

export default function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activity, setActivity] = useState<Activity | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // 保存後に入力欄を最新の内容で作り直すため
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    getActivity(id)
      .then(setActivity)
      .catch(() => setError("予定を読み込めませんでした。電波の良い場所で開き直してください。"));
    // 新規登録の直後なら「登録しました」を出す
    if (window.location.search.includes("saved=1")) {
      setToast("登録しました");
      window.history.replaceState(null, "", `/activities/${id}`);
    }
  }, [id]);

  const remove = async () => {
    if (!activity) return;
    if (!window.confirm("この予定を削除します。元に戻せません。よろしいですか？")) return;
    try {
      await deleteActivity(activity.id);
      router.push("/activities");
    } catch {
      setError("削除できませんでした。");
    }
  };

  if (error) return <ErrorText>{error}</ErrorText>;
  if (activity === undefined) {
    return <p className="py-6 text-center text-sm text-navy-soft/70">読み込み中…</p>;
  }
  if (activity === null) {
    return (
      <>
        <ErrorText>この予定は見つかりませんでした（削除された可能性があります）。</ErrorText>
        <Link href="/activities" className="text-center font-bold underline">
          予定一覧に戻る
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHead
        kicker="EDIT"
        title="予定の編集"
        action={
          <Link href="/activities" className="btn btn--ghost btn--small shrink-0">
            一覧へ
          </Link>
        }
      />
      <ActivityEditor
        key={version}
        isNew={false}
        initial={activity}
        onSave={async (a) => {
          const next = { ...activity, ...a, id: activity.id };
          await saveActivity(next);
          setActivity(next);
          setVersion((v) => v + 1);
          setToast("保存しました");
        }}
      />
      <div className="mt-6">
        <SecondaryButton danger onClick={remove}>この予定を削除する</SecondaryButton>
      </div>
      <Toast message={toast} onDone={clearToast} />
    </>
  );
}
