"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// 画面では、A4の紙（幅794px）をスマホの幅に縮めて見せる。印刷するときは等倍
export function PaperPreview({ children }: { children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    const measure = () => {
      if (!wrap.current || !paper.current) return;
      const scale = Math.min(1, (wrap.current.clientWidth - 24) / 794);
      setBox({ scale, height: paper.current.offsetHeight * scale + 36 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    if (paper.current) ro.observe(paper.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={wrap} className="paper-wrap" style={{ height: box.height || undefined }}>
      <div
        ref={paper}
        className="paper"
        style={{ transform: `translateX(-50%) scale(${box.scale})`, marginLeft: "50%", transformOrigin: "top center" }}
      >
        {children}
      </div>
    </div>
  );
}

