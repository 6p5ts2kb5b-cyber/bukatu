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
import { cssVars } from "@/components/ui";

const MeContext = createContext<Staff | null>(null);

export function useMe(): Staff {
  const me = useContext(MeContext);
  if (!me) throw new Error("ログイン前にuseMeが使われました");
  return me;
}

export function BallMark({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="21" fill="#f5f7f2" />
      <path
        d="M11 9c6 6 6 24 0 30M37 9c-6 6-6 24 0 30"
        fill="none"
        stroke="#c42b3b"
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

// 見出し：チーム名と、今日の日付（得点板のめくり数字）
function Header() {
  const [today, setToday] = useState<{ m: number; d: number; wd: string } | null>(null);
  useEffect(() => {
    const t = new Date();
    setToday({ m: t.getMonth() + 1, d: t.getDate(), wd: "日月火水木金土"[t.getDay()] });
  }, []);
  return (
    <header className="app-header print:hidden">
      <BallMark className="app-header__mark" />
      <div className="app-header__titles">
        <p className="app-header__title">桜・浅羽野・住吉</p>
        <p className="app-header__sub">予定・活動管理</p>
      </div>
      {today && (
        <p className="app-header__today" aria-label={`今日は${today.m}月${today.d}日（${today.wd}）`}>
          <span className="tile" style={cssVars({ "--i": 1 })}>{today.m}</span>
          <i aria-hidden>/</i>
          <span className="tile" style={cssVars({ "--i": 2 })}>{today.d}</span>
          <small aria-hidden>{today.wd}</small>
        </p>
      )}
    </header>
  );
}


// LINE・Instagram・Facebookなどのアプリ内ブラウザでは、Googleがログインを禁止している
type InApp = "line" | "other" | null;
function detectInAppBrowser(): InApp {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/\bLine\//i.test(ua)) return "line";
  if (/FBAN|FBAV|Instagram|MicroMessenger|KAKAOTALK/i.test(ua)) return "other";
  return null;
}

function InAppWarning({ kind }: { kind: Exclude<InApp, null> }) {
  // LINEは、アドレスの最後に ?openExternalBrowser=1 を付けるとSafari/Chromeで開き直せる
  const externalUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?openExternalBrowser=1`
      : "/";
  return (
    <div className="login__note login__note--warn" role="alert">
      {kind === "line" ? "LINE" : "アプリ"}の中のブラウザでは、Googleのログインが使えません。
      Safari（Androidの方はChrome）で開き直してください。
      {kind === "line" ? (
        <a href={externalUrl}>Safari／Chromeで開き直す</a>
      ) : (
        <span className="mt-2 block">画面の「…」や共有ボタンから「ブラウザで開く」を選んでください。</span>
      )}
    </div>
  );
}

// ログイン画面：試合前の、まだ何も入っていない得点板
function LoginScreen() {
  const { signIn, error } = useAuth();
  const [inApp, setInApp] = useState<InApp>(null);
  useEffect(() => setInApp(detectInAppBrowser()), []);
  return (
    <main className="login">
      <div className="login__top">
        <div className="login__board" aria-hidden>
          <div className="login__row login__row--head">
            <span />
            <span>1</span>
            <span>2</span>
            <span>3</span>
          </div>
          {["桜", "浅羽野", "住吉"].map((t, r) => (
            <div key={t} className="login__row">
              <div className="login__team">{t}</div>
              {[0, 1, 2].map((c) => (
                <span key={c} className="tile" style={cssVars({ "--i": r * 3 + c + 2 })} />
              ))}
            </div>
          ))}
        </div>
        <div className="login__caption">
          <span className="login__kicker">STAFF ONLY</span>
          <h1>予定・活動管理</h1>
          <p>桜・浅羽野・住吉 連合チーム</p>
        </div>
      </div>
      <div className="login__panel">
        {inApp && <InAppWarning kind={inApp} />}
        <p>名簿に登録したGoogleアカウントで入ります。</p>
        <button type="button" onClick={signIn} className="login__google">
          <GoogleMark />
          Googleでログイン
        </button>
        {error && (
          <p className="login__note login__note--error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

function DeniedScreen({ message }: { message?: string }) {
  const { user, logOut } = useAuth();
  return (
    <section className="panel flex flex-col gap-3">
      <span className="tag tag--red self-start">未登録</span>
      <h2 className="text-xl font-extrabold leading-snug">このアカウントは<wbr />登録されていません</h2>
      <p className="break-all text-sm font-bold text-navy-soft">{user?.email}</p>
      <p className="text-sm leading-relaxed text-navy-soft">
        {message ??
          "スタッフ名簿に登録されたアカウントだけが使えます。管理している方に、このメールアドレスの登録を頼んでください。別のアカウントで入る場合は、いったんログアウトしてください。"}
      </p>
      <button type="button" onClick={logOut} className="btn btn--ghost mt-2">
        ログアウト
      </button>
    </section>
  );
}

const NAV = [
  { href: "/", label: "ホーム", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/activities", label: "予定", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { href: "/activities/new", label: "予定を追加", icon: "M12 5v14M5 12h14", plate: true },
  { href: "/menu", label: "メニュー", icon: "M4 6h16M4 12h16M4 18h16" },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/activities") return pathname.startsWith("/activities") && pathname !== "/activities/new";
  if (href === "/menu")
    return ["/menu", "/teams", "/staff", "/print", "/players", "/lineups", "/notices"].some((p) => pathname.startsWith(p));
  return pathname === href;
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

// 画面下のボタン。「予定を追加」はホームベースの形
function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="tabbar print:hidden" aria-label="メインメニュー">
      <ul>
        {NAV.map((n) => {
          const active = isActive(n.href, pathname);
          return (
            <li key={n.href}>
              <Link href={n.href} aria-current={active ? "page" : undefined} className={n.plate ? "plate" : undefined}>
                {n.plate ? (
                  <span className="plate__shape">
                    <NavIcon d={n.icon} />
                  </span>
                ) : (
                  <NavIcon d={n.icon} />
                )}
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
        <p className="py-16 text-center text-sm font-bold text-navy-soft">読み込み中…</p>
      </Shell>
    );
  }
  if (!user) return <LoginScreen />;
  if (access.state !== "allowed") {
    return (
      <Shell>
        <DeniedScreen message={access.state === "denied" ? access.message : undefined} />
      </Shell>
    );
  }
  return (
    <MeContext.Provider value={access.me}>
      <Header />
      <main className="page mx-auto flex min-h-dvh max-w-xl flex-col gap-3 px-3.5 pb-28 pt-4 print:max-w-none print:p-0">
        {children}
      </main>
      <BottomNav />
    </MeContext.Provider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-3.5 pt-4">{children}</main>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
