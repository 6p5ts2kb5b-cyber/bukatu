"use client";

// ログイン状態をアプリ全体で使えるようにする部品です。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase";

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Firebaseのエラーを、初心者にも分かる日本語に置き換える
function toJapanese(code: string): string {
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "ログインの画面が閉じられました。もう一度お試しください。";
    case "auth/unauthorized-domain":
      return "このアドレスはまだFirebaseで許可されていません（管理者がFirebaseの「承認済みドメイン」に追加する必要があります）。";
    case "auth/operation-not-allowed":
      return "Googleログインがまだ有効になっていません（Firebaseの「ログイン方法」でGoogleを有効にしてください）。";
    case "auth/web-storage-unsupported":
      return "このブラウザの設定ではログインできません。Safariの「プライベート」をやめるか、設定の「すべてのCookieをブロック」をオフにしてください。";
    case "auth/popup-blocked":
      return "ログイン画面がブロックされました。もう一度ボタンを押してください。";
    case "auth/network-request-failed":
      return "通信できませんでした。電波の良い場所でもう一度お試しください。";
    default:
      return `ログインできませんでした（${code}）。`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth(), (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(firebaseAuth(), googleProvider());
    } catch (e) {
      const code = (e as { code?: string }).code ?? "unknown";
      // ポップアップが使えない環境では、画面ごと切り替える方法で再挑戦
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(firebaseAuth(), googleProvider());
        return;
      }
      setError(toJapanese(code));
    }
  }, []);

  const logOut = useCallback(async () => {
    await signOut(firebaseAuth());
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProviderの外でuseAuthが使われました");
  return ctx;
}
