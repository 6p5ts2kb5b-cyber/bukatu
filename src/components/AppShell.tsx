"use client";

// アプリ全体の「枠」です。
//   1. ログインしていなければ、ログイン画面を出す
//   2. ログインしていても、スタッフ名簿に無ければ入れない
//   3. 名簿に載っていれば、見出し・中身・画面下のボタンを表示する

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { checkAccess, type Staff } from "@/lib/staff";

const MeContext = createContext<Staff | null>(null);

export function useMe(): Staff {
  const me = useContext(MeContext);
  if (!me) throw new Error("ログイン前にuseMeが使われました");
  return me;
}

export function BallMark({ className = "h-11 w-11" }: { className?: string }) {
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

function Header({ small = false }: { small?: boolean }) {
  return (
    <header className={`bg-navy px-5 text-white ${small ? "pb-5 pt-6" : "pb-8 pt-10"}`}>
      <div className="flex items-center gap-3">
        <BallMark className={small ? "h-9 w-9" : "h-11 w-11"} />
        <div>
          <h1 className={`${small ? "text-xl" : "text-2xl"} font-extrabold tracking-wide`}>
            桜・浅羽野・住吉
          </h1>
          <p className="text-sm text-white/75">予定・活動管理</p>
        </div>
      </div>
    </header>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-navy/5">{children}</div>
  );
}

function LoginScreen() {
  const { signIn, error } = useAuth();
  return (
    <Card>
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
    </Card>
  );
}

function DeniedScreen({ message }: { message?: string }) {
  const { user, logOut } = useAuth();
  return (
    <Card>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-ng/10 px-3 py-1 text-sm font-bold text-ng ring-1 ring-ng/30">
        <span aria-hidden>■</span>未登録
      </p>
      <h2 className="mt-3 text-lg font-extrabold">このアカウントは登録されていません</h2>
      <p className="mt-2 break-all text-sm text-navy-soft/80">{user?.email}</p>
      <p className="mt-3 text-sm text-navy-soft/80">
        {message ??
          "スタッフ名簿に登録されたアカウントだけが使えます。管理している方に、このメールアドレスの登録を頼んでください。別のアカウントで入る場合は、いったんログアウトしてください。"}
      </p>
      <button
        type="button"
        onClick={logOut}
        className="mt-5 min-h-12 w-full rounded-xl bg-field px-4 text-base font-bold ring-1 ring-navy/10 active:bg-navy/10"
      >
        ログアウト
      </button>
    </Card>
  );
}

const NAV = [
  { href: "/", label: "ホーム", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  {
    href: "/activities",
    label: "予定",
    icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  },
  { href: "/activities/new", label: "＋予定", icon: "M12 5v14M5 12h14", primary: true },
  {
    href: "/menu",
    label: "メニュー",
    icon: "M4 6h16M4 12h16M4 18h16",
  },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/activities") return pathname.startsWith("/activities") && pathname !== "/activities/new";
  if (href === "/menu") return ["/menu", "/teams", "/staff"].some((p) => pathname.startsWith(p));
  return pathname === href;
}

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-navy/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-xl">
        {NAV.map((n) => {
          const active = isActive(n.href, pathname);
          return (
            <li key={n.href} className="flex-1">
              <Link
                href={n.href}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-bold ${
                  n.primary ? "text-stitch" : active ? "text-navy" : "text-navy-soft/50"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={n.primary ? "h-8 w-8 rounded-full bg-stitch p-1 text-white" : "h-6 w-6"}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d={n.icon} />
                </svg>
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type Access =
  | { state: "checking" }
  | { state: "allowed"; me: Staff }
  | { state: "denied"; message?: string };

function Gate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [access, setAccess] = useState<Access>({ state: "checking" });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setAccess({ state: "checking" });
    checkAccess(user).then((r) => {
      if (cancelled) return;
      if (r.state === "allowed") setAccess({ state: "allowed", me: r.me });
      else if (r.state === "denied") setAccess({ state: "denied" });
      else setAccess({ state: "denied", message: r.message });
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || (user && access.state === "checking")) {
    return (
      <Shell>
        <Card>
          <p className="text-center text-sm text-navy-soft/70">読み込み中…</p>
        </Card>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <LoginScreen />
      </Shell>
    );
  }
  if (access.state !== "allowed") {
    return (
      <Shell>
        <DeniedScreen message={access.state === "denied" ? access.message : undefined} />
      </Shell>
    );
  }
  return (
    <MeContext.Provider value={access.me}>
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col pb-24">
        <Header small />
        <div className="flex flex-col gap-4 px-4 pt-4">{children}</div>
      </main>
      <BottomNav />
    </MeContext.Provider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <Header />
      <section className="-mt-4 px-4">{children}</section>
    </main>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
