"use client";

// 大会運営：大会の一覧と新規作成（1日目のリーグ戦を、うちが出ないブロックも打ち込む）

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, ErrorText, Field, inputClass, Loading, PageHead, PrimaryButton, ToggleButton, Choices } from "@/components/ui";
import { formatDate, todayString } from "@/lib/activities";
import { blockView } from "@/lib/league";
import { blankTournament, createOps, listOps, type OpsTournament } from "@/lib/ops";
import type { LeagueRule } from "@/lib/league";
import { useRole } from "@/components/AppShell";
import { addOpsStaff, listOpsStaff, removeOpsStaff, type OpsMember } from "@/lib/opsStaff";

// 大会運営の名簿（スタッフだけが見て、足したり消したりできる）
function OpsRoster() {
  const [list, setList] = useState<OpsMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const load = () =>
    listOpsStaff()
      .then(setList)
      .catch(() => setMsg("名簿を読み込めませんでした。"));
  useEffect(() => {
    load();
  }, []);
  const add = async () => {
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return setMsg("Googleのメールアドレスを入れてください。");
    setMsg("");
    try {
      await addOpsStaff(e, name || e);
      setEmail("");
      setName("");
      load();
    } catch {
      setMsg("追加できませんでした。");
    }
  };
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <h2 className="panel__title">大会運営の名簿（入力できる人）</h2>
        <p className="f-hint m-0">
          ここに入れた人は、Googleでログインすると「大会運営」の画面だけが使えます（予定・選手名簿などは見えません）。スタッフ名簿の人は、ここに入れなくても使えます。
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="氏名（例：山田 先生）" autoComplete="off" />
          <input
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Gmailアドレス"
            type="email"
            autoComplete="off"
          />
          <button type="button" className="btn btn--ghost" onClick={add}>
            追加
          </button>
        </div>
        {msg && <p className="m-0 text-sm font-bold text-ng">{msg}</p>}
        {list && list.length === 0 && <p className="m-0 text-sm text-navy-soft">まだだれもいません。</p>}
        <ul className="flex flex-col gap-1.5">
          {list?.map((m) => (
            <li key={m.email} className="flex items-center gap-2 rounded-xl border border-rule bg-[#f7f9f5] px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold">{m.name}</span>
                <span className="block truncate text-xs text-navy-soft">{m.email}</span>
              </span>
              <button
                type="button"
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold text-ng"
                onClick={async () => {
                  if (!window.confirm(`${m.name}を名簿から外しますか？`)) return;
                  await removeOpsStaff(m.email);
                  load();
                }}
              >
                外す
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export default function OpsListPage() {
  const router = useRouter();
  const role = useRole();
  const [list, setList] = useState<OpsTournament[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayString());
  const [rule, setRule] = useState<LeagueRule>("storm");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listOps()
      .then(setList)
      .catch(() => setError("大会を読み込めませんでした。電波の良い場所で開き直してください。"));
  }, []);

  const create = async () => {
    setSaving(true);
    try {
      const id = await createOps({
        ...blankTournament(),
        name: name.trim() || (rule === "storm" ? "STORM杯 1日目" : "JJBF大会 1日目"),
        date,
        rule,
      });
      router.push(`/ops/${id}`);
    } catch {
      setError("作成できませんでした。");
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead
        kicker="OPERATION"
        title="大会運営（リーグ戦）"
        lead="1日目のリーグ戦を、うちが出ないブロックも含めて打ち込み、順位と2日目に進むチームを運営に送ります。"
      />
      {creating ? (
        <Card>
          <div className="flex flex-col gap-4">
            <Field label="順位の決め方">
              <Choices cols={2}>
                <ToggleButton on={rule === "storm"} label="STORM杯" onClick={() => setRule("storm")} />
                <ToggleButton on={rule === "jjbf"} label="JJBF大会" onClick={() => setRule("jjbf")} />
              </Choices>
            </Field>
            <Field label="大会名">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={rule === "storm" ? "例：第13回STORM杯 1日目" : "例：第47回JJBF埼玉県大会 1日目"}
                autoComplete="off"
              />
            </Field>
            <Field label="日付">
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <PrimaryButton onClick={create} disabled={saving}>
              {saving ? "作成中…" : "作成してブロックを入れる"}
            </PrimaryButton>
          </div>
        </Card>
      ) : (
        <PrimaryButton onClick={() => setCreating(true)}>＋ 新しい大会</PrimaryButton>
      )}

      {error && <ErrorText>{error}</ErrorText>}
      {!list && !error && <Loading />}
      {list && list.length === 0 && <p className="py-4 text-center text-sm text-navy-soft">大会はまだありません。</p>}

      <ul className="list">
        {list?.map((t) => {
          const done = t.blocks.filter((b) => blockView(b.games, t.rule)?.final?.top).length;
          return (
            <li key={t.id}>
              <Link href={`/ops/${t.id}`} className="row">
                <span className="row__main">
                  <span className="row__sub">{t.date ? formatDate(t.date) : ""}</span>
                  <span className="row__title">{t.name}</span>
                  <span className="tags">
                    <span className="tag">{t.rule === "storm" ? "STORM杯の決まり" : "JJBFの決まり"}</span>
                    <span className={`tag ${done === t.blocks.length && done > 0 ? "tag--ok" : ""}`}>
                      1位決定 {done}/{t.blocks.length}ブロック
                    </span>
                  </span>
                </span>
                <span className="row__chev" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      {role === "staff" && <OpsRoster />}
    </>
  );
}
