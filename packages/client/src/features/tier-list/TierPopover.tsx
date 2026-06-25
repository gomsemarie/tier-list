import { useLayoutEffect, useRef, useState } from "react";
import { Landmark, Pencil, Trash2 } from "lucide-react";

import type { Item, Tier } from "@tier-list/shared";

function swatchColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${((hash % 360) + 360) % 360},40%,46%)`;
}

type TierPopoverProps = {
  item: Item;
  /** Anchor rect of the clicked card (viewport coords). */
  anchor: DOMRect;
  tiers: Tier[];
  /** Current tier id of the item, or null if unplaced. */
  currentTierId: string | null;
  onMove: (tierId: string) => void;
  onPool: () => void;
  onStartVote?: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onClose: () => void;
};

const W = 264;

/** Item → tier picker popover (the core click flow). Drag still works too. */
export function TierPopover({
  item,
  anchor,
  tiers,
  currentTierId,
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

  // Flip above the card if it would overflow the viewport bottom.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 188;
    const vh = window.innerHeight;
    let top = anchor.bottom + 8;
    if (top + h > vh - 8) top = Math.max(8, anchor.top - h - 8);
    setPos({
      left: Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8)),
      top,
    });
  }, [anchor]);

  const curLabel = currentTierId
    ? `${tiers.find((t) => t.id === currentTierId)?.label ?? ""} 티어`
    : "미배치";

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-50" />
      <div
        ref={ref}
        className="fixed z-[51] overflow-hidden rounded-[8px] border"
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
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[#20252F] px-3 py-2.5">
          <div className="relative size-7 shrink-0 overflow-hidden rounded-[4px]">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
            ) : (
              <div
                className="grid size-full place-items-center text-[12px] font-extrabold text-white"
                style={{ background: swatchColor(item.name) }}
              >
                {item.name.slice(0, 2)}
              </div>
            )}
          </div>
          <span className="flex-1 truncate text-[13px] font-extrabold text-[#EDEAE2]">
            {item.name}
          </span>
          <span className="text-[10px] font-semibold text-[#7A808E]">{curLabel}</span>
        </div>

        {/* Tier chips */}
        <div className="px-3 pt-[9px] pb-1.5">
          <div className="mb-1.5 text-[10px] font-bold tracking-wide text-[#6A707E]">
            티어로 보내기
          </div>
          <div className="flex gap-[5px]">
            {tiers.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.epithet}
                onClick={() => onMove(t.id)}
                className="font-display h-[38px] flex-1 rounded-[5px] text-[17px] text-white"
                style={{
                  background: t.color,
                  border: currentTierId === t.id ? "2px solid #fff" : "none",
                  textShadow: "0 1px 2px rgba(0,0,0,.35)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-0 my-1.5 h-px bg-[#20252F]" />

        {/* Actions */}
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
      </div>
    </>
  );
}
