// 連絡先の名簿（Firestore の「directory」）。
//   person = 名前と携帯番号（発信元・問い合わせ先で使う）
//   fax    = 学校名とFAX番号
// 一度登録すれば、送付書でボタンを押すだけで入ります。

import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore, serverTimestamp } from "firebase/firestore";
import { firebaseApp } from "./firebase";

export type DirKind = "person" | "fax";
export type DirEntry = { id: string; kind: DirKind; name: string; number: string };

function db() {
  return getFirestore(firebaseApp());
}

export async function listDirectory(): Promise<DirEntry[]> {
  const snap = await getDocs(collection(db(), "directory"));
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        kind: (x.kind === "fax" ? "fax" : "person") as DirKind,
        name: String(x.name ?? ""),
        number: String(x.number ?? ""),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function addDirectory(kind: DirKind, name: string, number: string): Promise<DirEntry> {
  const ref = await addDoc(collection(db(), "directory"), {
    kind,
    name: name.trim(),
    number: number.trim(),
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, kind, name: name.trim(), number: number.trim() };
}

export async function deleteDirectory(id: string): Promise<void> {
  await deleteDoc(doc(db(), "directory", id));
}
