"use client";

import { AuthProvider, useAuth } from "@/components/AuthProvider";

function BallMark({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
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

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-6 w-6" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Header() {
  return (
    <header className="bg-navy px-5 pb-8 pt-10 text-white">
      <div className="flex items-center gap-3">
        <BallMark />
        <div>
          <h1 className="text-2xl font-extrabold tracking-wide">桜・浅羽野・住吉</h1>
          <p className="text-sm text-white/75">予定・活動管理</p>
        </div>
      </div>
    </header>
  );
}

function LoginCard() {
  const { signIn, error } = useAuth();
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-navy/5">
      <h2 className="text-lg font-extrabold">ログイン</h2>
      <p className="mt-1 text-sm text-navy-soft/80">
        登録されたスタッフのGoogleアカウントでログインしてください。
      </p>
      <button
        type="button"
        onClick={signIn}
        className="mt-5 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 text-base font-bold ring-2 ring-navy/15 active:bg-field"
      >
        <GoogleMark />
        Googleでログイン
      </button>
      {error && (
        <p className="mt-4 rounded-lg bg-ng/10 p-3 text-sm font-bold text-ng" role="alert">
          ■ {error}
        </p>
      )}
    </div>
  );
}

function WelcomeCard() {
  const { user, logOut } = useAuth();
  if (!user) return null;
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-navy/5">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-3 py-1 text-sm font-bold text-ok ring-1 ring-ok/30">
        <span aria-hidden>●</span>ログイン中
      </p>
      <h2 className="mt-3 text-xl font-extrabold">
        {user.displayName ?? "スタッフ"} さん、こんにちは
      </h2>
      <p className="mt-1 break-all text-sm text-navy-soft/80">{user.email}</p>
      <p className="mt-4 text-sm text-navy-soft/80">
        STEP2（Googleログイン）の確認画面です。次のSTEP3で、登録したスタッフだけが入れるようにします。
      </p>
      <button
        type="button"
        onClick={logOut}
        className="mt-5 min-h-12 w-full rounded-xl bg-field px-4 text-base font-bold ring-1 ring-navy/10 active:bg-navy/10"
      >
        ログアウト
      </button>
    </div>
  );
}

function Screen() {
  const { user, loading } = useAuth();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <Header />
      <section className="-mt-4 px-4">
        {loading ? (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-navy-soft/70 shadow-sm ring-1 ring-navy/5">
            読み込み中…
          </div>
        ) : user ? (
          <WelcomeCard />
        ) : (
          <LoginCard />
        )}
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <Screen />
    </AuthProvider>
  );
}
