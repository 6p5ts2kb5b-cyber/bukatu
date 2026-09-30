// Firebase（データの保存場所とGoogleログイン）の接続設定です。
//
// これはアプリの「住所」のようなもので、パスワードではありません。
// Firebaseの仕組み上、画面側に必ず公開される情報なので、ここに書いて問題ありません。
// データを守るのは、Firebase側の「セキュリティルール」（STEP2以降で設定）です。
//
// Vercelの環境変数 NEXT_PUBLIC_FIREBASE_CONFIG が設定されている場合は、そちらを優先します。

export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

// Firebaseプロジェクト「bukatu」の設定
const BUKATU_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyBPaDdJTJ4DogE1L4mjhJTPD52ERxjfygs",
  authDomain: "bukatu-febd5.firebaseapp.com",
  projectId: "bukatu-febd5",
  storageBucket: "bukatu-febd5.firebasestorage.app",
  messagingSenderId: "626341695654",
  appId: "1:626341695654:web:ffe21cb2ae46fd8182a467",
};

const REQUIRED = ["apiKey", "authDomain", "projectId", "appId"] as const;

export type FirebaseConfigResult =
  | { state: "ok"; config: FirebaseConfig; source: "code" | "vercel" }
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
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!raw || raw.trim() === "") {
    return { state: "ok", config: BUKATU_CONFIG, source: "code" };
  }

  const values = parseConfigText(raw);
  const missing = REQUIRED.filter((k) => !values[k]);
  if (missing.length > 0) return { state: "invalid", missing: [...missing] };

  return {
    state: "ok",
    source: "vercel",
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
