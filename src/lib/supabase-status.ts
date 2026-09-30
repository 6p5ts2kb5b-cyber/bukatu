// Supabase（データの保存場所）とつながっているかを確認する部品です。
// 秘密の鍵は使わず、公開してよい鍵（publishable key）だけで確認します。

export type SupabaseStatus =
  | { state: "ok" }
  | { state: "missing"; missing: string[] }
  | { state: "error"; message: string };

export async function checkSupabase(): Promise<SupabaseStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return { state: "missing", missing };

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    if (res.ok) return { state: "ok" };
    return {
      state: "error",
      message: `Supabaseから応答コード ${res.status} が返りました`,
    };
  } catch {
    return {
      state: "error",
      message: "Supabaseに接続できませんでした（URLの打ち間違いの可能性）",
    };
  }
}
