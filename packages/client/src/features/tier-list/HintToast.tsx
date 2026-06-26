import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

import type { Hint } from "@tier-list/shared";

/** Transient bottom-right toasts for server hints (command help, errors, bans). */
export function HintToast({ hints }: { hints: Hint[] }) {
  const [visible, setVisible] = useState<Hint[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const mounted = useRef(false);

  useEffect(() => {
    // Ignore hints that already existed on mount (don't flash history).
    if (!mounted.current) {
      mounted.current = true;
      hints.forEach((h) => seen.current.add(h.id));
      return;
    }
    const fresh = hints.filter((h) => !seen.current.has(h.id));
    if (fresh.length === 0) return;
    fresh.forEach((h) => seen.current.add(h.id));
    setVisible((v) => [...v, ...fresh].slice(-4));
    fresh.forEach((h) => {
      setTimeout(() => setVisible((v) => v.filter((x) => x.id !== h.id)), 4200);
    });
  }, [hints]);

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[80] flex max-w-[320px] flex-col gap-2">
      {visible.map((h) => (
        <div
          key={h.id}
          className="flex items-start gap-2 rounded-[8px] border border-[#2A303C] bg-[#13161D] px-3.5 py-2.5 text-[12.5px] leading-[1.45] text-[#D6DAE2] shadow-[0_12px_32px_rgba(0,0,0,.5)]"
          style={{ animation: "slam .3s ease both" }}
        >
          <Info className="mt-0.5 size-3.5 shrink-0 text-[#A5B4FC]" />
          <span>{h.text}</span>
        </div>
      ))}
    </div>
  );
}
