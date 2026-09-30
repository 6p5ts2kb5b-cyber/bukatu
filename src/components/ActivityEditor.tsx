"use client";

// 活動予定を入力・編集する部品です（新規作成と編集の両方で使います）。

import { useCallback, useEffect, useState } from "react";
import {
  ACTIVITY_TYPES,
  defaultDivisions,
  DIVISIONS,
  divisionLabel,
  formatDateLong,
  newGroup,
  type Activity,
  type ActivityGroup,
  type DivisionKey,
  recentPlaces,
} from "@/lib/activities";
import { addPackingItem, listPackingItems, type PackingItem } from "@/lib/packing";
import { Card, ErrorText, Field, inputClass, PrimaryButton, ToggleButton } from "@/components/ui";

export type ActivityDraft = Omit<Activity, "id"> & { id?: string };

type Options = {
  packingItems: PackingItem[];
  venues: string[];
  meetPlaces: string[];
  onAddPacking: (name: string) => Promise<void>;
};

function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="time"
        step={300}
        className={`${inputClass} text-lg font-bold`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function GroupEditor({
  group,
  onChange,
  options,
}: {
  group: ActivityGroup;
  onChange: (g: ActivityGroup) => void;
  options: Options;
}) {
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const needsTournament = group.type === "公式戦" || group.type === "大会";
  const isOff = group.type === "練習なし";
  const set = (patch: Partial<ActivityGroup>) => onChange({ ...group, ...patch });

  const togglePacking = (name: string) => {
    const has = group.packing.includes(name);
    set({ packing: has ? group.packing.filter((p) => p !== name) : [...group.packing, name] });
  };

  const addItem = async () => {
    const name = newItem.trim();
    if (!name) return;
    setAdding(true);
    try {
      if (!options.packingItems.some((p) => p.name === name)) await options.onAddPacking(name);
      if (!group.packing.includes(name)) set({ packing: [...group.packing, name] });
      setNewItem("");
    } finally {
      setAdding(false);
    }
  };

  // マスターから外れた持ち物も、選ばれていれば表示する
  const itemNames = [
    ...options.packingItems.filter((p) => p.active).map((p) => p.name),
    ...group.packing.filter((n) => !options.packingItems.some((p) => p.name === n)),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-navy-soft">活動種別</span>
        <div className="grid grid-cols-3 gap-2">
          {ACTIVITY_TYPES.map((t) => (
            <ToggleButton key={t} on={group.type === t} label={t} onClick={() => set({ type: t })} />
          ))}
        </div>
      </div>
      {needsTournament && (
        <Field label="大会名">
          <input
            className={inputClass}
            value={group.tournamentName}
            onChange={(e) => set({ tournamentName: e.target.value })}
            placeholder="例：秋季新人大会"
            autoComplete="off"
          />
        </Field>
      )}

      {!isOff && (
        <>
          <Field label="会場">
            <input
              className={inputClass}
              value={group.venue}
              onChange={(e) => set({ venue: e.target.value })}
              placeholder="例：桜中学校 グラウンド"
              list="venue-options"
              autoComplete="off"
            />
          </Field>
          <datalist id="venue-options">
            {options.venues.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>

          <div className="grid grid-cols-2 gap-3">
            <TimeInput label="開始時間" value={group.startTime} onChange={(v) => set({ startTime: v })} />
            <TimeInput label="終了時間" value={group.endTime} onChange={(v) => set({ endTime: v })} />
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-field p-4">
            <span className="text-base font-extrabold">集合</span>
            <TimeInput label="集合時間" value={group.meetTime} onChange={(v) => set({ meetTime: v })} />
            <Field label="集合場所">
              <input
                className={`${inputClass} bg-white`}
                value={group.meetPlace}
                onChange={(e) => set({ meetPlace: e.target.value })}
                placeholder="例：若葉駅、現地"
                list="meet-options"
                autoComplete="off"
              />
            </Field>
            <datalist id="meet-options">
              {options.meetPlaces.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-2">
              {["現地", "各学校"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set({ meetPlace: p })}
                  className="min-h-10 rounded-full bg-white px-4 text-sm font-bold ring-1 ring-navy/15 active:bg-navy/10"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-navy-soft">持ち物（タップで選択）</span>
              <span className="text-sm font-bold text-navy-soft/70">{group.packing.length}点</span>
            </div>
            {options.packingItems.length === 0 ? (
              <p className="text-sm text-navy-soft/70">読み込み中…</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {itemNames.map((name) => (
                  <ToggleButton
                    key={name}
                    on={group.packing.includes(name)}
                    label={name}
                    onClick={() => togglePacking(name)}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="持ち物を追加（例：タオル）"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={addItem}
                disabled={adding || !newItem.trim()}
                className="min-h-12 shrink-0 rounded-xl bg-navy px-4 text-base font-bold text-white disabled:opacity-40"
              >
                追加
              </button>
            </div>
          </div>
        </>
      )}

      <Field label={`${divisionLabel(group.division)}の備考`}>
        <textarea
          className={`${inputClass} min-h-24 py-3`}
          value={group.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="例：雨天時は体育館で練習"
        />
      </Field>
    </div>
  );
}

export function ActivityEditor({
  initial,
  isNew,
  onSave,
}: {
  initial: ActivityDraft;
  isNew: boolean;
  onSave: (a: ActivityDraft) => Promise<void>;
}) {
  const [a, setA] = useState<ActivityDraft>(initial);
  const [tab, setTab] = useState<DivisionKey>(initial.groups[0]?.division ?? "main");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packingItems, setPackingItems] = useState<PackingItem[]>([]);
  const [places, setPlaces] = useState<{ venues: string[]; meetPlaces: string[] }>({
    venues: [],
    meetPlaces: [],
  });

  useEffect(() => {
    listPackingItems().then(setPackingItems).catch(() => {});
    recentPlaces().then(setPlaces).catch(() => {});
  }, []);

  const onAddPacking = useCallback(
    async (name: string) => {
      const order = packingItems.reduce((m, p) => Math.max(m, p.order), 0) + 1;
      const item = await addPackingItem(name, order);
      setPackingItems((prev) => [...prev, item]);
    },
    [packingItems],
  );

  // 新規作成で日付を変えたら、区分を月に合わせて自動で入れ直す（入力済みの内容は残す）
  const changeDate = (date: string) => {
    if (!isNew || !date) {
      setA({ ...a, date });
      return;
    }
    const keys = defaultDivisions(date);
    const groups = keys.map((k) => a.groups.find((g) => g.division === k) ?? newGroup(k));
    setA({ ...a, date, groups });
    setTab(keys[0]);
  };

  const toggleDivision = (key: DivisionKey) => {
    const has = a.groups.some((g) => g.division === key);
    if (has) {
      if (a.groups.length === 1) {
        setError("区分は1つ以上必要です");
        return;
      }
      const groups = a.groups.filter((g) => g.division !== key);
      setA({ ...a, groups });
      if (tab === key) setTab(groups[0].division);
    } else {
      const order = DIVISIONS.map((d) => d.key);
      const groups = [...a.groups, newGroup(key)].sort(
        (x, y) => order.indexOf(x.division) - order.indexOf(y.division),
      );
      setA({ ...a, groups });
      setTab(key);
    }
    setError(null);
  };

  const updateGroup = (g: ActivityGroup) => {
    setA({ ...a, groups: a.groups.map((x) => (x.division === g.division ? g : x)) });
  };

  const top = a.groups.find((g) => g.division === "top");
  const academy = a.groups.find((g) => g.division === "academy");
  const copyTopToAcademy = () => {
    if (!top || !academy) return;
    updateGroup({ ...top, division: "academy" });
    setTab("academy");
  };

  const current = a.groups.find((g) => g.division === tab) ?? a.groups[0];

  const submit = async () => {
    setError(null);
    if (!a.date) return setError("日付を選んでください");
    if (a.groups.length === 0) return setError("区分を1つ以上選んでください");
    setSaving(true);
    try {
      await onSave(a);
    } catch {
      setError("保存できませんでした。電波の良い場所でもう一度お試しください。");
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <h2 className="text-lg font-extrabold">① 基本情報</h2>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="日付">
            <input
              type="date"
              className={inputClass}
              value={a.date}
              onChange={(e) => changeDate(e.target.value)}
            />
          </Field>
          {a.date && <p className="text-base font-bold">{formatDateLong(a.date)}</p>}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-navy-soft">区分（タップで追加・削除）</span>
            <div className="grid grid-cols-3 gap-2">
              {DIVISIONS.map((d) => (
                <ToggleButton
                  key={d.key}
                  on={a.groups.some((g) => g.division === d.key)}
                  label={d.label}
                  onClick={() => toggleDivision(d.key)}
                />
              ))}
            </div>
            <p className="text-sm text-navy-soft/70">
              5〜11月は「連合チーム」、12〜4月は「トップ」「アカデミー」が自動で選ばれます。桜のみ・住吉のみ・浅羽野と住吉だけで活動する日は、ここで切り替えてください。
            </p>
          </div>
          <Field label="この日全体の備考">
            <textarea
              className={`${inputClass} min-h-20 py-3`}
              value={a.note}
              onChange={(e) => setA({ ...a, note: e.target.value })}
              placeholder="例：保護者会あり"
            />
          </Field>
        </div>
      </Card>

      {current && (
        <Card>
          {a.groups.length > 1 && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3" role="tablist">
              {a.groups.map((g) => (
                <button
                  key={g.division}
                  type="button"
                  role="tab"
                  aria-selected={tab === g.division}
                  onClick={() => setTab(g.division)}
                  className={`min-h-12 rounded-xl px-2 text-base font-bold ${
                    tab === g.division ? "bg-navy text-white" : "bg-field text-navy-soft/70"
                  }`}
                >
                  {divisionLabel(g.division)}
                </button>
              ))}
            </div>
          )}
          <h2 className="mb-4 text-lg font-extrabold">{divisionLabel(current.division)}の予定</h2>
          <GroupEditor
            key={current.division}
            group={current}
            onChange={updateGroup}
            options={{ packingItems, onAddPacking, ...places }}
          />
          {top && academy && tab === "academy" && (
            <button
              type="button"
              onClick={copyTopToAcademy}
              className="mt-4 min-h-12 w-full rounded-xl bg-field text-base font-bold ring-1 ring-navy/10 active:bg-navy/10"
            >
              トップの内容をアカデミーにコピー
            </button>
          )}
        </Card>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <div className="sticky bottom-20 z-10">
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "保存中…" : isNew ? "この内容で登録する" : "保存する"}
        </PrimaryButton>
      </div>
    </>
  );
}
