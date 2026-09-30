// Firebaseの部品を準備するファイルです（スマホ・PCの画面側で使います）。

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirebaseConfig } from "./firebase-config";

let app: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp {
  if (app) return app;
  const result = getFirebaseConfig();
  if (result.state !== "ok") {
    throw new Error("Firebaseの設定が読み込めません");
  }
  app = getApps().length > 0 ? getApp() : initializeApp(result.config);
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  // 毎回アカウントを選べるようにする（学校用と個人用を間違えないため）
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
