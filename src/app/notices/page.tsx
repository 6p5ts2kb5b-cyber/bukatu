"use client";

// 大会・練習試合の連絡（送付書）の一覧と新規作成の画面です。
// 新しく作るときは、種類（大会／練習試合2チーム／3チーム）と予定を選びます。
// 発信元や連絡事項は前回の送付書から引き継ぎ、練習試合は試合順と審判をひな形で入れます。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, Choices, ErrorText, Field, inputClass, Loading, PageHead, PrimaryButton, ToggleButton } from "@/components/ui";
import { formatDate, isMatchType, listUpcoming, type Activity } from "@/lib/activities";
import {
  activityOpponents,
  applyActivity,
  createNotice,
  fillUmpires,
  fromPrevious,
  OUR_TEAM,
  listNotices,
  NOTICE_KINDS,
  practiceGames,
  type Notice,
  type NoticeKind,
} from "@/lib/notices";

export default function NoticesPage() {
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [matches, setMatches] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<NoticeKind>("tournament");
  const [opp, setOpp] = useState(["", ""]);

  useEffect(() => {
    listNotices()
      .then(setNotices)
      .catch(() => setError("送付書を読み込めませんでした。電波の良い場所で開き直してください。"));
    listUpcoming()
      .then((list) => setMatches(list.filter((a) => a.groups.some((g) => isMatchType(g.type)))))
      .catch(() => {});
  }, []);

  // 予定を選んだら、そのまま作る（種類・相手・試合順・審判は予定から自動）
  const createFrom = async (a: Activity) => {
    setSaving(true);
    try {
      const draft = applyActivity(fromPrevious(notices?.[0] ?? null), a);
      const id = await createNotice(draft);
      router.push(`/notices/${id}`);
    } catch {
      setError("作成できませんでした。");
      setSaving(false);
    }
  };

  const create = async (copy?: Notice) => {
    setSaving(true);
    try {
      let draft = fromPrevious(notices?.[0] ?? null);
      if (copy) {
        const { id, ...rest } = copy;
        void id;
        draft = { ...rest, issueDate: draft.issueDate };
      } else {
        draft.kind = kind;
        if (kind !== "tournament") {
          const [a, b] = opp.map((x) => x.trim());
          const teams = (kind === "practice2" ? [a] : [a, b]).filter(Boolean);
          draft.subject = "練習試合";
          draft.teams = [OUR_TEAM, ...teams];
          draft.games = fillUmpires(kind, practiceGames(kind, a, b), draft.teams);
          if (teams.length) draft.to = `${teams.join("・")}　代表者`;
        }
      }
      const id = await createNotice(draft);
      router.push(`/notices/${id}`);
    } catch {
      setError("作成できませんでした。");
      setSaving(false);
    }
  };

  const kindLabel = (k: NoticeKind) => NOTICE_KINDS.find((x) => x.key === k)?.short ?? "";

  return (
    <>
      <PageHead
        kicker="NOTICE"
        title="試合の連絡（送付書）"
        lead="相手チームへの送付書と、保護者へのLINE文を作ります。PDFにしてLINEで送れます。"
      />

      {creating ? (
        <Card>
          <div className="flex flex-col gap-3">
            <p className="m-0 text-lg font-extrabold">どの試合の連絡ですか？</p>
            <p className="f-hint m-0">
              予定を押すと、すぐに作ります。期日・会場・相手チーム・試合順・審判は予定から入るので、入力はほとんどいりません。
            </p>
            {matches.length === 0 && <p className="text-sm font-bold text-navy-soft">これからの試合の予定はありません。</p>}
            <ul className="list">
              {matches.map((a) => {
                const g = a.groups.find((x) => isMatchType(x.type))!;
                const opps = activityOpponents(a);
                return (
                  <li key={a.id}>
                    <button type="button" className="row" disabled={saving} onClick={() => createFrom(a)}>
                      <span className="row__main">
                        <span className="row__sub">{formatDate(a.date)}</span>
                        <span className="row__title">{g.tournamentName || g.type}</span>
                        <span className="tags">
                          {opps.length > 0 && <span className="tag">vs {opps.join("・")}</span>}
                          {g.games.length > 0 && <span className="tag">{g.games.length}試合</span>}
                        </span>
                      </span>
                      <span className="row__chev" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>

            <details className="manual">
              <summary>予定にない試合の連絡を作る</summary>
              <div className="mt-3 flex flex-col gap-4">
                <Choices cols={1}>
                  {NOTICE_KINDS.map((k) => (
                    <ToggleButton key={k.key} small on={kind === k.key} label={k.label} onClick={() => setKind(k.key)} />
                  ))}
                </Choices>
                {kind !== "tournament" && (
                  <>
                    <Field label={kind === "practice3" ? "相手チーム1" : "相手チーム"}>
                      <input
                        className={inputClass}
                        value={opp[0]}
                        onChange={(e) => setOpp([e.target.value, opp[1]])}
                        placeholder="例：坂戸中"
                        autoComplete="off"
                      />
                    </Field>
                    {kind === "practice3" && (
                      <Field label="相手チーム2">
                        <input
                          className={inputClass}
                          value={opp[1]}
                          onChange={(e) => setOpp([opp[0], e.target.value])}
                          placeholder="例：鶴ヶ島中"
                          autoComplete="off"
                        />
                      </Field>
                    )}
                  </>
                )}
                <PrimaryButton onClick={() => create()} disabled={saving}>
                  {saving ? "作成中…" : "作成する"}
                </PrimaryButton>
              </div>
            </details>
            <button type="button" className="text-sm font-bold text-navy-soft underline" onClick={() => setCreating(false)}>
              やめる
            </button>
          </div>
        </Card>
      ) : (
        <PrimaryButton onClick={() => setCreating(true)}>＋ 新しく作る</PrimaryButton>
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
                <span className="tags">
                  <span className={`tag ${n.kind === "tournament" ? "tag--red" : ""}`}>{kindLabel(n.kind)}</span>
                  {n.to && <span className="tag">{n.to.replace(/\s*代表者.*$/, "")}宛て</span>}
                </span>
              </span>
              <span className="row__chev" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => create(n)}
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
