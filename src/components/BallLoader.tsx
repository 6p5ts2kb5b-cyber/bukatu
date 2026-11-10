"use client";

// 読み込み中の絵：立体の野球ボール（本物と同じ形の縫い目）が回転しながら、
// 奥行きのあるダイヤモンドを ホーム → 一塁 → 二塁 → 三塁 → ホーム と弾んで回ります。
// ボールが着いた塁は赤く光り、地面の影はボールが高いほど小さく・うすくなります。
// small のときは、その場で回るボールだけ。動きを減らす設定の人には止まった絵を出します。

import { useEffect, useRef } from "react";

type V3 = [number, number, number];

// 縫い目の形（球の上の曲線：a+b=1 なら必ず球の表面にのる）
const A = 0.71;
const B = 1 - A;
const C = 2 * Math.sqrt(A * B);
const SEAM: V3[] = [];
const SIDE: V3[] = []; // 縫い目に直角な、球の表面にそった向き（糸をかける向き）
const N = 160;
for (let i = 0; i < N; i++) {
  const t = (i / N) * Math.PI * 2;
  SEAM.push([A * Math.cos(t) + B * Math.cos(3 * t), A * Math.sin(t) - B * Math.sin(3 * t), C * Math.sin(2 * t)]);
}
for (let i = 0; i < N; i++) {
  const p = SEAM[i];
  const a = SEAM[(i + 1) % N];
  const b = SEAM[(i + N - 1) % N];
  const tg: V3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const s: V3 = [p[1] * tg[2] - p[2] * tg[1], p[2] * tg[0] - p[0] * tg[2], p[0] * tg[1] - p[1] * tg[0]];
  const l = Math.hypot(...s) || 1;
  SIDE.push([s[0] / l, s[1] / l, s[2] / l]);
}

function rotate(p: V3, spin: number, yaw: number, tilt: number): V3 {
  // 横の軸で回転（ボールの回転）→ 縦の軸でゆっくり向きを変える → 少し手前に傾ける
  let [x, y, z] = p;
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  [y, z] = [y * cs - z * ss, y * ss + z * cs];
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  [y, z] = [y * ct - z * st, y * st + z * ct];
  return [x, y, z];
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ボール1つをえがく（cx, cy＝中心、r＝半径。spin・yaw＝回転）
function drawBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, spin: number, yaw: number) {
  // 革：左上から光が当たる球
  const g = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.05, cx, cy, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, "#f7f4ee");
  g.addColorStop(0.85, "#ddd6c9");
  g.addColorStop(1, "#bfb6a6");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  const pts = SEAM.map((p) => rotate(p, spin, yaw, 0.35));
  const sides = SIDE.map((p) => rotate(p, spin, yaw, 0.35));
  const scr = (p: V3): [number, number] => [cx + p[0] * r, cy - p[1] * r];
  const off = (p: V3, s: V3, k: number): V3 => {
    const q: V3 = [p[0] + s[0] * k, p[1] + s[1] * k, p[2] + s[2] * k];
    const l = Math.hypot(...q);
    return [q[0] / l, q[1] / l, q[2] / l];
  };

  ctx.save();
  ctx.lineCap = "round";
  // 縫い目の2本の線（うすい赤）
  ctx.strokeStyle = "rgba(196,43,59,0.55)";
  ctx.lineWidth = Math.max(0.6, r * 0.035);
  for (const side of [1, -1]) {
    for (let i = 0; i < N; i++) {
      const p0 = off(pts[i], sides[i], 0.045 * side);
      const p1 = off(pts[(i + 1) % N], sides[(i + 1) % N], 0.045 * side);
      const vis = smooth(0.0, 0.25, Math.min(p0[2], p1[2]));
      if (vis <= 0) continue;
      ctx.globalAlpha = vis;
      ctx.beginPath();
      ctx.moveTo(...scr(p0));
      ctx.lineTo(...scr(p1));
      ctx.stroke();
    }
  }
  // 糸（V の形の縫い目）
  ctx.strokeStyle = "#c42b3b";
  ctx.lineWidth = Math.max(0.8, r * 0.07);
  for (let i = 0; i < N; i += 4) {
    const p = pts[i];
    const s = sides[i];
    const ahead = pts[(i + 2) % N];
    const vis = smooth(0.02, 0.3, p[2]);
    if (vis <= 0) continue;
    ctx.globalAlpha = vis;
    for (const side of [1, -1]) {
      const inner = off(p, s, 0.04 * side);
      const outer = off(ahead, sides[(i + 2) % N], 0.16 * side);
      ctx.beginPath();
      ctx.moveTo(...scr(inner));
      ctx.lineTo(...scr(outer));
      ctx.stroke();
    }
  }
  ctx.restore();

  // ふちの陰と、つやの光
  const rim = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r);
  rim.addColorStop(0, "rgba(15,42,33,0)");
  rim.addColorStop(1, "rgba(15,42,33,0.18)");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
  const shine = ctx.createRadialGradient(cx - r * 0.42, cy - r * 0.48, 0, cx - r * 0.42, cy - r * 0.48, r * 0.45);
  shine.addColorStop(0, "rgba(255,255,255,0.85)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---- ダイヤモンド（奥行きのある地面） ----
// 地面の座標：ホーム(0,0) 一塁(1,1) 二塁(0,2) 三塁(-1,1)。z は奥。y は高さ
const BASES: [number, number][] = [
  [0, 0],
  [1, 1],
  [0, 2],
  [-1, 1],
];
const LEG = 0.62; // 1つの塁から次の塁まで（秒）

export function BallLoader({ small = false }: { small?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const W = small ? 44 : 168;
    const H = small ? 44 : 124;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // 見下ろす向きの遠近（カメラはホームの後ろ・上）
    const F = 150;
    const CAM_Z = -1.75;
    const CAM_H = 1.55;
    const HOR = H - 26 - (F * CAM_H) / (0 - CAM_Z);
    const proj = (x: number, y: number, z: number): [number, number, number] => {
      const d = z - CAM_Z;
      return [W / 2 + (F * x) / d, HOR + (F * (CAM_H - y)) / d, F / d];
    };
    const lit = [0, 0, 0, 0]; // 塁が光っている強さ

    const frameSmall = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const bob = still ? 0 : Math.abs(Math.sin(t * 3.2)) * 4;
      const cy = H / 2 - 2 - bob;
      const r = 13;
      // 影
      ctx.fillStyle = `rgba(15,42,33,${0.22 - bob * 0.025})`;
      ctx.beginPath();
      ctx.ellipse(cx, H - 6, r * (0.9 - bob * 0.04), 3, 0, 0, Math.PI * 2);
      ctx.fill();
      drawBall(ctx, cx, cy, r, t * 7, t * 1.1);
    };

    let last = 0;
    const frame = (t: number) => {
      const dt = Math.min(0.05, t - last);
      last = t;
      ctx.clearRect(0, 0, W, H);

      // 今どの塁の間か
      const cycle = t / LEG;
      const leg = ((Math.floor(cycle) % 4) + 4) % 4;
      const k = cycle - Math.floor(cycle);
      const e = still ? 0 : k * k * (3 - 2 * k); // ゆっくり出て、ゆっくり着く
      const [x0, z0] = BASES[leg];
      const [x1, z1] = BASES[(leg + 1) % 4];
      const bx = x0 + (x1 - x0) * e;
      const bz = z0 + (z1 - z0) * e;
      const by = still ? 0.18 : 0.17 + Math.sin(Math.PI * k) * 0.5;
      // 着いた塁を光らせ、だんだん消す
      for (let i = 0; i < 4; i++) lit[i] = Math.max(0, lit[i] - dt * 1.6);
      if (!still && k > 0.9) lit[(leg + 1) % 4] = 1;

      // 内野の土（ダイヤモンドより少し大きい）
      const dirt = [
        [0, -0.32],
        [1.32, 1],
        [0, 2.32],
        [-1.32, 1],
      ].map(([x, z]) => proj(x, 0, z));
      const gDirt = ctx.createLinearGradient(0, dirt[2][1], 0, dirt[0][1]);
      gDirt.addColorStop(0, "rgba(201,138,85,0.22)");
      gDirt.addColorStop(1, "rgba(201,138,85,0.5)");
      ctx.beginPath();
      dirt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = gDirt;
      ctx.fill();
      // 内野の芝
      const grass = [
        [0, 0.36],
        [0.64, 1],
        [0, 1.64],
        [-0.64, 1],
      ].map(([x, z]) => proj(x, 0, z));
      ctx.beginPath();
      grass.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = "rgba(47,125,54,0.55)";
      ctx.fill();
      // 塁の間の白い線
      const corners = BASES.map(([x, z]) => proj(x, 0, z));
      ctx.beginPath();
      corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // マウンド
      const [mx, my, ms] = proj(0, 0, 1);
      ctx.fillStyle = "rgba(192,130,80,0.75)";
      ctx.beginPath();
      ctx.ellipse(mx, my, ms * 0.13, ms * 0.13 * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();

      // 塁（奥から順に）
      const order = [2, 1, 3, 0];
      for (const i of order) {
        const [x, z] = BASES[i];
        const s = 0.11;
        const quad =
          i === 0
            ? [
                // ホームベース：平らな辺が投手側、とがった先が捕手側（手前）
                [x - s, z + s * 0.5],
                [x + s, z + s * 0.5],
                [x + s, z - s * 0.4],
                [x, z - s],
                [x - s, z - s * 0.4],
              ]
            : [
                [x, z - s],
                [x + s, z],
                [x, z + s],
                [x - s, z],
              ];
        const pts = quad.map(([qx, qz]) => proj(qx, 0, qz));
        const glow = lit[i];
        if (glow > 0) {
          const [gx, gy, gs] = proj(x, 0, z);
          const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, gs * 0.38);
          halo.addColorStop(0, `rgba(196,43,59,${0.45 * glow})`);
          halo.addColorStop(1, "rgba(196,43,59,0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.ellipse(gx, gy, gs * 0.38, gs * 0.38 * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = glow > 0 ? `rgb(${255 - 59 * glow},${255 - 212 * glow},${255 - 196 * glow})` : "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "rgba(15,42,33,0.25)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // ボールの影（高いほど小さく・うすく）
      const [sx, sy, ss] = proj(bx, 0, bz);
      const hgt = Math.max(0, by - 0.17);
      ctx.fillStyle = `rgba(15,42,33,${0.3 - hgt * 0.32})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, ss * (0.16 - hgt * 0.07), ss * (0.16 - hgt * 0.07) * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // ボール（進む向きに合わせて、前に転がる回転）
      const [px, py, ps] = proj(bx, by, bz);
      const dir = Math.atan2(x1 - x0, z1 - z0);
      drawBall(ctx, px, py, ps * 0.17, t * 9, dir + 0.6);
    };

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const t = Math.max(0, (now - start) / 1000);
      if (small) frameSmall(t);
      else frame(t);
      if (!still) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [small]);

  return <canvas ref={ref} className={`ballloader${small ? " ballloader--small" : ""}`} aria-hidden />;
}
