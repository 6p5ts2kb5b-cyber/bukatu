// スタッフ名簿（Firestoreの「staff」コレクション）を読み書きする部品です。
//
// staff = スタッフ名簿（ログインできる人の一覧）
//   ドキュメントの名前 = Googleメールアドレス（小文字）
//   中身 = 氏名、指導可、審判可、球審可、塁審可、備考、有効/無効

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { firebaseApp } from "./firebase";

export type Staff = {
  email: string;
  name: string;
  canCoach: boolean; // 指導者として参加できる
  canUmpire: boolean; // 審判ができる
  canPlateUmpire: boolean; // 球審ができる
  canBaseUmpire: boolean; // 塁審ができる
  note: string; // 備考
  active: boolean; // 有効（false = 無効。ログインできない）
};

export const EMPTY_STAFF: Staff = {
  email: "",
  name: "",
  canCoach: true,
  canUmpire: false,
  canPlateUmpire: false,
  canBaseUmpire: false,
  note: "",
  active: true,
};

function db(): Firestore {
  return getFirestore(firebaseApp());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type AccessResult =
  | { state: "allowed"; me: Staff }
  | { state: "denied" }
  | { state: "error"; message: string };

// ログインした人がスタッフ名簿に載っているか確認する。
// 持ち主（最初の管理者）がまだ名簿に載っていない場合は、自動で名簿に追加する。
export async function checkAccess(user: User): Promise<AccessResult> {
  const email = normalizeEmail(user.email ?? "");
  if (!email) return { state: "denied" };
  try {
    const ref = doc(db(), "staff", email);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const me = { ...EMPTY_STAFF, ...(snap.data() as Partial<Staff>), email };
      return me.active ? { state: "allowed", me } : { state: "denied" };
    }
    // 読めたのに名簿に無い = ルール上の持ち主。自分を名簿に登録する
    const me: Staff = {
      ...EMPTY_STAFF,
      email,
      name: user.displayName ?? email,
      canUmpire: true,
      canPlateUmpire: true,
      canBaseUmpire: true,
    };
    await setDoc(ref, { ...me, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { state: "allowed", me };
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (code === "permission-denied") return { state: "denied" };
    return { state: "error", message: `名簿を確認できませんでした（${code || "不明なエラー"}）` };
  }
}

export async function listStaff(): Promise<Staff[]> {
  const snap = await getDocs(query(collection(db(), "staff"), orderBy("name")));
  return snap.docs.map((d) => ({ ...EMPTY_STAFF, ...(d.data() as Partial<Staff>), email: d.id }));
}

export async function addStaff(s: Staff): Promise<void> {
  const email = normalizeEmail(s.email);
  const ref = doc(db(), "staff", email);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error("このメールアドレスはすでに登録されています");
  }
  await setDoc(ref, {
    ...s,
    email,
    name: s.name.trim(),
    note: s.note.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateStaff(s: Staff): Promise<void> {
  const email = normalizeEmail(s.email);
  await updateDoc(doc(db(), "staff", email), {
    name: s.name.trim(),
    canCoach: s.canCoach,
    canUmpire: s.canUmpire,
    canPlateUmpire: s.canPlateUmpire,
    canBaseUmpire: s.canBaseUmpire,
    note: s.note.trim(),
    active: s.active,
    updatedAt: serverTimestamp(),
  });
}

// メールアドレスを変更する。
// 名簿はメールアドレスを名前にして保存しているので、新しいアドレスで作り直してから古い方を消す。
export async function changeStaffEmail(oldEmail: string, s: Staff): Promise<void> {
  const from = normalizeEmail(oldEmail);
  const to = normalizeEmail(s.email);
  if (from === to) {
    await updateStaff({ ...s, email: from });
    return;
  }
  const exists = await getDoc(doc(db(), "staff", to));
  if (exists.exists()) {
    throw new Error("このメールアドレスはすでに登録されています");
  }
  const batch = writeBatch(db());
  batch.set(doc(db(), "staff", to), {
    ...s,
    email: to,
    name: s.name.trim(),
    note: s.note.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.delete(doc(db(), "staff", from));
  await batch.commit();
}

// スタッフを名簿から削除する（この人はログインできなくなる）
export async function deleteStaff(email: string): Promise<void> {
  const batch = writeBatch(db());
  batch.delete(doc(db(), "staff", normalizeEmail(email)));
  await batch.commit();
}
