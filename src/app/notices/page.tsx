"use client";

// 大会の連絡（送付書）の一覧と新規作成の画面です。
// 新しく作るときは、前回の送付書から発信元や連絡事項を引き継ぎ、
// 選んだ予定（試合の日）から件名・期日・会場・試合順を入れます。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, ErrorText, Loading, PageHead, PrimaryButton, SecondaryButton } from "@/components/ui";
import { formatDate, isMatchType, listUpcoming, type Activity } from "@/lib/activities";
import { applyActivity, createNotice, fromPrevious, listNotices, type Notice } from "@/lib/notices";

export default function NoticesPage() {
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [matches, setMatches] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listNotices()
      .then(setNotices)
      .catch(() => setError("送付書を読み込めませんでした。電波の良い場所で開き直してください。"));
    listUpcoming()
      .then((list) => setMatches(list.filter((a) => a.groups.some((g) => isMatchType(g.type)))))
      .catch(() => {});
  }, []);

  const create = async (from: { activity?: Activity; copy?: Notice }) => {
    setSaving(true);
    try {
      let draft = fromPrevious(notices?.[0] ?? null);
      if (from.copy) {
        const { id: _id, ...rest } = from.copy;
        void _id;
        draft = { ...rest, issueDate: draft.issueDate };
      }
      if (from.activity) draft = applyActivity(draft, from.activity);
      const id = await createNotice(draft);
      router.push(`/notices/${id}`);
    } catch {
      setError("作成できませんでした。");
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead
        kicker="NOTICE"
        title="大会の連絡（送付書）"
        lead="相手チーム・自チームへの送付書を作り、PDFにしてLINEで送ります。"
      />

      {creating ? (
        <Card>
          <div className="flex flex-col gap-3">
            <p className="f-label m-0">どの予定の送付書ですか？</p>
            <p className="f-hint m-0">
              選ぶと、件名・期日・会場・試合順が入ります。発信元や連絡事項は前回の送付書から引き継ぎます。
            </p>
            {matches.length === 0 && <p className="text-sm font-bold text-navy-soft">試合の予定はまだありません。</p>}
            <ul className="list">
              {matches.map((a) => {
                const g = a.groups.find((x) => isMatchType(x.type))!;
                return (
                  <li key={a.id}>
                    <button type="button" className="row" disabled={saving} onClick={() => create({ activity: a })}>
                      <span className="row__main">
                        <span className="row__sub">{formatDate(a.date)}</span>
                        <span className="row__title">{g.tournamentName || g.type}</span>
                        {g.venue && <span className="row__sub">{g.venue}</span>}
                      </span>
                      <span className="row__chev" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
            <SecondaryButton onClick={() => create({})}>予定を使わずに作る</SecondaryButton>
            <button type="button" className="text-sm font-bold text-navy-soft underline" onClick={() => setCreating(false)}>
              やめる
            </button>
          </div>
        </Card>
      ) : (
        <PrimaryButton onClick={() => setCreating(true)}>＋ 新しい送付書を作る</PrimaryButton>
      )}

      {error && <ErrorText>{error}</ErrorText>}
      {!notices && !error && <Loading />}
      {notices && notices.length === 0 && (
        <p className="py-4 text-center text-sm text-navy-soft">送付書はまだありません。</p>
      )}

      {notices && notices.length > 0 && <p className="group-label">これまでの送付書</p>}
      <ul className="list">
        {notices?.map((n) => (
          <li key={n.id}>
            <Link href={`/notices/${n.id}`} className="row">
              <span className="row__main">
                <span className="row__sub">{n.date ? formatDate(n.date) : "期日未定"}</span>
                <span className="row__title">{n.subject || "（件名なし）"}</span>
                {n.to && <span className="row__sub">送付先：{n.to}</span>}
              </span>
              <span className="row__chev" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => create({ copy: n })}
              disabled={saving}
              className="w-full border-t border-dashed border-rule py-2.5 text-xs font-bold text-navy-soft active:bg-field"
            >
              コピーして別のチーム宛てを作る
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
