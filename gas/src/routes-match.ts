// 画面のアドレスの形（:id のところが変わる）
export const ROUTE_PATTERNS = [
  "/",
  "/activities",
  "/activities/new",
  "/activities/bulk",
  "/activities/:id",
  "/menu",
  "/teams",
  "/staff",
  "/players",
  "/print",
  "/notices",
  "/notices/:id",
  "/lineups",
  "/lineups/:id",
  "/ops",
  "/ops/:id",
] as const;
export type RoutePattern = (typeof ROUTE_PATTERNS)[number];

export function matchRoute(path: string): { pattern: RoutePattern; params: Record<string, string> } | null {
  const segs = path.split("/").filter(Boolean);
  for (const p of ROUTE_PATTERNS) {
    const ps = p.split("/").filter(Boolean);
    if (ps.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].startsWith(":")) params[ps[i].slice(1)] = segs[i];
      else if (ps[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { pattern: p, params };
  }
  return null;
}
