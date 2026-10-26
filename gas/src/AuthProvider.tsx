// ログイン状態（GAS版）。GASではGoogleのログインはブラウザ側で済んでいるので、
// 開いたときの読み込み（session）から、だれが使っているかを出します。

import { createContext, useContext, type ReactNode } from "react";
import type { User } from "./shim/firebase-auth";
import { useSession, clearCache } from "./session";

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Googleからログアウトして、アカウントを選び直せるようにする
export function googleLogout() {
  clearCache();
  window.open("https://accounts.google.com/Logout", "_top");
}
export function googleLogin(url: string) {
  window.open(`https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(url)}`, "_top");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const s = useSession();
  const email = s.state === "staff" ? String(s.me.email ?? "") : s.state === "ops" ? s.email : s.state === "denied" ? s.email : "";
  const name = s.state === "staff" ? String(s.me.name ?? "") : s.state === "ops" ? s.name : "";
  const value: AuthState = {
    user: email ? { email, displayName: name || email } : null,
    loading: s.state === "loading",
    error: s.state === "error" ? s.message : null,
    signIn: async () => googleLogin("url" in s ? s.url : ""),
    logOut: async () => googleLogout(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProviderの外でuseAuthが使われました");
  return ctx;
}
