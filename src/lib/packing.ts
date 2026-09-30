// 持ち物マスター（Firestoreの「packingItems」コレクション）を読み書きする部品です。
//
// packingItems = よく使う持ち物の一覧
//   中身 = 名前、表示順、有効/無効

import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { firebaseApp } from "./firebase";

export type PackingItem = { id: string; name: string; order: number; active: boolean };

// 最初に登録しておく持ち物（一覧が空のときだけ自動で入る）
const INITIAL_ITEMS = [
  "軽食",
  "お弁当",
  "水筒",
  "着替え",
  "筆記用具",
  "メモ帳",
  "野球note",
  "半袖",
  "短パン",
  "ユニフォーム",
  "グローブ",
  "スパイク",
  "帽子",
  "防寒着",
  "雨具",
];

function db(): Firestore {
  return getFirestore(firebaseApp());
}

export async function listPackingItems(): Promise<PackingItem[]> {
  const snap = await getDocs(collection(db(), "packingItems"));
  if (snap.empty) {
    // 初めて使うとき：15品目を登録する（同じIDなので、2人同時でも重複しない）
    const batch = writeBatch(db());
    const items = INITIAL_ITEMS.map((name, i) => ({
      id: `item${String(i + 1).padStart(2, "0")}`,
      name,
      order: i + 1,
      active: true,
    }));
    for (const it of items) {
      const { id, ...rest } = it;
      batch.set(doc(db(), "packingItems", id), { ...rest, createdAt: serverTimestamp() });
    }
    await batch.commit();
    return items;
  }
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: String(data.name ?? ""),
        order: typeof data.order === "number" ? data.order : 999,
        active: data.active !== false,
      };
    })
    .filter((it) => it.name)
    .sort((a, b) => a.order - b.order);
}

export async function addPackingItem(name: string, order: number): Promise<PackingItem> {
  const ref = await addDoc(collection(db(), "packingItems"), {
    name: name.trim(),
    order,
    active: true,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, name: name.trim(), order, active: true };
}
