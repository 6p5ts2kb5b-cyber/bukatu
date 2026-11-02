// ログインなしでメンバー表を作れる「共有URL」と、そのQRコードを作ります。
//
// ・URLの「#」より後ろに、選手の名簿（氏名・背番号・学校・学年）を詰めて入れます。
//   「#」より後ろはサーバーに送られないので、名簿がアプリのデータベースやログに残ることはありません。
// ・開いた人のスマホの中だけで作業し、アプリ（Firestore）には何も保存しません。
// ・名簿が変わったら、URL（QRコード）を作り直します。

import qrcode from "./vendor/qrcode";
import type { Player } from "./players";
import type { Team } from "./teams";

export const SHARE_PATH = "/m";

// 名簿 → URLの「#」の後ろに入れる文字（JSON → UTF-8 → base64url）
//   形：[1, ["桜中", …], [["氏名", "背番号", 学校の番号, 学年], …]]
export function encodeRoster(players: Player[], teams: Team[]): string {
  const active = players.filter((p) => p.active);
  const used = teams.filter((t) => active.some((p) => p.teamId === t.id));
  const idx = new Map(used.map((t, i) => [t.id, i]));
  const data = [1, used.map((t) => t.shortName), active.map((p) => [p.name, p.number, idx.get(p.teamId) ?? -1, p.grade])];
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// URLの「#」の後ろ → 選手と学校（読めなければ null）
export function decodeRoster(code: string): { players: Player[]; teams: Team[] } | null {
  try {
    const b64 = code.replace(/^#/, "").replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(data) || data[0] !== 1 || !Array.isArray(data[1]) || !Array.isArray(data[2])) return null;
    const teams: Team[] = (data[1] as unknown[]).map((s, i) => ({
      id: `t${i}`,
      name: String(s),
      shortName: String(s),
      order: i,
      active: true,
    }));
    const players: Player[] = (data[2] as unknown[]).filter(Array.isArray).map((r, i) => {
      const x = r as unknown[];
      return {
        id: `p${i}`,
        name: String(x[0] ?? ""),
        kana: "",
        number: String(x[1] ?? ""),
        teamId: typeof x[2] === "number" && x[2] >= 0 ? `t${x[2]}` : "",
        grade: Number(x[3]) || 1,
        active: true,
      };
    });
    if (players.length === 0) return null;
    return { players, teams };
  } catch {
    return null;
  }
}

export function shareUrl(origin: string, players: Player[], teams: Team[]): string {
  return `${origin}${SHARE_PATH}#${encodeRoster(players, teams)}`;
}

// 文字の短いしるし（その名簿の作業を、スマホの中で覚えておくときの名前に使う）
export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export type Qr = { size: number; path: string };

// QRコード（読み取りやすさ：L＝URLを一番短い絵にできる）。長すぎて作れなければ null
export function makeQr(text: string): Qr | null {
  try {
    const q = qrcode(0, "L");
    q.addData(text, "Byte");
    q.make();
    const n = q.getModuleCount();
    let path = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
    return { size: n, path };
  } catch {
    return null;
  }
}

// QRコードを画像（PNG）にする。下に説明の文字を入れる
export async function qrToPng(qr: Qr, caption: string[], filename: string): Promise<File> {
  const cell = 10;
  const quiet = 4; // まわりの余白（読み取りに必要）
  const w = (qr.size + quiet * 2) * cell;
  const lineH = 44;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = w + caption.length * lineH + 24;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000";
  ctx.translate(quiet * cell, quiet * cell);
  ctx.scale(cell, cell);
  ctx.fill(new Path2D(qr.path));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#14233a";
  ctx.textAlign = "center";
  caption.forEach((t, i) => {
    ctx.font = `${i === 0 ? 800 : 600} ${i === 0 ? 30 : 24}px sans-serif`;
    ctx.fillText(t, w / 2, w + i * lineH + 18, w - 40);
  });
  const blob = await new Promise<Blob>((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error("png"))), "image/png"));
  return new File([blob], filename, { type: "image/png" });
}
