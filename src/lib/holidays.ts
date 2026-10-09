// 日本の祝日（国民の祝日に関する法律にもとづいて計算します。外部サービスは使いません）
// 振替休日・国民の休日（祝日にはさまれた日）にも対応。春分・秋分は計算式で出します（2099年まで有効）。

const cache = new Map<number, Map<string, string>>();

function key(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// m月の第n月曜日
function nthMonday(y: number, m: number, n: number): number {
  const first = new Date(y, m - 1, 1).getDay(); // 0=日
  const firstMon = 1 + ((8 - first) % 7);
  return firstMon + (n - 1) * 7;
}

function equinox(y: number, base: number): number {
  return Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

function yearHolidays(y: number): Map<string, string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const list: [number, number, string][] = [
    [1, 1, "元日"],
    [1, nthMonday(y, 1, 2), "成人の日"],
    [2, 11, "建国記念の日"],
    [2, 23, "天皇誕生日"],
    [3, equinox(y, 20.8431), "春分の日"],
    [4, 29, "昭和の日"],
    [5, 3, "憲法記念日"],
    [5, 4, "みどりの日"],
    [5, 5, "こどもの日"],
    [7, nthMonday(y, 7, 3), "海の日"],
    [8, 11, "山の日"],
    [9, nthMonday(y, 9, 3), "敬老の日"],
    [9, equinox(y, 23.2488), "秋分の日"],
    [10, nthMonday(y, 10, 2), "スポーツの日"],
    [11, 3, "文化の日"],
    [11, 23, "勤労感謝の日"],
  ];
  const map = new Map<string, string>();
  for (const [m, d, name] of list) map.set(key(y, m, d), name);

  // 国民の休日：前の日と次の日が祝日の平日
  for (const [m, d] of list) {
    const t = new Date(y, m - 1, d + 2);
    const mid = new Date(y, m - 1, d + 1);
    const k2 = key(t.getFullYear(), t.getMonth() + 1, t.getDate());
    const km = key(mid.getFullYear(), mid.getMonth() + 1, mid.getDate());
    if (map.has(k2) && !map.has(km) && mid.getDay() !== 0) map.set(km, "国民の休日");
  }
  // 振替休日：祝日が日曜なら、その後の祝日でない最初の日
  for (const [k] of [...map]) {
    const [yy, mm, dd] = k.split("-").map(Number);
    if (new Date(yy, mm - 1, dd).getDay() !== 0) continue;
    const n = new Date(yy, mm - 1, dd + 1);
    while (map.has(key(n.getFullYear(), n.getMonth() + 1, n.getDate()))) n.setDate(n.getDate() + 1);
    map.set(key(n.getFullYear(), n.getMonth() + 1, n.getDate()), "振替休日");
  }
  cache.set(y, map);
  return map;
}

// 祝日の名前（祝日でなければ ""）。date は "YYYY-MM-DD"
export function holidayName(date: string): string {
  const y = Number(date.slice(0, 4));
  if (!y) return "";
  return yearHolidays(y).get(date) ?? "";
}

export function isHoliday(date: string): boolean {
  return holidayName(date) !== "";
}
