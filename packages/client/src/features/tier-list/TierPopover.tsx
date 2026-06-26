import { useLayoutEffect, useRef, useState } from "react";
import { Landmark, Pencil, Trash2 } from "lucide-react";

import type { ChangeEntry, Item, Member, Tier } from "@tier-list/shared";

function swatch(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360},40%,46%)`;
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간`;
  return `${Math.floor(s / 86400)}일`;
}

const W = 264;

/** Tier labels can be up to 4 chars — shrink the font so they fit one line. */
function labelFont(label: string): number {
  const n = [...label].length;
  return n <= 1 ? 17 : n === 2 ? 14 : n === 3 ? 11 : 9;
}

type TierPopoverProps = {
  item: Item;
  anchor: DOMRect;
  tiers: Tier[];
  currentTierId: string | null;
  /** Recent tier moves for this item (most recent first); shows up to 5. */
  history?: ChangeEntry[];
  /** Room members, to resolve a mover's current nickname by id. */
  members?: Member[];
  onMove: (tierId: string) => void;
  onPool: () => void;
  onStartVote?: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onClose: () => void;
};

/** Item → tier picker popover: large preview, tier buttons, and recent history. */
export function TierPopover({
  item,
  anchor,
  tiers,
  currentTierId,
  history = [],
  members = [],
  onMove,
  onPool,
  onStartVote,
  onEdit,
  onRemove,
  onClose,
}: TierPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => ({
    left: Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8)),
    top: anchor.bottom + 8,
  }));

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 320;
    let top = anchor.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setPos({ left: Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8)), top });
  }, [anchor]);

  const curLabel = currentTierId
    ? `${tiers.find((t) => t.id === currentTierId)?.label ?? ""} 티어`
    : "미배치";
  const recent = history.slice(0, 5);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-50" />
      <div
        ref={ref}
        className="fixed z-[51] flex max-h-[88vh] flex-col overflow-hidden rounded-[8px] border"
        style={{
          left: pos.left,
          top: pos.top,
          width: W,
          background: "#13161D",
          borderColor: "#2A303C",
          boxShadow: "0 16px 48px rgba(0,0,0,.6)",
          animation: "popIn .16s ease both",
        }}
      >
        {/* Large preview */}
        <div className="relative h-[132px] w-full shrink-0 overflow-hidden bg-[#0E1117]">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
          ) : (
            <div
              className="grid size-full place-items-center text-[34px] font-extrabold text-white"
              style={{ background: swatch(item.name) }}
            >
              {item.name.slice(0, 2)}
            </div>
          )}
          <div
            className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-3 pt-9 pb-2"
            style={{ background: "linear-gradient(transparent,rgba(7,8,12,.95))" }}
          >
            <span className="truncate text-[14px] font-extrabold text-white">{item.name}</span>
            <span className="shrink-0 text-[10px] font-semibold text-[#C4C8D2]">{curLabel}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-3 pt-[9px] pb-1.5">
            <div className="mb-1.5 text-[10px] font-bold tracking-wide text-[#6A707E]">티어로 보내기</div>
            <div className="flex gap-[5px]">
              {tiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  onClick={() => onMove(t.id)}
                  className="font-display h-[38px] min-w-0 flex-1 overflow-hidden rounded-[5px] px-1 leading-none whitespace-nowrap text-white"
                  style={{
                    background: t.color,
                    fontSize: labelFont(t.label),
                    border: currentTierId === t.id ? "2px solid #fff" : "none",
                    textShadow: "0 1px 2px rgba(0,0,0,.35)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="my-1.5 h-px bg-[#20252F]" />

          <div className="flex gap-[5px] px-3 pb-[11px]">
            {onStartVote && (
              <button
                type="button"
                onClick={onStartVote}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[5px] text-[12px] font-bold text-white"
                style={{ background: "#6366F1" }}
              >
                <Landmark className="size-3.5" /> 투표 시작
              </button>
            )}
            <button
              type="button"
              onClick={onPool}
              className="h-8 rounded-[5px] border border-[#2A303C] bg-[#171B22] px-[11px] text-[12px] font-semibold text-[#C4C8D2]"
            >
              미배치
            </button>
            <button
              type="button"
              onClick={onEdit}
              title="이름 수정"
              className="grid size-8 place-items-center rounded-[5px] border border-[#2A303C] bg-[#171B22] text-[#C4C8D2]"
            >
              <Pencil className="size-[13px]" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              title="삭제"
              className="grid size-8 place-items-center rounded-[5px] border border-[#2A303C] bg-[#171B22] text-[#8A8F9C]"
            >
              <Trash2 className="size-[13px]" />
            </button>
          </div>

          {recent.length > 0 && (
            <div className="border-t border-[#20252F] px-3 py-2">
              <div className="mb-1 text-[10px] font-bold tracking-wide text-[#6A707E]">최근 이력</div>
              {recent.map((h) => {
                const actor = (h.actorId && members.find((m) => m.userId === h.actorId)?.name) || h.actor;
                return (
                <div key={h.id} className="flex items-center gap-2 py-[3px] text-[11px]">
                  <span className="size-[5px] shrink-0 rounded-full" style={{ background: h.toColor }} />
                  <span className="flex-1 truncate text-[#C4C8D2]">
                    <b className="text-[#A4AAB6]">{actor}</b> →{" "}
                    <span className="font-bold" style={{ color: h.toColor }}>
                      {h.toLabel}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-[#5A6070]">{relTime(h.ts)}</span>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
