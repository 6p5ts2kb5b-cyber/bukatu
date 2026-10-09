// 画面の予定表を PDF にして、LINE・メールなどで送るための道具です。
//   1. 予定表を、ブラウザが組んだ位置どおりにキャンバスへえがいて画像にする（外部の道具は使いません）
//   2. 行の途中で切れないように A4 ごとに分けて、PDF にまとめる（外部サービスは使いません）
//   3. スマホの「共有」画面を開く → LINE・メールなどを選んで送る

const PAGE_W = 794; // A4 の幅（画面のピクセル）
const PAGE_H = 1123; // A4 の高さ
const MARGIN = 6; // 2ページ目以降の上下の余白（PDFは余白なしで用紙いっぱいに）

// 新しい色の書き方（oklab など）を、キャンバスでも確実に使える rgba に直しておく
const COLOR_PROPS = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
];
function normalizeColors(root: HTMLElement) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const toRgba = (v: string) => {
    if (!v || /^rgba?\(/.test(v)) return v;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  };
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of all) {
    const cs = getComputedStyle(el);
    for (const p of COLOR_PROPS) el.style.setProperty(p, toRgba(cs.getPropertyValue(p)));
    el.style.boxShadow = "none";
    el.style.textShadow = "none";
    if (/okl|lab\(|color-mix|color\(/.test(cs.backgroundImage)) el.style.backgroundImage = "none";
  }
}

// ---- 画面の組み方そのままに、自分でキャンバスへえがく ----
// html2canvas は日本語の文字が少し下にずれて、表の線に切られることがある。
// そこで、ブラウザが決めた「文字1つ1つの位置」をそのまま使って、線・背景・文字を自分でえがく。
function domToCanvas(root: HTMLElement, scale: number): HTMLCanvasElement {
  const origin = root.getBoundingClientRect();
  const c = document.createElement("canvas");
  c.width = Math.ceil(origin.width * scale);
  c.height = Math.ceil(root.scrollHeight * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, origin.width, root.scrollHeight);
  const X = (v: number) => v - origin.left;
  const Y = (v: number) => v - origin.top;
  const visible = (cs: CSSStyleDeclaration) => cs.display !== "none" && cs.visibility !== "hidden";
  const solid = (col: string) => col && !/rgba\([^)]*,\s*0(\.0+)?\)$/.test(col) && col !== "transparent";
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (r > 0 && "roundRect" in ctx) (ctx as CanvasRenderingContext2D & { roundRect: (...a: number[]) => void }).roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  };

  // 1) 背景と線
  const els = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (!visible(cs)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const x = X(r.left);
    const y = Y(r.top);
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    if (solid(cs.backgroundColor)) {
      ctx.fillStyle = cs.backgroundColor;
      round(x, y, r.width, r.height, rad);
      ctx.fill();
    }
    const sides = [
      ["Top", x, y, r.width, 0],
      ["Right", x + r.width, y, 0, r.height],
      ["Bottom", x, y + r.height, r.width, 0],
      ["Left", x, y, 0, r.height],
    ] as const;
    const widths = sides.map(([n]) => parseFloat(cs.getPropertyValue(`border-${n.toLowerCase()}-width`)) || 0);
    const styles = sides.map(([n]) => cs.getPropertyValue(`border-${n.toLowerCase()}-style`));
    if (rad > 0 && widths.every((w) => w > 0)) {
      // 角の丸い枠（区分のタグ・予備日の帯など）
      ctx.strokeStyle = cs.borderTopColor;
      ctx.lineWidth = widths[0];
      round(x + widths[0] / 2, y + widths[0] / 2, r.width - widths[0], r.height - widths[0], rad);
      ctx.stroke();
      continue;
    }
    sides.forEach(([n, sx, sy, sw, sh], i) => {
      const w = widths[i];
      if (!w || styles[i] === "none" || styles[i] === "hidden") return;
      ctx.strokeStyle = cs.getPropertyValue(`border-${n.toLowerCase()}-color`);
      ctx.lineWidth = w;
      ctx.setLineDash(styles[i] === "dashed" ? [3, 2] : styles[i] === "dotted" ? [1, 2] : []);
      ctx.beginPath();
      // 線は内側に寄せる
      const off = w / 2;
      if (sh === 0) {
        const yy = n === "Top" ? sy + off : sy - off;
        ctx.moveTo(sx, yy);
        ctx.lineTo(sx + sw, yy);
      } else {
        const xx = n === "Left" ? sx + off : sx - off;
        ctx.moveTo(xx, sy);
        ctx.lineTo(xx, sy + sh);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  // 2) 文字：1文字ずつ、ブラウザが置いた場所にえがく
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue ?? "";
    if (!text.trim()) continue;
    const parent = n.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    if (!visible(cs)) continue;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = "alphabetic";
    let i = 0;
    for (const ch of text) {
      const len = ch.length;
      if (ch.trim()) {
        range.setStart(n, i);
        range.setEnd(n, i + len);
        const rr = range.getClientRects()[0];
        if (rr && rr.width) {
          const m = ctx.measureText(ch);
          const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
          const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
          // 文字の箱の真ん中に、フォントの高さの真ん中を合わせる
          const base = Y(rr.top) + (rr.height - (asc + desc)) / 2 + asc;
          ctx.fillText(ch, X(rr.left), base);
        }
      }
      i += len;
    }
  }
  return c;
}

// ---- 画像（JPEG）を並べただけの、ごく小さな PDF を作る ----
export type JpegPage = { data: Uint8Array; width: number; height: number };

export function jpegPagesToPdf(pages: JpegPage[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (x: string | Uint8Array) => {
    const b = typeof x === "string" ? enc.encode(x) : x;
    parts.push(b);
    size += b.length;
  };
  const obj = (n: number, body: string | (string | Uint8Array)[]) => {
    offsets[n] = size;
    push(`${n} 0 obj\n`);
    (Array.isArray(body) ? body : [body]).forEach(push);
    push("\nendobj\n");
  };

  const W = 595.28; // A4 の幅（pt）
  const H = 841.89;
  const pageIds = pages.map((_, i) => 3 + i * 3);

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const pageId = pageIds[i];
    const drawH = (W * p.height) / p.width;
    const content = `q ${W.toFixed(2)} 0 0 ${drawH.toFixed(2)} 0 ${(H - drawH).toFixed(2)} cm /Im0 Do Q`;
    obj(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
    );
    obj(pageId + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(pageId + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>\nstream\n`,
      p.data,
      "\nendstream",
    ]);
  });
  const count = 3 + pages.length * 3;
  const xref = size;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

export function toJpeg(c: HTMLCanvasElement): Promise<JpegPage> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      async (b) => {
        if (!b) return reject(new Error("toBlob"));
        resolve({ data: new Uint8Array(await b.arrayBuffer()), width: c.width, height: c.height });
      },
      "image/jpeg",
      0.9,
    ),
  );
}

// 予定表（source）を PDF ファイルにする。行（tr）の途中ではページを切らない
// onePage = true のときは、長くても縮めてA4の1枚に収める（メンバー表など）
export async function elementToPdf(
  source: HTMLElement,
  filename: string,
  opts: { onePage?: boolean; width?: number } = {},
): Promise<File> {
  await document.fonts?.ready;
  // width：横幅を広げて組んでから縮める（1枚に収めるとき、文字の折り返しを印刷と同じにする）
  const W = opts.onePage && opts.width ? opts.width : PAGE_W;
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;background:#fff;`;
  const clone = source.cloneNode(true) as HTMLElement;
  // 画面用の縮小（zoom）は使わず、組んだ絵をあとで縮める
  clone.querySelectorAll<HTMLElement>(".pl-fit").forEach((el) => {
    el.style.setProperty("--fit", "1");
    el.style.removeProperty("width");
  });
  // PDFは余白なし：画面の見本の外側の余白を詰める
  clone.style.padding = "6px";
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    normalizeColors(clone);
    const top = clone.getBoundingClientRect().top;
    const total = Math.ceil(clone.offsetHeight);
    const cuts = Array.from(clone.querySelectorAll("tr, header, p"))
      .map((el) => Math.round(el.getBoundingClientRect().bottom - top))
      .sort((a, b) => a - b);

    // ページの区切りを決める
    const slices: [number, number][] = [];
    let start = 0;
    if (opts.onePage) {
      slices.push([0, total]);
      start = total;
    }
    while (start < total - 2) {
      const room = slices.length === 0 ? PAGE_H - MARGIN : PAGE_H - MARGIN * 2;
      let end = start + room;
      if (end >= total) end = total;
      else {
        const c = cuts.filter((y) => y > start + 120 && y <= end).pop();
        if (c) end = c;
      }
      slices.push([start, end]);
      start = end;
    }

    // 細い幅で組んだときは、そのぶん細かくえがく（A4に広げてもぼやけないように）
    const scale = 2;
    const full = domToCanvas(clone, (scale * PAGE_W) / W);
    const s = full.width / W;
    const pages: JpegPage[] = [];
    for (let i = 0; i < slices.length; i++) {
      const [a, b] = slices[i];
      const pad = i === 0 ? 0 : MARGIN;
      const c = document.createElement("canvas");
      c.width = Math.round(PAGE_W * scale);
      c.height = Math.round(PAGE_H * scale);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      const srcH = Math.round((b - a) * s);
      // 横幅をA4いっぱいに合わせる。1枚に収めるときは、縦がはみ出すならそのぶん縮める（大きくもする）
      let k = c.width / full.width;
      if (opts.onePage && srcH * k > c.height) k = c.height / srcH;
      const dw = Math.round(full.width * k);
      ctx.drawImage(
        full,
        0,
        Math.round(a * s),
        full.width,
        srcH,
        Math.round((c.width - dw) / 2),
        Math.round(pad * scale),
        dw,
        Math.round(srcH * k),
      );
      pages.push(await toJpeg(c));
    }
    return new File([jpegPagesToPdf(pages)], filename, { type: "application/pdf" });
  } finally {
    host.remove();
  }
}

// スマホの「共有」画面で送る。共有できない（パソコンなど）ときは保存する
export async function shareOrDownload(file: File, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "downloaded";
}
