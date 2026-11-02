"use client";

// 「ログインなしでメンバー表を作れるURL」とQRコードを作って見せる画面（スタッフ用）。

import { useEffect, useState } from "react";
import { listPlayers } from "@/lib/players";
import { listTeams } from "@/lib/teams";
import { makeQr, qrToPng, shareUrl, type Qr } from "@/lib/lineupShare";
import { shareOrDownload } from "@/lib/sharePdf";
import { Loading } from "@/components/ui";

export function LineupShareDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [qr, setQr] = useState<Qr | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    Promise.all([listPlayers(), listTeams()])
      .then(([p, t]) => {
        const active = p.filter((x) => x.active);
        if (active.length === 0) return setError("選手名簿に選手がいません。先に「選手名簿」で登録してください。");
        const u = shareUrl(window.location.origin, active, t);
        setUrl(u);
        setCount(active.length);
        const q = makeQr(u);
        setQr(q);
        if (!q) setError("選手が多すぎてQRコードにできませんでした。URLをコピーして送ってください。");
      })
      .catch(() => setError("名簿を読み込めませんでした。電波の良い場所でもう一度お試しください。"));
  }, []);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setNote("URLをコピーしました。LINEなどに貼り付けて送ってください。");
    } catch {
      setNote("コピーできませんでした。下のURLを長押ししてコピーしてください。");
    }
  };

  const sendUrl = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "メンバー表をつくる", url });
      } catch {
        // やめた
      }
    } else copy();
  };

  const saveQr = async () => {
    if (!qr) return;
    try {
      const f = await qrToPng(qr, ["メンバー表をつくる", "桜・浅羽野・住吉 連合チーム（ログイン不要）"], "メンバー表QRコード.png");
      const r = await shareOrDownload(f, "メンバー表QRコード");
      if (r === "downloaded") setNote("QRコードの画像を保存しました。");
    } catch {
      setNote("もう一度「QRコードを画像で送る」を押してください。");
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center print:hidden" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="ログインなしで使えるURL"
      >
        <div className="flex items-center justify-between border-b border-navy/10 p-4">
          <h3 className="text-lg font-extrabold">ログインなしで使えるURL</h3>
          <button type="button" onClick={onClose} className="min-h-10 px-3 text-base font-bold text-navy-soft">
            閉じる
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4">
          {!url && !error && <Loading small label="URLを作っています" />}
          {error && <p className="m-0 text-sm font-bold text-ng">{error}</p>}
          {qr && (
            <figure className="share-qr">
              <svg viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} role="img" aria-label="メンバー表を作るページのQRコード" shapeRendering="crispEdges">
                <rect x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} fill="#fff" />
                <path d={qr.path} fill="#000" />
              </svg>
              <figcaption>スマホのカメラで読み取ると開きます（選手{count}人）</figcaption>
            </figure>
          )}
          {url && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn btn--line" onClick={sendUrl}>
                  URLを送る
                </button>
                <button type="button" className="btn btn--ghost" onClick={copy}>
                  URLをコピー
                </button>
              </div>
              {qr && (
                <button type="button" className="btn btn--accent" onClick={saveQr}>
                  QRコードを画像で送る・保存
                </button>
              )}
              {note && <p className="m-0 rounded-xl border border-rule bg-[#f7f9f5] p-3 text-sm font-bold">{note}</p>}
              <ul className="share-cautions">
                <li>開いた人は、守備位置・打順・控えを決めて、画像・PDF・印刷で送れます。</li>
                <li>
                  <b>アプリには保存されません</b>（作っている途中は、その人のスマホにだけ残ります）。
                </li>
                <li>
                  URLの中に<b>選手の氏名・背番号・学校・学年</b>が入っています。信頼できる人（保護者・コーチなど）だけに送ってください。
                </li>
                <li>選手名簿を変えたときは、ここでURL・QRコードを作り直してください。</li>
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
