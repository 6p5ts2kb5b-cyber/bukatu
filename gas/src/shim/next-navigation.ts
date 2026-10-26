// "next/navigation" の代わり
import { back, navigate, useLoc } from "./router";
import { matchRoute } from "../routes-match";

export function useRouter() {
  return {
    push: (to: string) => navigate(to),
    replace: (to: string) => navigate(to, true),
    back: () => back(),
    refresh: () => {},
    prefetch: () => {},
  };
}
export function usePathname(): string {
  return useLoc().path;
}
export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(useLoc().search);
}
export function useParams<T extends Record<string, string>>(): T {
  const { path } = useLoc();
  return (matchRoute(path)?.params ?? {}) as T;
}
