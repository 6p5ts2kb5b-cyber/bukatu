"use client";

// 動静表（長期休み）の一覧と新規作成（スタッフ）

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, ErrorText, Field, inputClass, Loading, PageHead, PrimaryButton } from "@/components/ui";
import { formatDate, listRange } from "@/lib/activities";
import { listPlayers } from "@/lib/players";
import { listTeams } from "@/lib/teams";
import {
  createTerm,
  datesBetween,
  defaultPeriod,
  KIND_LABEL,
  listTerms,
  type DoseiDay,
  type DoseiKind,
  type DoseiMember,
  type DoseiTerm,
} from "@/lib/dosei";

const DEFAULT_MESSAGE =
  "休み中の部活動の出欠と、緊急連絡先を入れてください。\n欠席・遅刻・早退がある日だけ選んでください（何も選ばない日は出席です）。";

export default function DoseiListPage() {
  const router = useRouter();
  const [list, setList] = useState<DoseiTerm[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<DoseiKind>("winter");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listTerms()
      .then(setList)
      .catch(() => setError("動静表を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, []);

  const pickKind = (k: DoseiKind) => {
    setKind(k);
    const p = defaultPeriod(k);
    setTitle(p.title);
    setStart(p.start);
    setEnd(p.end);
  };
  // 次に来る休みを最初に選んでおく（10〜12月は冬、1〜3月は春、4〜7月は夏）
  const startCreate = () => {
    const m = new Date().getMonth() + 1;
    pickKind(m >= 10 ? "winter" : m <= 3 ? "spring" : m <= 7 ? "summer" : "winter");
    setCreating(true);
  };

  const days = datesBetween(start, end);

  const create = async () => {
    if (days.length === 0) return setError("期間（はじめ・おわり）を確かめてください。");
    setSaving(true);
    setError("");
    try {
      const [players, teams, acts] = await Promise.all([listPlayers(), listTeams(), listRange(start, end).catch(() => [])]);
      const teamOf = new Map(teams.map((t) => [t.id, t]));
      const members: DoseiMember[] = players
        .filter((p) => p.active)
        .sort(
          (a, b) =>
            (teamOf.get(a.teamId)?.order ?? 99) - (teamOf.get(b.teamId)?.order ?? 99) ||
            b.grade - a.grade ||
            (Number(a.number) || 999) - (Number(b.number) || 999),
        )
        .map((p) => ({ id: p.id, name: p.name, number: p.number, school: teamOf.get(p.teamId)?.shortName ?? "", grade: p.grade }));
      // その日の予定（アプリの予定の写し。例「練習 9:00〜12:00」）
      const plan = new Map<string, string>();
      for (const a of acts) {
        const g = a.groups[0];
        if (!g) continue;
        const time = g.startTime ? ` ${g.startTime}〜${g.endTime}` : "";
        plan.set(a.date, `${g.type === "公式戦" || g.type === "大会" ? g.tournamentName || g.type : g.type}${time}`);
      }
      const dayList: DoseiDay[] = days.map((d) => ({ date: d, plan: plan.get(d) ?? "" }));
      const id = await createTerm({
        kind,
        title: title.trim() || KIND_LABEL[kind],
        start,
        end,
        message: message.trim(),
        members,
        days: dayList,
        open: true,
      });
      router.push(`/dosei/${id}`);
    } catch {
      setError("作成できませんでした。");
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead
        kicker="ATTENDANCE"
        title="動静表（長期休み）"
        lead="春休み・夏休み・冬休みの出欠と緊急連絡先を、保護者・生徒がURL（QRコード）から記入します。"
      />
      {creating ? (
        <Card>
          <div className="flex flex-col gap-4">
            <Field label="休み">
              <div className="picks">
                {(["spring", "summer", "winter"] as DoseiKind[]).map((k) => (
                  <button key={k} type="button" className="pick" aria-pressed={kind === k} onClick={() => pickKind(k)}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="名前">
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="はじめ">
                <input type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="おわり">
                <input type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
            <p className="f-hint -mt-2 mb-0">
              {days.length ? `${formatDate(start)}〜${formatDate(end)}（${days.length}日間）。` : ""}
              アプリの予定（練習・休みなど）も、日付の横に出ます。
            </p>
            <Field label="保護者・生徒への連絡（記入ページの上に出ます）">
              <textarea className={`${inputClass} ds-area`} value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
            </Field>
            <PrimaryButton onClick={create} disabled={saving}>
              {saving ? "作成中…" : "作成してURL・QRコードを出す"}
            </PrimaryButton>
            <p className="f-hint m-0">いまの選手名簿（在籍中の選手）が、記入ページの名前の一覧になります。</p>
          </div>
        </Card>
      ) : (
        <PrimaryButton onClick={startCreate}>＋ 新しい動静表</PrimaryButton>
      )}

      {error && <ErrorText>{error}</ErrorText>}
      {!list && !error && <Loading />}
      {list && list.length === 0 && <p className="py-4 text-center text-sm text-navy-soft">動静表はまだありません。</p>}
      <ul className="list">
        {list?.map((t) => (
          <li key={t.id}>
            <Link href={`/dosei/${t.id}`} className="row">
              <span className="row__main">
                <span className="row__sub">
                  {formatDate(t.start)}〜{formatDate(t.end)}
                </span>
                <span className="row__title">{t.title}</span>
                <span className="tags">
                  <span className="tag">{KIND_LABEL[t.kind]}</span>
                  <span className={`tag ${t.open ? "tag--ok" : ""}`}>{t.open ? "受付中" : "受付終了"}</span>
                  <span className="tag">{t.members.length}人</span>
                </span>
              </span>
              <span className="row__chev" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
