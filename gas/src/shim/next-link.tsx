// "next/link" の代わり：押すと画面だけ切り替える（ページを読み直さない）
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { navigate } from "./router";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode; prefetch?: boolean; replace?: boolean; scroll?: boolean };

export default function Link({ href, children, onClick, prefetch: _p, replace, scroll: _s, ...rest }: Props) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href, replace);
  };
  return (
    <a href={`#${href.replace(/^\//, "")}`} onClick={go} {...rest}>
      {children}
    </a>
  );
}
