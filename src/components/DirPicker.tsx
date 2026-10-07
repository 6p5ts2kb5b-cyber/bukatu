"use client";

// 名簿（名前と携帯・学校とFAX・会場と住所）からボタンで選ぶ部品。
// 送付書と予定の両方で使います。新しい人・会場はその場で登録できます。

import { useState } from "react";
import { inputClass } from "@/components/ui";
import { addDirectory, deleteDirectory, type DirEntry, type DirKind } from "@/lib/directory";
import { formatPhone } from "@/lib/notices";

// 名簿（名前と電話・学校とFAX）からボタンで選ぶ。新しい人はその場で登録できる
export function DirPicker({
  kind,
  entries,
  isOn,
  onPick,
  draft,
  onChanged,
}: {
  kind: DirKind;
  entries: DirEntry[];
  isOn: (e: DirEntry) => boolean;
  onPick: (e: DirEntry) => void;
  draft?: { name: string; number: string }; // 今入っている内容（登録ボタン用）
  onChanged: () => void;
}) {
  const list = entries.filter((e) => e.kind === kind);
  const [extra, setExtra] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [num, setNum] = useState("");
  const words =
    kind === "fax"
      ? { name: "学校名", num: "FAX番号", ph: "例：住吉中", phn: "049-000-0000" }
      : kind === "venue"
        ? { name: "会場名", num: "住所", ph: "例：坂戸市民総合運動公園 軟式球場A面", phn: "例：坂戸市大字小沼…" }
        : { name: "名前", num: "携帯番号", ph: "例：玉城 義将", phn: "090-0000-0000" };
  const fmt = (v: string) => (kind === "venue" ? v.trim() : formatPhone(v));
  const canSaveDraft =
    draft && draft.name.trim() && draft.number.trim() && !list.some((e) => e.name === draft.name.trim() && e.number === fmt(draft.number));
  const save = async (nm: string, nb: string) => {
    if (!nm.trim() || !nb.trim()) return;
    const e = await addDirectory(kind, nm, fmt(nb), extra);
    setAdding(false);
    setName("");
    setNum("");
    setExtra("");
    onChanged();
    onPick(e);
  };
  return (
    <div className="dir">
      <div className="picks">
        {list.map((e) => (
          <button
            key={e.id}
            type="button"
            className="pick dir__pick"
            aria-pressed={isOn(e)}
            onClick={async () => {
              if (editing) {
                if (e.preset) return;
                if (confirm(`「${e.name}」を名簿から消しますか？`)) {
                  await deleteDirectory(e.id);
                  onChanged();
                }
                return;
              }
              onPick(e);
            }}
          >
            {editing && !e.preset && <span className="dir__x">×</span>}
            {e.name}
            {(e.number || e.extra) && <small className="pick__sub">{kind === "venue" ? (e.extra || e.number).replace(/(駅).*/, "$1") : e.number}</small>}
          </button>
        ))}
        <button type="button" className="pick pick--other" onClick={() => setAdding(!adding)}>
          ＋ 登録
        </button>
        {list.some((e) => !e.preset) && (
          <button type="button" className="dir__edit" onClick={() => setEditing(!editing)}>
            {editing ? "おわる" : "名簿を整理"}
          </button>
        )}
      </div>
      {canSaveDraft && !adding && (
        <button type="button" className="dir__save" onClick={() => save(draft!.name, draft!.number)}>
          「{draft!.name}　{fmt(draft!.number)}」を名簿に登録する
        </button>
      )}
      {adding && (
        <div className="dir__form">
          <input className={`${inputClass} f-input--white`} value={name} onChange={(e) => setName(e.target.value)} placeholder={words.ph} aria-label={words.name} autoComplete="off" />
          <input
            className={`${inputClass} f-input--white`}
            value={num}
            onChange={(e) => setNum(e.target.value)}
            placeholder={words.phn}
            aria-label={words.num}
            inputMode={kind === "venue" ? "text" : "tel"}
            autoComplete="off"
          />
          {kind === "venue" && (
            <input
              className={`${inputClass} f-input--white`}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="最寄駅（例：東武東上線 坂戸駅）"
              aria-label="最寄駅"
              autoComplete="off"
            />
          )}
          <button type="button" className="btn btn--primary btn--small" onClick={() => save(name, num)}>
            登録して使う
          </button>
        </div>
      )}
    </div>
  );
}

