// 大会運営の名簿（Firestoreの「opsStaff」）：大会運営（リーグ戦の打ち込み）だけができる人。
//   ドキュメントの名前 = Googleメールアドレス（小文字）
//   中身 = 氏名、有効/無効
// この名簿の人は、ログインすると「大会運営」の画面だけが使えます（予定・名簿などは見えません）。

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { firebaseApp } from "./firebase";
import { normalizeEmail } from "./staff";

export type OpsMember = { email: string; name: string; active: boolean };

const COL = "opsStaff";

function db(): Firestore {
  return getFirestore(firebaseApp());
}

// ログインした人が大会運営の名簿に載っているか（載っていなければ null）
export async function checkOpsAccess(user: User): Promise<OpsMember | null> {
  const email = normalizeEmail(user.email ?? "");
  if (!email) return null;
  try {
    const snap = await getDoc(doc(db(), COL, email));
    if (!snap.exists()) return null;
    const d = snap.data() as Partial<OpsMember>;
    if (d.active === false) return null;
    return { email, name: String(d.name ?? user.displayName ?? email), active: true };
  } catch {
    return null;
  }
}

export async function listOpsStaff(): Promise<OpsMember[]> {
  const snap = await getDocs(collection(db(), COL));
  return snap.docs
    .map((d) => ({ email: d.id, name: String(d.data().name ?? ""), active: d.data().active !== false }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function addOpsStaff(email: string, name: string): Promise<void> {
  const e = normalizeEmail(email);
  await setDoc(doc(db(), COL, e), { email: e, name: name.trim(), active: true, createdAt: serverTimestamp() });
}

export async function removeOpsStaff(email: string): Promise<void> {
  await deleteDoc(doc(db(), COL, normalizeEmail(email)));
}
