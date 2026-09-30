// Firebase（データの保存場所とGoogleログイン）の接続設定を読み込む部品です。
//
// 設定はGitHubには書かず、Vercelの環境変数「NEXT_PUBLIC_FIREBASE_CONFIG」に入れます。
// Firebaseの画面に表示される
//   const firebaseConfig = { apiKey: "...", authDomain: "...", ... };
// という部分を、そのまま丸ごと貼り付ければ読み込めるようにしています。

export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

const REQUIRED = ["apiKey", "authDomain", "projectId", "appId"] as const;

export type FirebaseConfigResult =
  | { state: "ok"; config: FirebaseConfig }
  | { state: "missing" }
  | { state: "invalid"; missing: string[] };

// 貼り付けた文字から「名前: "値"」の組を取り出す
function parseConfigText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /["']?([A-Za-z]+)["']?\s*:\s*["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

export function getFirebaseConfig(): FirebaseConfigResult {
  // NEXT_PUBLIC_ で始まる名前は、スマホ側の画面からも読める公開用の設定です
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!raw || raw.trim() === "") return { state: "missing" };

  const values = parseConfigText(raw);
  const missing = REQUIRED.filter((k) => !values[k]);
  if (missing.length > 0) return { state: "invalid", missing: [...missing] };

  return {
    state: "ok",
    config: {
      apiKey: values.apiKey,
      authDomain: values.authDomain,
      projectId: values.projectId,
      storageBucket: values.storageBucket,
      messagingSenderId: values.messagingSenderId,
      appId: values.appId,
    },
  };
}
