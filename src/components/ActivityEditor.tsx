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
  describeRef,
  isMatchType,
  isOffType,
  parseRef,
  isSimpleType,
  STAGES,
  recentPlaces,
} from "@/lib/activities";
import { addPackingItem, listPackingItems, type PackingItem } from "@/lib/packing";
import { findVenue, listDirectory, venueList, type DirEntry } from "@/lib/directory";
import { DirPicker } from "@/components/DirPicker";
import { Card, Choices, ErrorText, Field, inputClass, PanelTitle, PrimaryButton, ToggleButton } from "@/components/ui";

export type ActivityDraft = Omit<Activity, "id"> & { id?: string };

type Options = {
  packingItems: PackingItem[];
  venues: string[];
  dir: DirEntry[]; // 名簿（会場の住所・最寄駅）
  reloadDir: () => void;
  meetPlaces: string[];
  opponents: string[];
  tournaments: string[];
  onAddPacking: (name: string) => Promise<void>;
};

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
  return (
    <div>
      <span className="f-label">{label}</span>
      <TimePicker10 name={label} value={value} onChange={onChange} />
    </div>
  );
}

export function TimePicker10({
  name,
  value,
  onChange,
  white,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  white?: boolean;
}) {
  const cls = `${inputClass}${white ? " f-input--white" : ""}`;
  const label = name;
  const [h, m] = value ? value.split(":") : ["", ""];
  const hours = Array.from({ length: 18 }, (_, i) => String(i + 5).padStart(2, "0")); // 5時〜22時
  if (h && !hours.includes(h)) hours.unshift(h);
  const mins = ["00", "10", "20", "30", "40", "50"];
  if (m && !mins.includes(m)) mins.push(m); // 前に入れた半端な分も消さずに残す
  return (
      <div className="time-sel">
        <select
          className={cls}
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
          className={cls}
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

// 試合のチーム欄。2試合目からは「第1試合の勝者／敗者」をボタンで選べる
//（そういうチームは無いので、名前ではなく「前の試合の結果」として持つ）
function TeamSlot({
  label,
  value,
  index,
  pairs,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  index: number; // この試合の番号（0から）
  pairs: [string, string][];
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const ref = parseRef(value);
  const refs = pairs.slice(0, index).flatMap((_, k) => [`第${k + 1}試合の勝者`, `第${k + 1}試合の敗者`]);
  return (
    <div>
      <span className="f-label">{label}</span>
      {ref ? (
        <div className="ref-pill">
          <span>
            <b>{value}</b>
            {describeRef(value, pairs) && <small>{describeRef(value, pairs)}</small>}
          </span>
          <button type="button" onClick={() => onChange("")} aria-label="取り消す">
            ×
          </button>
        </div>
      ) : (
        <input
          className={`${inputClass} f-input--white`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          list="opponent-options"
          autoComplete="off"
          aria-label={label}
        />
      )}
      {refs.length > 0 && !ref && (
        <div className="picks mt-1.5">
          {refs.map((r) => (
            <button key={r} type="button" className="pick pick--ref" onClick={() => onChange(r)}>
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const add = () => onChange([...games, { opponent: "", startTime: "", home: "", others: false, bench: "1塁" }]);
  const remove = (i: number) => onChange(games.filter((_, j) => j !== i));
  // 試合の順番を入れ替える
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= games.length) return;
    const next = [...games];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  // 試合ごとの2チーム（「第1試合の勝者」の説明に使う）
  const pairs: [string, string][] = games.map((g) => [g.others ? g.home ?? "" : "うち", g.opponent]);

  return (
    <Card>
      <PanelTitle no={no} aside={games.length ? `${games.length}試合` : undefined}>
        試合
      </PanelTitle>
      <div className="flex flex-col gap-3">
        {games.map((g, i) => {
          const others = g.others === true;
          return (
            <div key={i} className="rounded-xl border border-rule bg-[#f7f9f5] p-3">
              <div className="mb-2 flex items-center gap-1">
                <span className="flex-1 text-sm font-extrabold tracking-wide text-navy-soft">第{i + 1}試合</span>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`第${i + 1}試合を前へ`}
                  className="h-10 w-10 rounded-lg text-sm text-navy-soft active:bg-white disabled:opacity-25"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === games.length - 1}
                  aria-label={`第${i + 1}試合を後へ`}
                  className="h-10 w-10 rounded-lg text-sm text-navy-soft active:bg-white disabled:opacity-25"
                >
                  ▼
                </button>
                <RemoveButton onClick={() => remove(i)} label={`第${i + 1}試合を削除`} />
              </div>
              <div className="seg mb-2" role="group" aria-label={`第${i + 1}試合に出るチーム`}>
                <button type="button" className="seg__btn" aria-pressed={!others} onClick={() => update(i, { others: false })}>
                  うちの試合
                </button>
                <button type="button" className="seg__btn" aria-pressed={others} onClick={() => update(i, { others: true })}>
                  他チーム同士
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {others ? (
                  <>
                    <TeamSlot
                      label="チーム1"
                      value={g.home ?? ""}
                      index={i}
                      pairs={pairs}
                      onChange={(v) => update(i, { home: v })}
                      placeholder="例：坂戸中"
                    />
                    <span className="text-center text-sm font-extrabold text-navy-soft">対</span>
                    <TeamSlot
                      label="チーム2"
                      value={g.opponent}
                      index={i}
                      pairs={pairs}
                      onChange={(v) => update(i, { opponent: v })}
                      placeholder="例：鶴ヶ島中"
                    />
                  </>
                ) : (
                  <TeamSlot
                    label="対戦相手"
                    value={g.opponent}
                    index={i}
                    pairs={pairs}
                    onChange={(v) => update(i, { opponent: v })}
                    placeholder="例：坂戸中"
                  />
                )}
                {/* ベンチ（1塁側・3塁側） */}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm font-extrabold text-navy-soft">
                    {others ? `${g.home || "チーム1"}は` : "うちは"}
                  </span>
                  <div className="seg flex-1" role="group" aria-label="ベンチ">
                    {(["1塁", "3塁"] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        className="seg__btn"
                        aria-pressed={(g.bench ?? "1塁") === b}
                        onClick={() => update(i, { bench: b })}
                      >
                        {b}側
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-sm font-extrabold text-navy-soft">開始</span>
                    <div className="seg flex-1" role="group" aria-label="開始の書き方">
                      <button type="button" className="seg__btn" aria-pressed={!g.afterLunch} onClick={() => update(i, { afterLunch: false })}>
                        時刻
                      </button>
                      <button
                        type="button"
                        className="seg__btn"
                        aria-pressed={!!g.afterLunch}
                        onClick={() => update(i, { afterLunch: true, lunchMin: g.lunchMin || 40 })}
                      >
                        昼食後○分後
                      </button>
                    </div>
                  </div>
                  {g.afterLunch ? (
                    <div className="picks">
                      {[30, 40, 45, 50, 60].map((m) => (
                        <button
                          key={m}
                          type="button"
                          className="pick"
                          aria-pressed={(g.lunchMin || 40) === m}
                          onClick={() => update(i, { lunchMin: m })}
                        >
                          昼食後{m}分後
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="w-[11rem]">
                      <TimePicker10
                        white
                        name={`第${i + 1}試合の開始`}
                        value={g.startTime}
                        onChange={(v) => update(i, { startTime: v })}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <Suggest id="opponent-options" values={opponents} />
        <p className="f-hint m-0">3チーム以上の日は、うちが出ない試合を「他チーム同士」に。2試合目からは「第1試合の勝者／敗者」をボタンで選べます（リーグ戦・トーナメント用）。</p>
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
                list="tournament-options"
                autoComplete="off"
              />
            </Field>
            <Suggest id="tournament-options" values={options.tournaments} />
            <span className="f-label mt-4 block">日程</span>
            <div className="picks">
              {STAGES.map((st) => (
                <button
                  key={st}
                  type="button"
                  className="pick"
                  aria-pressed={group.stage === st}
                  onClick={() => set({ stage: group.stage === st ? "" : st })}
                >
                  {st}
                </button>
              ))}
            </div>
            {options.tournaments.length > 0 && <span className="f-label mt-4 block">これまでの大会名から選ぶ</span>}
            {/* これまでに入れた大会名から選ぶ（2日目・予備日なども同じ名前で） */}
            {options.tournaments.length > 0 && (
              <div className="picks mt-2">
                {options.tournaments
                  .filter((t) => t !== group.tournamentName)
                  .slice(0, 8)
                  .map((t) => (
                    <button key={t} type="button" className="pick" onClick={() => set({ tournamentName: t })}>
                      {t}
                    </button>
                  ))}
              </div>
            )}
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
              <TimeSelect10 label="再登校の時間" value={group.returnTime} onChange={(v) => set({ returnTime: v })} />
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
                onChange={(e) => {
                  // 登録した会場（3校など）と同じなら、住所と最寄駅もいっしょに
                  const f = findVenue(e.target.value, venueList(options.dir));
                  set({ venue: e.target.value, ...(f ? { venueAddress: f.number, venueStation: f.extra ?? "" } : {}) });
                }}
                placeholder="例：桜中学校 グラウンド"
                list="venue-options"
                autoComplete="off"
              />
            </Field>
            <Suggest id="venue-options" values={options.venues} />
            <DirPicker
              kind="venue"
              entries={venueList(options.dir)}
              isOn={(e) => e.name === group.venue}
              onPick={(e) => set({ venue: e.name, venueAddress: e.number, venueStation: e.extra ?? "" })}
              onChanged={options.reloadDir}
            />
            {(group.venue || group.venueStation) && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="住所">
                  <input className={inputClass} value={group.venueAddress} onChange={(e) => set({ venueAddress: e.target.value })} autoComplete="off" />
                </Field>
                <Field label="最寄駅">
                  <input className={inputClass} value={group.venueStation} onChange={(e) => set({ venueStation: e.target.value })} autoComplete="off" />
                </Field>
              </div>
            )}
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
          <div className="flex flex-col gap-4">
            <div className="w-1/2 min-w-[11rem] pr-1.5">
              <TimeSelect10 label="時間" value={group.meetTime} onChange={(v) => set({ meetTime: v })} />
            </div>
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
  const [dir, setDir] = useState<DirEntry[]>([]);
  const reloadDir = useCallback(() => {
    listDirectory()
      .then(setDir)
      .catch(() => {});
  }, []);
  const [places, setPlaces] = useState<{ venues: string[]; meetPlaces: string[]; opponents: string[]; tournaments: string[] }>({
    venues: [],
    meetPlaces: [],
    opponents: [],
    tournaments: [],
  });

  useEffect(() => {
    listPackingItems().then(setPackingItems).catch(() => {});
    recentPlaces().then(setPlaces).catch(() => {});
    reloadDir();
  }, [reloadDir]);

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
        games: g.games
          .map((x) => ({ ...x, home: (x.home ?? "").trim() }))
          .filter((x) => x.opponent.trim() || x.home || x.startTime),
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
          options={{ packingItems, onAddPacking, ...places, dir, reloadDir }}
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
