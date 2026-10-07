"use client";

// 活動予定を入力・編集する部品です（新規作成と編集の両方で使います）。

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  type Game,
  isMatchType,
  isOffType,
  isSimpleType,
  recentPlaces,
} from "@/lib/activities";
import { addPackingItem, listPackingItems, type PackingItem } from "@/lib/packing";
import { Card, Choices, ErrorText, Field, inputClass, PanelTitle, PrimaryButton, ToggleButton } from "@/components/ui";

export type ActivityDraft = Omit<Activity, "id"> & { id?: string };

type Options = {
  packingItems: PackingItem[];
  venues: string[];
  meetPlaces: string[];
  opponents: string[];
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
      <input type="time" step={300} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

// 10分刻みで選ぶ時刻（「時」と「分」の2つの選択欄）。iPhoneでもくるくる回して選べる
function TimeSelect10({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [h, m] = value ? value.split(":") : ["", ""];
  const hours = Array.from({ length: 18 }, (_, i) => String(i + 5).padStart(2, "0")); // 5時〜22時
  if (h && !hours.includes(h)) hours.unshift(h);
  const mins = ["00", "10", "20", "30", "40", "50"];
  if (m && !mins.includes(m)) mins.push(m); // 前に入れた半端な分も消さずに残す
  return (
    <div>
      <span className="f-label">{label}</span>
      <div className="time-sel">
        <select
          className={inputClass}
          aria-label={`${label}（時）`}
          value={h}
          onChange={(e) => onChange(e.target.value ? `${e.target.value}:${m || "00"}` : "")}
        >
          <option value="">--</option>
          {hours.map((x) => (
            <option key={x} value={x}>
              {Number(x)}
            </option>
          ))}
        </select>
        <b aria-hidden>:</b>
        <select
          className={inputClass}
          aria-label={`${label}（分）`}
          value={h ? m : ""}
          disabled={!h}
          onChange={(e) => onChange(`${h}:${e.target.value}`)}
        >
          {!h && <option value="">--</option>}
          {mins.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Suggest({ id, values }: { id: string; values: string[] }) {
  return (
    <datalist id={id}>
      {values.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-ng active:bg-ng/10"
    >
      ×
    </button>
  );
}

function GamesEditor({
  no,
  games,
  opponents,
  onChange,
}: {
  no: number;
  games: Game[];
  opponents: string[];
  onChange: (g: Game[]) => void;
}) {
  const update = (i: number, patch: Partial<Game>) =>
    onChange(games.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const add = () => onChange([...games, { opponent: "", startTime: "" }]);
  const remove = (i: number) => onChange(games.filter((_, j) => j !== i));

  return (
    <Card>
      <PanelTitle no={no} aside={games.length ? `${games.length}試合` : undefined}>
        対戦相手
      </PanelTitle>
      <div className="flex flex-col gap-3">
        {games.map((g, i) => (
          <div key={i} className="rounded-xl border border-rule bg-[#f7f9f5] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-extrabold tracking-wide text-navy-soft">第{i + 1}試合</span>
              <RemoveButton onClick={() => remove(i)} label={`第${i + 1}試合を削除`} />
            </div>
            <div className="grid grid-cols-[1fr_8.5rem] gap-2">
              <input
                className={`${inputClass} f-input--white`}
                value={g.opponent}
                onChange={(e) => update(i, { opponent: e.target.value })}
                placeholder="例：坂戸中"
                list="opponent-options"
                autoComplete="off"
                aria-label={`第${i + 1}試合の対戦相手`}
              />
              <input
                type="time"
                step={300}
                className={`${inputClass} f-input--white`}
                value={g.startTime}
                onChange={(e) => update(i, { startTime: e.target.value })}
                aria-label={`第${i + 1}試合の開始時刻`}
              />
            </div>
          </div>
        ))}
        <Suggest id="opponent-options" values={opponents} />
        <button type="button" onClick={add} className="btn btn--ghost">
          ＋ 試合を追加
        </button>
      </div>
    </Card>
  );
}

function PartnersEditor({
  no,
  partners,
  opponents,
  onChange,
}: {
  no: number;
  partners: string[];
  opponents: string[];
  onChange: (p: string[]) => void;
}) {
  return (
    <Card>
      <PanelTitle no={no}>合同練習の相手</PanelTitle>
      <div className="flex flex-col gap-2">
        {partners.map((p, i) => (
          <div key={i} className="flex gap-1">
            <input
              className={inputClass}
              value={p}
              onChange={(e) => onChange(partners.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="例：鶴ヶ島中"
              list="opponent-options"
              autoComplete="off"
              aria-label={`合同練習の相手${i + 1}`}
            />
            <RemoveButton onClick={() => onChange(partners.filter((_, j) => j !== i))} label={`相手${i + 1}を削除`} />
          </div>
        ))}
        <Suggest id="opponent-options" values={opponents} />
        <button type="button" onClick={() => onChange([...partners, ""])} className="btn btn--ghost">
          ＋ 相手を追加
        </button>
      </div>
    </Card>
  );
}

function GroupEditor({
  group,
  onChange,
  options,
  tabs,
  extra,
}: {
  group: ActivityGroup;
  onChange: (g: ActivityGroup) => void;
  options: Options;
  tabs?: ReactNode;
  extra?: ReactNode;
}) {
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const needsTournament = group.type === "公式戦" || group.type === "大会";
  const isOff = isOffType(group.type);
  const isSimple = isSimpleType(group.type);
  // 平日の「部活あり」は、再登校にチェックしたときだけ会場・持ち物を出す
  const showDetails = !isOff && (!isSimple || group.returnToSchool);
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

  let no = 1;
  const label = divisionLabel(group.division);

  return (
    <>
      <Card>
        {tabs}
        <PanelTitle no={++no}>{group.division === "main" ? "活動の種類" : `${label}の活動`}</PanelTitle>
        <Choices cols={3}>
          {ACTIVITY_TYPES.map((t) => (
            <ToggleButton key={t} small on={group.type === t} label={t} onClick={() => set({ type: t })} />
          ))}
        </Choices>
        {needsTournament && (
          <div className="mt-4">
            <Field label="大会名">
              <input
                className={inputClass}
                value={group.tournamentName}
                onChange={(e) => set({ tournamentName: e.target.value })}
                placeholder="例：秋季新人大会"
                autoComplete="off"
              />
            </Field>
          </div>
        )}
        {group.type === "部活あり" && (
          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => set({ returnToSchool: !group.returnToSchool })}
              aria-pressed={group.returnToSchool}
              className="choice flex items-center justify-start gap-3 px-4 text-base"
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 items-center justify-center rounded-md text-sm ${
                  group.returnToSchool ? "bg-white text-navy" : "border-2 border-rule"
                }`}
              >
                {group.returnToSchool ? "✓" : ""}
              </span>
              再登校あり
            </button>
            {group.returnToSchool && (
              <TimeInput label="再登校の時間" value={group.returnTime} onChange={(v) => set({ returnTime: v })} />
            )}
          </div>
        )}
        {extra}
      </Card>

      {isMatchType(group.type) && (
        <GamesEditor no={++no} games={group.games} opponents={options.opponents} onChange={(games) => set({ games })} />
      )}
      {group.type === "合同練習" && (
        <PartnersEditor
          no={++no}
          partners={group.partners}
          opponents={options.opponents}
          onChange={(partners) => set({ partners })}
        />
      )}

      {showDetails && (
        <Card>
          <PanelTitle no={++no}>{isSimple ? "会場" : "会場と時間"}</PanelTitle>
          <div className="flex flex-col gap-4">
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
            <Suggest id="venue-options" values={options.venues} />
            {!isSimple && (
              <div className="grid grid-cols-2 gap-3">
                <TimeSelect10 label="開始" value={group.startTime} onChange={(v) => set({ startTime: v })} />
                <TimeSelect10 label="終了" value={group.endTime} onChange={(v) => set({ endTime: v })} />
              </div>
            )}
          </div>
        </Card>
      )}

      {showDetails && !isSimple && (
        <Card>
          <PanelTitle no={++no}>集合</PanelTitle>
          <div className="grid grid-cols-[8.5rem_1fr] gap-3">
            <TimeInput label="時間" value={group.meetTime} onChange={(v) => set({ meetTime: v })} />
            <Field label="場所">
              <input
                className={inputClass}
                value={group.meetPlace}
                onChange={(e) => set({ meetPlace: e.target.value })}
                placeholder="例：若葉駅"
                list="meet-options"
                autoComplete="off"
              />
            </Field>
          </div>
          <Suggest id="meet-options" values={options.meetPlaces} />
          <div className="filters mt-3">
            {["現地", "各学校"].map((p) => (
              <button
                key={p}
                type="button"
                className="filter"
                aria-pressed={group.meetPlace === p}
                onClick={() => set({ meetPlace: p })}
              >
                {p}
              </button>
            ))}
          </div>
        </Card>
      )}

      {showDetails && (
        <Card>
          <PanelTitle no={++no} aside={`${group.packing.length}点`}>
            持ち物
          </PanelTitle>
          {options.packingItems.length === 0 ? (
            <p className="text-sm text-navy-soft">読み込み中…</p>
          ) : (
            <Choices cols={3}>
              {itemNames.map((name) => (
                <ToggleButton
                  key={name}
                  small
                  on={group.packing.includes(name)}
                  label={name}
                  onClick={() => togglePacking(name)}
                />
              ))}
            </Choices>
          )}
          <div className="mt-3 flex gap-2">
            <input
              className={inputClass}
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="ほかの持ち物（例：タオル）"
              autoComplete="off"
              aria-label="持ち物を追加"
            />
            <button
              type="button"
              onClick={addItem}
              disabled={adding || !newItem.trim()}
              className="btn btn--primary btn--small shrink-0"
            >
              追加
            </button>
          </div>
        </Card>
      )}

      <Card>
        <PanelTitle no={++no}>{group.division === "main" ? "連絡事項" : `${label}の連絡事項`}</PanelTitle>
        <textarea
          className={inputClass}
          value={group.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="例：雨天時は体育館で練習"
          aria-label="連絡事項"
        />
      </Card>
    </>
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
  const [places, setPlaces] = useState<{ venues: string[]; meetPlaces: string[]; opponents: string[] }>({
    venues: [],
    meetPlaces: [],
    opponents: [],
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
    const groups = keys.map((k) => a.groups.find((g) => g.division === k) ?? newGroup(k, date));
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
      const groups = [...a.groups, newGroup(key, a.date)].sort(
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
    // 空欄のままの試合・相手は保存しない
    const cleaned: ActivityDraft = {
      ...a,
      groups: a.groups.map((g) => ({
        ...g,
        games: g.games.filter((x) => x.opponent.trim() || x.startTime),
        partners: g.partners.map((x) => x.trim()).filter(Boolean),
      })),
    };
    try {
      await onSave(cleaned);
    } catch {
      setError("保存できませんでした。電波の良い場所でもう一度お試しください。");
      setSaving(false);
    }
  };

  const tabs =
    a.groups.length > 1 ? (
      <div className="filters -mt-1 mb-4" role="tablist" aria-label="区分の切り替え">
        {a.groups.map((g) => (
          <button
            key={g.division}
            type="button"
            role="tab"
            className="filter"
            aria-pressed={tab === g.division}
            aria-selected={tab === g.division}
            onClick={() => setTab(g.division)}
          >
            {divisionLabel(g.division)}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <>
      <Card>
        <PanelTitle no={1}>日にちと区分</PanelTitle>
        <div className="flex flex-col gap-4">
          <Field label={a.date ? formatDateLong(a.date) : "日付"}>
            <input type="date" className={inputClass} value={a.date} onChange={(e) => changeDate(e.target.value)} />
          </Field>
          <div>
            <span className="f-label">区分</span>
            <Choices cols={3}>
              {DIVISIONS.map((d) => (
                <ToggleButton
                  key={d.key}
                  small
                  on={a.groups.some((g) => g.division === d.key)}
                  label={d.label}
                  onClick={() => toggleDivision(d.key)}
                />
              ))}
            </Choices>
            <p className="f-hint">平日は「住吉のみ」、土日は月に合わせて自動で選ばれます。</p>
          </div>
          <Field label="この日全体のメモ">
            <textarea
              className={inputClass}
              value={a.note}
              onChange={(e) => setA({ ...a, note: e.target.value })}
              placeholder="例：保護者会あり"
            />
          </Field>
        </div>
      </Card>

      {current && (
        <GroupEditor
          key={current.division}
          group={current}
          onChange={updateGroup}
          options={{ packingItems, onAddPacking, ...places }}
          tabs={tabs}
          extra={
            top && academy && tab === "academy" ? (
              <button type="button" onClick={copyTopToAcademy} className="btn btn--ghost mt-4">
                トップの内容をコピーする
              </button>
            ) : null
          }
        />
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <div className="h-16" aria-hidden />
      <div className="savebar">
        <div>
          <PrimaryButton onClick={submit} disabled={saving} accent={isNew}>
            {saving ? "保存中…" : isNew ? "この内容で登録する" : "変更を保存する"}
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}
