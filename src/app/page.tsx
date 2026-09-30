import { checkSupabase } from "@/lib/supabase-status";

// 開くたびに最新の接続状態を確認する
export const dynamic = "force-dynamic";

type Tone = "ok" | "warn" | "ng";

const toneStyle: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok ring-ok/30",
  warn: "bg-warn/15 text-[#8a6500] ring-warn/40",
  ng: "bg-ng/10 text-ng ring-ng/30",
};

const toneMark: Record<Tone, string> = { ok: "●", warn: "▲", ng: "■" };

function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ring-1 ${toneStyle[tone]}`}
    >
      <span aria-hidden>{toneMark[tone]}</span>
      {label}
    </span>
  );
}

function StatusRow({
  title,
  tone,
  label,
  detail,
}: {
  title: string;
  tone: Tone;
  label: string;
  detail?: string;
}) {
  return (
    <li className="flex flex-col gap-1 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-bold">{title}</span>
        <StatusBadge tone={tone} label={label} />
      </div>
      {detail && <p className="text-sm text-navy-soft/80">{detail}</p>}
    </li>
  );
}

function BallMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden>
      <circle cx="24" cy="24" r="21" fill="#fff" />
      <path
        d="M11 9c6 6 6 24 0 30M37 9c-6 6-6 24 0 30"
        fill="none"
        stroke="#d62839"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="2 3.2"
      />
    </svg>
  );
}

export default async function Home() {
  const supabase = await checkSupabase();

  const supabaseRow =
    supabase.state === "ok"
      ? { tone: "ok" as Tone, label: "確定", detail: "データの保存場所とつながっています" }
      : supabase.state === "missing"
        ? {
            tone: "warn" as Tone,
            label: "未設定",
            detail: `Vercelの環境変数が未設定です：${supabase.missing.join("、")}`,
          }
        : { tone: "ng" as Tone, label: "エラー", detail: supabase.message };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="bg-navy px-5 pb-8 pt-10 text-white">
        <div className="flex items-center gap-3">
          <BallMark />
          <div>
            <h1 className="text-2xl font-extrabold tracking-wide">STORMクラブ</h1>
            <p className="text-sm text-white/75">予定・活動管理</p>
          </div>
        </div>
      </header>

      <section className="-mt-4 px-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy/5">
          <h2 className="text-lg font-extrabold">STEP1 動作確認</h2>
          <p className="mt-1 text-sm text-navy-soft/80">
            この画面が見えていれば、アプリはインターネットに公開されています。
          </p>
          <ul className="mt-2 divide-y divide-navy/10">
            <StatusRow
              title="アプリの公開"
              tone="ok"
              label="確定"
              detail="Vercelで動いています"
            />
            <StatusRow title="Supabase接続" {...supabaseRow} />
          </ul>
        </div>
      </section>

      <p className="px-6 py-8 text-center text-sm text-navy-soft/70">
        次のSTEP2で、Googleログインを追加します。
      </p>
    </main>
  );
}
