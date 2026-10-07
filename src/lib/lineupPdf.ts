// メンバー表の PDF（A4縦1枚）を、画面の写しではなく直接えがいて作ります。
// 罫線と文字の位置がずれず、どのスマホでも同じ仕上がりになります。
// 寸法は印刷用のメンバー表（design.css の .ms）とそろえています。

import { jpegPagesToPdf, toJpeg } from "./sharePdf";

export type SheetRow = { order?: number; pos?: string; number: string; name: string; grade: string; school: string };
export type SheetData = {
  team: string;
  title: string;
  date: string;
  opponent: string;
  starters: SheetRow[]; // 9人（空いている打順は name を空に）
  bench: SheetRow[];
};

const PX_PER_MM = 794 / 210;
const SCALE = 2.5; // 細かく描く（くっきりさせるため）
const K = PX_PER_MM * SCALE; // 1mm あたりの点の数
const PT = 0.3528; // 1pt = 0.3528mm

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export async function lineupToPdf(d: SheetData, filename: string): Promise<File> {
  await document.fonts?.ready;
  const NUM = cssVar("--num") || `"Arial Narrow", sans-serif`;
  const JP = cssVar("--jp") || "sans-serif";

  const c = document.createElement("canvas");
  c.width = Math.round(210 * K);
  c.height = Math.round(297 * K);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);

  const mm = (v: number) => v * K;
  const font = (pt: number, weight: number, fam: string) => `${weight} ${pt * PT * K}px ${fam}`;

  const line = (x1: number, y1: number, x2: number, y2: number, w = 0.3) => {
    ctx.beginPath();
    ctx.lineWidth = mm(w);
    ctx.strokeStyle = "#000";
    ctx.moveTo(mm(x1), mm(y1));
    ctx.lineTo(mm(x2), mm(y2));
    ctx.stroke();
  };
  const box = (x: number, y: number, w: number, h: number, lw: number) => {
    ctx.lineWidth = mm(lw);
    ctx.strokeStyle = "#000";
    ctx.strokeRect(mm(x), mm(y), mm(w), mm(h));
  };
  const shade = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#ececec";
    ctx.fillRect(mm(x), mm(y), mm(w), mm(h));
  };
  // 文字：枠の中で上下中央。入りきらなければ小さくする
  const text = (
    s: string,
    x: number,
    y: number,
    w: number,
    h: number,
    pt: number,
    weight: number,
    fam: string,
    align: "center" | "left" = "center",
    pad = 1.5,
  ) => {
    if (!s) return;
    let size = pt;
    ctx.font = font(size, weight, fam);
    const max = mm(w - pad * 2);
    while (ctx.measureText(s).width > max && size > 6) {
      size -= 0.5;
      ctx.font = font(size, weight, fam);
    }
    ctx.fillStyle = "#000";
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
    const tx = align === "center" ? x + w / 2 : x + pad;
    ctx.fillText(s, mm(tx), mm(y + h / 2));
  };

  // PDFは余白なしで用紙いっぱいに（左右・上 5mm）
  const X0 = 5;
  const W = 200;
  let y = 5;

  // ---- 見出しの枠 ----
  const headH = 28;
  text(d.team, X0 + 4, y + 2.5, W - 8, 5, 9, 700, JP, "left", 0);
  text(d.title || "メンバー表", X0 + 4, y + 7, W - 8, 11, 19, 800, JP, "left", 0);
  const metaY = y + headH - 9;
  const half = W / 2;
  const metas: [string, string, number][] = [
    ["日付", d.date, 13],
    ["対戦相手", d.opponent, 20],
  ];
  metas.forEach(([label, value, lw], i) => {
    const x = X0 + half * i;
    shade(x, metaY, lw, 9);
    line(x + lw, metaY, x + lw, metaY + 9);
    text(label, x, metaY, lw, 9, 9, 800, JP);
    text(value, x + lw, metaY, half - lw, 9, 12, 800, JP, "left", 3);
  });
  line(X0, metaY, X0 + W, metaY);
  line(X0 + half, metaY, X0 + half, metaY + 9);
  box(X0, y, W, headH, 0.6);
  y += headH + 4;

  // ---- 表をえがく ----
  type Col = { label: string; pct: number; key: keyof SheetRow; kind: "order" | "num" | "name" | "plain" };
  const table = (cols: Col[], rows: SheetRow[], rowH: number, sizes: { order: number; num: number; name: number; plain: number }) => {
    const fixed = cols.reduce((s, c) => s + c.pct, 0);
    const widths = cols.map((c) => (c.pct ? (W * c.pct) / 100 : (W * (100 - fixed)) / 100));
    const headRowH = 8;
    const h = headRowH + rowH * rows.length;
    shade(X0, y, W, headRowH);
    // 見出し
    let x = X0;
    cols.forEach((c, i) => {
      text(c.label, x, y, widths[i], headRowH, 9.5, 800, JP);
      x += widths[i];
    });
    // 行
    rows.forEach((r, ri) => {
      const ry = y + headRowH + rowH * ri;
      let cx = X0;
      cols.forEach((c, i) => {
        const v = String(r[c.key] ?? "");
        if (c.kind === "order") text(v, cx, ry, widths[i], rowH, sizes.order, 800, NUM);
        else if (c.kind === "num") text(v, cx, ry, widths[i], rowH, sizes.num, 700, NUM);
        else if (c.kind === "name") text(v, cx, ry, widths[i], rowH, sizes.name, 800, JP, "left", 4);
        else text(v, cx, ry, widths[i], rowH, sizes.plain, 700, JP);
        cx += widths[i];
      });
      line(X0, ry, X0 + W, ry, ri === 0 ? 0.6 : 0.3);
    });
    // 縦線
    x = X0;
    widths.slice(0, -1).forEach((w) => {
      x += w;
      line(x, y, x, y + h);
    });
    box(X0, y, W, h, 0.6);
    y += h;
  };

  table(
    [
      { label: "打順", pct: 11, key: "order", kind: "order" },
      { label: "守備", pct: 11, key: "pos", kind: "num" },
      { label: "背番号", pct: 12, key: "number", kind: "num" },
      { label: "氏名", pct: 0, key: "name", kind: "name" },
      { label: "学年", pct: 10, key: "grade", kind: "plain" },
      { label: "学校", pct: 15, key: "school", kind: "plain" },
    ],
    d.starters,
    16,
    { order: 24, num: 20, name: 16, plain: 13 },
  );

  // ---- 控え ----
  y += 3;
  text(`控え選手（${d.bench.filter((b) => b.name).length}人）`, X0, y, W, 6, 11, 800, JP, "left", 0);
  y += 7;
  const room = 292 - y - 8;
  const benchH = Math.min(10, room / Math.max(1, d.bench.length));
  table(
    [
      { label: "No.", pct: 11, key: "order", kind: "plain" },
      { label: "背番号", pct: 12, key: "number", kind: "num" },
      { label: "氏名", pct: 0, key: "name", kind: "name" },
      { label: "学年", pct: 10, key: "grade", kind: "plain" },
      { label: "学校", pct: 15, key: "school", kind: "plain" },
    ],
    d.bench,
    benchH,
    { order: 11, num: 14, name: 12, plain: 11 },
  );

  const page = await toJpeg(c);
  return new File([jpegPagesToPdf([page])], filename, { type: "application/pdf" });
}
