// 連絡先の名簿（Firestore の「directory」）。
//   person = 名前と携帯番号（発信元・問い合わせ先で使う）
//   fax    = 学校名とFAX番号
// 一度登録すれば、送付書でボタンを押すだけで入ります。

import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore, serverTimestamp } from "firebase/firestore";
import { firebaseApp } from "./firebase";

export type DirKind = "person" | "fax" | "venue";
// venue のときは number = 住所、extra = 最寄駅
export type DirEntry = { id: string; kind: DirKind; name: string; number: string; extra?: string; preset?: boolean };

// 3校の会場は最初から入れておく（住所と最寄駅・駅からの時間）
// 徒歩の分数は、駅からの距離をもとにした目安
export const VENUE_PRESETS: DirEntry[] = [
  { id: "preset-asabano", kind: "venue", name: "坂戸市立浅羽野中学校", number: "坂戸市浅羽753-1", extra: "東武東上線・越生線 坂戸駅 徒歩約13分", preset: true },
  { id: "preset-sakura", kind: "venue", name: "坂戸市立桜中学校", number: "坂戸市泉町3-25-8", extra: "東武東上線 北坂戸駅 徒歩約13分", preset: true },
  { id: "preset-sumiyoshi", kind: "venue", name: "坂戸市立住吉中学校", number: "坂戸市塚越114-1", extra: "東武東上線 若葉駅からバス約11分（さかっちワゴン「住吉中学校」下車 徒歩3分）", preset: true },
];

// 「浅羽野中」「浅羽野中学校」などの書き方でも、登録した会場を見つける
export function findVenue(name: string, entries: DirEntry[]): DirEntry | null {
  const key = (v: string) => v.replace(/坂戸市立|市立|学校|\s/g, "");
  const k = key(name);
  if (!k) return null;
  const all = [...entries.filter((e) => e.kind === "venue"), ...VENUE_PRESETS];
  return all.find((e) => key(e.name) === k) ?? all.find((e) => k.length >= 3 && key(e.name).startsWith(k)) ?? null;
}

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
        kind: (x.kind === "fax" || x.kind === "venue" ? x.kind : "person") as DirKind,
        name: String(x.name ?? ""),
        number: String(x.number ?? ""),
        extra: String(x.extra ?? ""),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function addDirectory(kind: DirKind, name: string, number: string, extra = ""): Promise<DirEntry> {
  const ref = await addDoc(collection(db(), "directory"), {
    kind,
    name: name.trim(),
    number: number.trim(),
    extra: extra.trim(),
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, kind, name: name.trim(), number: number.trim(), extra: extra.trim() };
}

export async function deleteDirectory(id: string): Promise<void> {
  await deleteDoc(doc(db(), "directory", id));
}
