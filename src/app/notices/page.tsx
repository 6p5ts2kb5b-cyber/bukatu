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
  fromPrevious,
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
  const [picked, setPicked] = useState<Activity | null>(null);
  const [opp, setOpp] = useState(["", ""]);

  useEffect(() => {
    listNotices()
      .then(setNotices)
      .catch(() => setError("送付書を読み込めませんでした。電波の良い場所で開き直してください。"));
    listUpcoming()
      .then((list) => setMatches(list.filter((a) => a.groups.some((g) => isMatchType(g.type)))))
      .catch(() => {});
  }, []);

  const pick = (a: Activity | null) => {
    setPicked(a);
    if (!a) return;
    const g = a.groups.find((x) => isMatchType(x.type));
    const names = activityOpponents(a);
    setOpp([names[0] ?? "", names[1] ?? ""]);
    // 予定の種類から送付書の種類を決める
    if (g?.type === "練習試合") setKind(names.length >= 2 ? "practice3" : "practice2");
    else if (g) setKind("tournament");
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
        if (picked) draft = applyActivity(draft, picked);
        if (kind !== "tournament") {
          const [a, b] = opp.map((x) => x.trim());
          draft.subject = draft.subject && draft.subject !== "練習試合" ? draft.subject : "練習試合";
          draft.games = practiceGames(kind, a, b);
          const teams = (kind === "practice2" ? [a] : [a, b]).filter(Boolean);
          if (teams.length) draft.to = `${teams.join("・")}　代表者`;
          draft.reserveDate = "";
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
          <div className="flex flex-col gap-5">
            <div>
              <span className="f-label">種類</span>
              <Choices cols={1}>
                {NOTICE_KINDS.map((k) => (
                  <ToggleButton key={k.key} on={kind === k.key} label={k.label} onClick={() => setKind(k.key)} />
                ))}
              </Choices>
            </div>

            <div>
              <span className="f-label">予定から読み込む（任意）</span>
              <span className="f-hint mb-2 block mt-0">
                選ぶと、期日・会場・大会名・相手チームが入ります。
              </span>
              {matches.length === 0 && <p className="text-sm font-bold text-navy-soft">試合の予定はまだありません。</p>}
              <div className="filters" style={{ flexWrap: "wrap" }}>
                <button type="button" className="filter" aria-pressed={!picked} onClick={() => pick(null)}>
                  使わない
                </button>
                {matches.map((a) => {
                  const g = a.groups.find((x) => isMatchType(x.type))!;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="filter"
                      aria-pressed={picked?.id === a.id}
                      onClick={() => pick(a)}
                    >
                      {formatDate(a.date)} {g.tournamentName || g.type}
                    </button>
                  );
                })}
              </div>
            </div>

            {kind !== "tournament" && (
              <div className="flex flex-col gap-3">
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
                <p className="f-hint m-0">
                  {kind === "practice3"
                    ? "試合順：うち対1 → 1対2 → 2対うち。審判は休みのチームが担当するひな形で入ります（あとで変えられます）。"
                    : "試合順：うち対相手 → 相手対うち の2試合で入ります（あとで変えられます）。"}
                </p>
              </div>
            )}

            <PrimaryButton onClick={() => create()} disabled={saving}>
              {saving ? "作成中…" : "作成する"}
            </PrimaryButton>
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
