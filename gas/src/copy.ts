// 文章のコピー（GASの枠の中では navigator.clipboard が使えないことが多いので、順にためす）
//  1. navigator.clipboard → 2. 隠した入力欄を選んで execCommand("copy") → 3. だめなら失敗を返す
//     （3のときは、画面に全文を選んだ状態で出して「長押しでコピー」と案内する：showCopySheet）

export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* 次の方法へ */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px";
  document.body.appendChild(ta);
  const sel = document.getSelection();
  const prev = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  if (prev && sel) {
    sel.removeAllRanges();
    sel.addRange(prev);
  }
  if (!ok) {
    showCopySheet(text);
    throw new Error("copy-failed");
  }
}

// コピーできなかったとき：全文を選んだ状態で出す
export function showCopySheet(text: string) {
  const wrap = document.createElement("div");
  wrap.className = "gas-copy";
  wrap.innerHTML = `<div class="gas-copy__box" role="dialog" aria-label="コピー">
    <p class="gas-copy__title">長押しで「コピー」を選んでください</p>
    <textarea class="f-input gas-copy__text" readonly></textarea>
    <button type="button" class="btn btn--primary">閉じる</button></div>`;
  const ta = wrap.querySelector("textarea") as HTMLTextAreaElement;
  ta.value = text;
  (wrap.querySelector("button") as HTMLButtonElement).onclick = () => wrap.remove();
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) wrap.remove();
  });
  document.body.appendChild(wrap);
  ta.focus();
  ta.select();
}
