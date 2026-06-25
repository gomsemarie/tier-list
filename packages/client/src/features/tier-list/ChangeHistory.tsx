import { useEffect, useState } from "react";

import type { TierListState } from "@tier-list/shared";
import { Avatar } from "./Avatar";

type ChangeHistoryProps = {
  state: TierListState;
  /** Resolve a mover's avatar/frame from the room members (by display name). */
  avatarOf?: (name: string) => { src?: string | null; frame?: string } | undefined;
};

function relTime(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 10) return "방금";
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간`;
  return `${Math.floor(h / 24)}일`;
}

/** Recent tier-change feed (newest first, capped at 10) for the live panel. */
export function ChangeHistory({ state, avatarOf }: ChangeHistoryProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const colorOf = new Map(state.tiers.map((t) => [t.label, t.color] as const));
  const entries = Object.values(state.items)
    .flatMap((it) => (it.history ?? []).map((h) => ({ ...h, itemName: it.name })))
    .filter((e) => e.by)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 10);

  if (entries.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex items-center gap-1.5 px-3.5 pt-3 pb-1.5">
        <span className="text-[13px] font-extrabold">변경 이력</span>
        <span className="text-[11px] text-muted-foreground">최근 {entries.length}</span>
      </div>
      <div className="max-h-44 overflow-y-auto px-3 pb-2">
        {entries.map((e, i) => {
          const a = avatarOf?.(e.by);
          return (
            <div
              key={`${e.ts}-${i}`}
              className="flex items-center gap-2 border-b border-border py-[7px] last:border-0"
            >
              <Avatar name={e.by} src={a?.src ?? null} frame={a?.frame} size={22} />
              <div className="min-w-0 flex-1 text-[12px] text-[#C4C8D2]">
                <b className="text-[#A4AAB6]">{e.by}</b>{" "}
                <span className="text-muted-foreground">{e.itemName}</span> →{" "}
                <span
                  className="font-bold"
                  style={{ color: colorOf.get(e.tier) ?? "var(--foreground)" }}
                >
                  {e.tier}
                </span>
              </div>
              <span className="shrink-0 text-[10px] text-[#5a6070]">{relTime(e.ts, now)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
