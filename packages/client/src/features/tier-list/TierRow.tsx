import { useEffect, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ItemCard } from "./ItemCard";
import { isCardData, type ListData } from "./dnd";
import type { Item, Tier } from "@tier-list/shared";

type TierRowProps = {
  tier: Tier;
  items: Item[];
  canDelete: boolean;
  matchedIds?: Set<string> | null;
  votingItemId?: string;
  selectedItemId?: string | null;
  dndEnabled?: boolean;
  onSelectItem?: (item: Item, rect: DOMRect) => void;
  onRelabel: (tierId: string, label: string) => void;
  onReEpithet: (tierId: string, epithet: string) => void;
  onRecolor: (tierId: string, color: string) => void;
  onDeleteTier: (tierId: string) => void;
};

export function TierRow({
  tier,
  items,
  canDelete,
  matchedIds,
  votingItemId,
  selectedItemId,
  dndEnabled = true,
  onSelectItem,
  onRelabel,
  onReEpithet,
  onRecolor,
  onDeleteTier,
}: TierRowProps) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const el = dropRef.current;
    if (!el || !dndEnabled) return;
    const data: ListData = { kind: "list", listId: tier.id };
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => isCardData(source.data),
      getData: () => ({ ...data }),
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false),
    });
  }, [tier.id, dndEnabled]);

  return (
    <div className="flex border-b border-[#181C24] last:border-0">
      {/* Emblem */}
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="relative flex w-[84px] shrink-0 flex-col items-center justify-center gap-0.5 px-1 py-0.5"
        style={{ background: tier.color }}
      >
        <span className="absolute top-1 right-1.5 text-[10px] font-bold text-white/70 tabular-nums">
          {items.length}
        </span>
        <input
          value={tier.label}
          onChange={(e) => onRelabel(tier.id, e.target.value)}
          aria-label="티어 이름"
          maxLength={4}
          className="font-display w-full bg-transparent text-center text-[32px] leading-none text-white caret-white outline-none"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,.4)" }}
        />
        <input
          value={tier.epithet ?? ""}
          onChange={(e) => onReEpithet(tier.id, e.target.value)}
          aria-label="티어 등급명"
          maxLength={6}
          placeholder="등급명"
          className="w-full bg-transparent text-center text-[10px] font-bold text-white/90 caret-white outline-none placeholder:text-white/40"
        />
        <div
          className={cn(
            "absolute bottom-[5px] flex items-center justify-center gap-1.5 transition-opacity",
            hover ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <label
            title="색상 변경"
            className="relative grid size-4 cursor-pointer place-items-center rounded-full bg-black/30 shadow-[0_0_0_1px_rgba(255,255,255,.45)]"
          >
            <span className="size-2 rounded-full bg-white" />
            <input
              type="color"
              value={tier.color}
              onChange={(e) => onRecolor(tier.id, e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          {canDelete && (
            <button
              type="button"
              title="티어 삭제"
              onClick={() => onDeleteTier(tier.id)}
              className="grid size-4 place-items-center rounded-[4px] bg-black/30 text-white shadow-[0_0_0_1px_rgba(255,255,255,.45)]"
            >
              <X className="size-2.5" strokeWidth={3} />
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <div
        ref={dropRef}
        className={cn(
          "flex min-h-[84px] flex-1 flex-wrap content-center items-center gap-[7px] bg-paper p-[9px] transition-colors",
          over && "bg-accent",
        )}
      >
        {items.length === 0 && !over && (
          <span className="px-1 text-xs text-muted-foreground/70">비어 있음</span>
        )}
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            listId={tier.id}
            highlight={matchedIds ? matchedIds.has(item.id) : undefined}
            dim={matchedIds ? !matchedIds.has(item.id) : undefined}
            voting={votingItemId === item.id}
            selected={selectedItemId === item.id}
            dndEnabled={dndEnabled}
            onSelect={onSelectItem}
          />
        ))}
      </div>
    </div>
  );
}
