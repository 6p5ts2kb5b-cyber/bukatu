// 画面の予定表を PDF にして、LINE・メールなどで送るための道具です。
//   1. 予定表（A4幅 794px）を画像にする（html2canvas／MIT License を public/vendor に同梱）
//   2. 行の途中で切れないように A4 ごとに分けて、PDF にまとめる（外部サービスは使いません）
//   3. スマホの「共有」画面を開く → LINE・メールなどを選んで送る

type Html2Canvas = (el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;

const PAGE_W = 794; // A4 の幅（画面のピクセル）
const PAGE_H = 1123; // A4 の高さ
const MARGIN = 6; // 2ページ目以降の上下の余白（PDFは余白なしで用紙いっぱいに）

let loading: Promise<Html2Canvas> | null = null;
function loadHtml2Canvas(): Promise<Html2Canvas> {
  const w = window as unknown as { html2canvas?: Html2Canvas };
  if (w.html2canvas) return Promise.resolve(w.html2canvas);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/vendor/html2canvas-1.4.1.min.js";
      s.onload = () => (w.html2canvas ? resolve(w.html2canvas) : reject(new Error("html2canvas")));
      s.onerror = () => {
        loading = null;
        reject(new Error("html2canvas"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

// 新しい色の書き方（oklab など）は html2canvas が読めないので、普通の rgba に直しておく
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
  const html2canvas = await loadHtml2Canvas();
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

    const scale = 2;
    const full = await html2canvas(clone, { scale, backgroundColor: "#ffffff", logging: false, windowWidth: W });
    const s = full.width / W;
    const pages: JpegPage[] = [];
    for (let i = 0; i < slices.length; i++) {
      const [a, b] = slices[i];
      const pad = i === 0 ? 0 : MARGIN;
      const c = document.createElement("canvas");
      c.width = full.width;
      c.height = Math.round((full.width * PAGE_H) / PAGE_W);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      // 1枚に収めるとき、A4より長ければ縮める（横は中央に寄せる）
      const fit = opts.onePage ? Math.min(1, c.height / ((b - a) * s)) : 1;
      const dw = Math.round(full.width * fit);
      ctx.drawImage(
        full,
        0,
        Math.round(a * s),
        full.width,
        Math.round((b - a) * s),
        Math.round((full.width - dw) / 2),
        Math.round(pad * s),
        dw,
        Math.round((b - a) * s * fit),
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
