// 送付書（A4縦1枚）をえがく部品です。
// 画面の見本・印刷・PDF のすべてで、この絵を使います（どこで見ても同じ仕上がり）。
// 寸法は mm で決め、入りきらないときは全体を少しずつ小さくして1枚に収めます。

import { reiwa, type NoticeDraft } from "./notices";
import { jpegPagesToPdf, toJpeg } from "./sharePdf";

const PX_PER_MM = 794 / 210;
const PT = 0.3528; // 1pt = 0.3528mm
const PAGE_W = 210;
const PAGE_H = 297;
const L = 18; // 左右の余白
const W = PAGE_W - L * 2;
const BOTTOM = PAGE_H - 14;

function cssVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 行の頭に来てはいけない文字（。、）など）
const NO_START = "、。，．）」』】〕）!?！？ー・：:";

type Ctx = CanvasRenderingContext2D;

class Painter {
  y = 14;
  constructor(
    private ctx: Ctx,
    private K: number, // 1mm あたりの点
    private f: number, // 文字と行間の倍率（入りきらないとき小さく）
    private JP: string,
    public NUM: string,
    private dry: boolean, // true = 位置だけ計算する
  ) {}
  mm(v: number) {
    return v * this.K;
  }
  font(pt: number, weight = 500, fam = this.JP) {
    this.ctx.font = `${weight} ${pt * this.f * PT * this.K}px ${fam}`;
  }
  sz(v: number) {
    return v * this.f;
  }
  width(s: string) {
    return this.ctx.measureText(s).width / this.K;
  }
  text(s: string, x: number, y: number, align: CanvasTextAlign = "left", base: CanvasTextBaseline = "middle") {
    if (this.dry || !s) return;
    this.ctx.fillStyle = "#000";
    this.ctx.textAlign = align;
    this.ctx.textBaseline = base;
    this.ctx.fillText(s, this.mm(x), this.mm(y));
  }
  // 枠の幅に入るよう、文字を小さくして1行で書く
  fitText(s: string, x: number, y: number, w: number, pt: number, weight = 500, align: CanvasTextAlign = "left", fam = this.JP) {
    let p = pt;
    this.font(p, weight, fam);
    while (this.width(s) > w && p > 6) {
      p -= 0.5;
      this.font(p, weight, fam);
    }
    const tx = align === "center" ? x + w / 2 : align === "right" ? x + w : x;
    this.text(s, tx, y, align);
  }
  line(x1: number, y1: number, x2: number, y2: number, w = 0.25) {
    if (this.dry) return;
    const c = this.ctx;
    c.beginPath();
    c.lineWidth = this.mm(w);
    c.strokeStyle = "#000";
    c.moveTo(this.mm(x1), this.mm(y1));
    c.lineTo(this.mm(x2), this.mm(y2));
    c.stroke();
  }
  rect(x: number, y: number, w: number, h: number, lw = 0.25) {
    if (this.dry) return;
    this.ctx.lineWidth = this.mm(lw);
    this.ctx.strokeStyle = "#000";
    this.ctx.strokeRect(this.mm(x), this.mm(y), this.mm(w), this.mm(h));
  }
  shade(x: number, y: number, w: number, h: number) {
    if (this.dry) return;
    this.ctx.fillStyle = "#efefef";
    this.ctx.fillRect(this.mm(x), this.mm(y), this.mm(w), this.mm(h));
  }
  // 文章を枠の幅で折り返す（日本語は1文字ずつ）
  wrap(s: string, w: number): string[] {
    const out: string[] = [];
    let cur = "";
    for (const ch of s) {
      if (this.width(cur + ch) > w && cur) {
        if (NO_START.includes(ch)) {
          cur += ch;
          continue;
        }
        out.push(cur);
        cur = ch;
      } else cur += ch;
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  }
}

type Row = { label: string; main: string; sub?: string };

function paint(p: Painter, n: NoticeDraft) {
  // ---- いちばん上：送信枚数と日付 ----
  p.font(9, 600);
  const sheets = `送信枚数　本票を含め ${n.sheets || "1"} 枚`;
  const sw = p.width(sheets) + 6;
  p.rect(L, p.y, sw, 6.5);
  p.text(sheets, L + 3, p.y + 3.25);
  p.font(10.5, 600);
  p.text(reiwa(n.issueDate), L + W, p.y + 3.25, "right");
  p.y += 6.5 + p.sz(7);

  // ---- 題名 ----
  p.font(26, 800);
  p.text("送　付　書", L + W / 2, p.y + p.sz(5.5), "center");
  p.y += p.sz(12);
  p.line(L, p.y, L + W, p.y, 0.7);
  p.line(L, p.y + 1, L + W, p.y + 1, 0.25);
  p.y += 1 + p.sz(5);

  // ---- 送付先・発信元の枠 ----
  const LW = 24;
  const fromLine = [n.fromOrg, n.fromRole, n.fromName].filter(Boolean).join("　");
  const tel = [n.fromPhone && `携帯 ${n.fromPhone}`, n.fromTel].filter(Boolean).join("　");
  const head: { label: string; value: string; pt: number; weight: number; h: number; sama?: boolean }[] = [
    { label: "送付先", value: n.to, pt: 13, weight: 800, h: 12, sama: true },
    { label: "発信元", value: fromLine, pt: 11, weight: 700, h: 10 },
  ];
  if (n.fromAddress) head.push({ label: "住所", value: n.fromAddress, pt: 10, weight: 500, h: 8.5 });
  if (tel) head.push({ label: "連絡先", value: tel, pt: 10, weight: 600, h: 8.5 });
  const top = p.y;
  head.forEach((r, i) => {
    const h = p.sz(r.h);
    p.shade(L, p.y, LW, h);
    p.font(9.5, 800);
    p.text(r.label, L + LW / 2, p.y + h / 2, "center");
    const vw = W - LW - 8 - (r.sama ? 10 : 0);
    p.fitText(r.value, L + LW + 4, p.y + h / 2, vw, r.pt, r.weight);
    if (r.sama) {
      p.font(12, 700);
      p.text("様", L + W - 4, p.y + h / 2, "right");
    }
    if (i > 0) p.line(L, p.y, L + W, p.y);
    p.y += h;
  });
  p.line(L + LW, top, L + LW, p.y);
  p.rect(L, top, W, p.y - top, 0.6);
  p.y += p.sz(8);

  // ---- 件名 ----
  p.font(14, 800);
  const subj = `件名　「${n.subject || "　"}」の件`;
  let subjPt = 14;
  while (p.width(subj) > W && subjPt > 9) {
    subjPt -= 0.5;
    p.font(subjPt, 800);
  }
  const subjW = p.width(subj);
  p.text(subj, L + W / 2, p.y, "center");
  p.line(L + W / 2 - subjW / 2, p.y + p.sz(4), L + W / 2 + subjW / 2, p.y + p.sz(4), 0.35);
  p.y += p.sz(9.5);

  // ---- 本文 ----
  p.font(10.5, 500);
  const lh = p.sz(6.2);
  const paras = n.body.split("\n").filter((s) => s.trim());
  if (n.contact) paras.push(`何かありましたら、${n.contact}までご連絡をお願いいたします。`);
  for (const para of paras) {
    const lines = p.wrap(`　${para.trim()}`, W);
    for (const l of lines) {
      p.text(l, L, p.y);
      p.y += lh;
    }
  }
  p.y += p.sz(3);

  // ---- 記 ----
  p.font(12, 800);
  p.text("記", L + W / 2, p.y, "center");
  p.y += p.sz(6);

  // ---- 期日・会場 ----
  const rows: Row[] = [];
  rows.push({
    label: "期日",
    main: reiwa(n.date) || "　",
    sub: n.reserveDate ? `予備日　${reiwa(n.reserveDate, false)}` : undefined,
  });
  rows.push({ label: "会場", main: n.venue || "　", sub: n.venueAddress ? `住所　${n.venueAddress}` : undefined });
  if (n.reserveVenue)
    rows.push({
      label: "予備日会場",
      main: n.reserveVenue,
      sub: n.reserveVenueAddress ? `住所　${n.reserveVenueAddress}` : undefined,
    });
  if (n.rain) rows.push({ label: "雨天判定", main: n.rain });
  const t2 = p.y;
  rows.forEach((r, i) => {
    const h = p.sz(r.sub ? 13 : 9);
    p.shade(L, p.y, LW, h);
    p.font(9.5, 800);
    p.text(r.label, L + LW / 2, p.y + h / 2, "center");
    if (r.sub) {
      p.fitText(r.main, L + LW + 4, p.y + h * 0.34, W - LW - 8, 11.5, 800);
      p.fitText(r.sub, L + LW + 4, p.y + h * 0.72, W - LW - 8, 9.5, 500);
    } else {
      p.fitText(r.main, L + LW + 4, p.y + h / 2, W - LW - 8, 11.5, 800);
    }
    if (i > 0) p.line(L, p.y, L + W, p.y);
    p.y += h;
  });
  p.line(L + LW, t2, L + LW, p.y);
  p.rect(L, t2, W, p.y - t2, 0.6);
  p.y += p.sz(6);

  // ---- 試合順・審判 ----
  const games = n.games.filter((g) => g.first || g.third || g.time);
  if (games.length) {
    p.font(10.5, 800);
    p.text("試合順・審判", L, p.y + p.sz(2));
    p.y += p.sz(5);
    // 列：試合｜1塁ベンチ｜対｜3塁ベンチ｜時刻｜審判（「対」の両側は縦線なし）
    const cols = [15, 42, 8, 42, 24, W - 15 - 42 - 8 - 42 - 24];
    const labels = ["試合", "1塁ベンチ", "", "3塁ベンチ", "時刻", "審判"];
    const noLine = [1, 2]; // この列の右側には縦線を引かない
    const t3 = p.y;
    const hh = p.sz(7.5);
    p.shade(L, p.y, W, hh);
    let x = L;
    cols.forEach((w, i) => {
      p.font(9.5, 800);
      p.text(labels[i], x + w / 2, p.y + hh / 2, "center");
      x += w;
    });
    p.y += hh;
    p.line(L, p.y, L + W, p.y, 0.5);
    games.forEach((g, i) => {
      const h = p.sz(14);
      let cx = L;
      // 試合
      p.font(9, 700);
      p.text(`第${i + 1}`, cx + cols[0] / 2, p.y + h * 0.36, "center");
      p.text("試合", cx + cols[0] / 2, p.y + h * 0.68, "center");
      cx += cols[0];
      // 1塁・対・3塁
      p.fitText(g.first, cx + 2, p.y + h / 2, cols[1] - 4, 11, 800, "center");
      cx += cols[1];
      p.font(9.5, 700);
      p.text("対", cx + cols[2] / 2, p.y + h / 2, "center");
      cx += cols[2];
      p.fitText(g.third, cx + 2, p.y + h / 2, cols[3] - 4, 11, 800, "center");
      cx += cols[3];
      // 時刻
      if (g.time) {
        const [hh2, mm2] = g.time.split(":");
        p.fitText(`${Number(hh2)}:${mm2}`, cx, p.y + h * 0.42, cols[4], 16, 700, "center", p.NUM);
        p.font(8.5, 700);
        p.text(g.timeNote, cx + cols[4] / 2, p.y + h * 0.78, "center");
      }
      cx += cols[4];
      // 審判
      const same = g.plate && g.plate === g.base;
      if (same) {
        p.font(8, 700);
        p.text("主審・塁審", cx + cols[5] / 2, p.y + h * 0.32, "center");
        p.fitText(g.plate, cx + 2, p.y + h * 0.66, cols[5] - 4, 10, 800, "center");
      } else if (g.plate || g.base) {
        p.font(8, 700);
        p.text("主審", cx + 3, p.y + h * 0.32);
        p.text("塁審", cx + 3, p.y + h * 0.7);
        p.fitText(g.plate, cx + 11, p.y + h * 0.32, cols[5] - 13, 9.5, 800);
        p.fitText(g.base, cx + 11, p.y + h * 0.7, cols[5] - 13, 9.5, 800);
      }
      if (i > 0) p.line(L, p.y, L + W, p.y);
      p.y += h;
    });
    x = L;
    cols.slice(0, -1).forEach((w, i) => {
      x += w;
      if (!noLine.includes(i)) p.line(x, t3, x, p.y);
    });
    p.rect(L, t3, W, p.y - t3, 0.6);
    p.y += p.sz(6);
  }

  // ---- 連絡事項 ----
  const notes = n.notes.split("\n").map((s) => s.trim()).filter(Boolean);
  if (notes.length) {
    p.font(10.5, 500);
    const lh2 = p.sz(5.9);
    for (const note of notes) {
      const lines = p.wrap(note, W - 6);
      lines.forEach((l, i) => {
        if (i === 0) p.text("○", L, p.y);
        p.text(l, L + 6, p.y);
        p.y += lh2;
      });
    }
  }
  p.y += p.sz(2);
  p.font(10.5, 600);
  p.text("以上", L + W, p.y, "right");
  p.y += p.sz(4);
}

// 送付書をえがいたキャンバスを返す（scale = 細かさ）
export async function drawNotice(n: NoticeDraft, scale = 2): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const JP = cssVar("--jp") || "sans-serif";
  const NUM = cssVar("--num") || JP;
  const K = PX_PER_MM * scale;
  const c = document.createElement("canvas");
  c.width = Math.round(PAGE_W * K);
  c.height = Math.round(PAGE_H * K);
  const ctx = c.getContext("2d")!;

  // まず位置だけ計算し、はみ出すなら全体を小さくする
  let f = 1;
  for (let i = 0; i < 8; i++) {
    const dry = new Painter(ctx, K, f, JP, NUM, true);
    paint(dry, n);
    if (dry.y <= BOTTOM) break;
    f *= Math.max(0.8, (BOTTOM - 14) / (dry.y - 14)) * 0.99;
  }
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  const p = new Painter(ctx, K, f, JP, NUM, false);
  paint(p, n);
  return c;
}

export async function noticeToPdf(n: NoticeDraft, filename: string): Promise<File> {
  const c = await drawNotice(n, 2.5);
  return new File([jpegPagesToPdf([await toJpeg(c)])], filename, { type: "application/pdf" });
}
