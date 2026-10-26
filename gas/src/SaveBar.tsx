// 保存の状態（GAS版で足したもの）
//  ・保存中は右上に小さく「保存中…」→「保存しました」
//  ・送れなかったら赤い帯と「もう一度保存」
//  ・名簿の共有などで気をつけることがあれば、黄色い帯で知らせる

import { useEffect, useSyncExternalStore } from "react";
import { clearWarnings, getSaveState, hasPending, retrySave, subscribe } from "./shim/firestore";

export function useSaveState() {
  return useSyncExternalStore(subscribe, getSaveState);
}

export function SaveBar() {
  const s = useSaveState();

  // 送っていない変更があるまま閉じようとしたら、確かめる
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!hasPending()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  return (
    <>
      {(s.state === "saving" || s.state === "saved") && (
        <p className={`gas-chip${s.state === "saved" ? " gas-chip--ok" : ""}`} role="status" aria-live="polite">
          {s.state === "saving" ? "保存中…" : "✓ 保存しました"}
        </p>
      )}
      {(s.state === "error" || s.warnings.length > 0) && (
        <div className="gas-band" role="alert">
          {s.state === "error" && (
            <div className="gas-band__box gas-band__box--ng">
              <p>
                <b>保存できませんでした。</b>電波の良い場所でもう一度お試しください。
                {s.pending > 0 && <span className="gas-band__sub">（まだ送っていない変更 {s.pending}件）</span>}
              </p>
              <button type="button" className="btn btn--accent" onClick={retrySave}>
                もう一度保存
              </button>
            </div>
          )}
          {s.warnings.map((w, i) => (
            <div key={i} className="gas-band__box gas-band__box--warn">
              <p>{w}</p>
              <button type="button" className="btn btn--ghost" onClick={clearWarnings}>
                閉じる
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
