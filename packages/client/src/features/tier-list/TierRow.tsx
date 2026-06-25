import { useEffect, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { ItemCard } from "./ItemCard";
import { isCardData, type ListData } from "./dnd";
import type { Item, Tier } from "@tier-list/shared";

type TierRowProps = {
  tier: Tier;
  index: number;
  items: Item[];
  canDelete: boolean;
  onEditItem: (item: Item) => void;
  onRemoveItem: (id: string) => void;
  onSelectItem?: (item: Item, rect: DOMRect) => void;
  /** When a search is active: item ids that match (others are dimmed). */
  matchedIds?: Set<string> | null;
  /** Item id currently up for a live vote (shows the LIVE state). */
  votingItemId?: string;
  /** Item id whose popover/detail is open (shows the selected ring). */
  selectedItemId?: string | null;
  /** When false (alphabetical view), items can't be dragged/reordered. */
  dndEnabled?: boolean;
  onRelabel: (tierId: string, label: string) => void;
  onReEpithet: (tierId: string, epithet: string) => void;
  onRecolor: (tierId: string, color: string) => void;
  onDeleteTier: (tierId: string) => void;
};

/**
 * Renders two grid children (label cell + drop zone). The parent board is a
 * `grid-cols-[auto_1fr]` grid, so the label column auto-sizes to the widest
 * label across all rows — letters or longer text both work, kept aligned.
 */
export function TierRow({
  tier,
  index,
  items,
  canDelete,
  onEditItem,
  onRemoveItem,
  onSelectItem,
  matchedIds,
  votingItemId,
  selectedItemId,
  dndEnabled = true,
  onRelabel,
  onReEpithet,
  onRecolor,
  onDeleteTier,
}: TierRowProps) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = dropRef.current;
    if (!el || !dndEnabled) return;

    const data: ListData = { kind: "list", listId: tier.id };
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => isCardData(source.data),
      getData: () => ({ ...data }),
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    });
  }, [tier.id, dndEnabled]);

  const delay = { animationDelay: `${0.08 * index + 0.12}s` };

  return (
    <>
      {/* Tier emblem cell (auto-grows to its text; column shared across rows) */}
      <div
        className="animate-fade-in group/label relative flex min-w-[5.25rem] flex-col items-center justify-center gap-0.5 px-3 py-3"
        style={{ backgroundColor: tier.color, ...delay }}
      >
        {/* count badge */}
        <span className="absolute top-1 right-1.5 font-pixel text-[10px] font-bold text-white/75 tabular-nums">
          {items.length}
        </span>

        {/* Auto-sizing label input: hidden sizer sets the width, input overlays it. */}
        <span className="grid">
          <span
            aria-hidden
            className="font-display col-start-1 row-start-1 px-1 text-[2rem] leading-none whitespace-pre invisible"
          >
            {tier.label || " "}
          </span>
          <input
            value={tier.label}
            onChange={(e) => onRelabel(tier.id, e.target.value)}
            aria-label="티어 이름"
            maxLength={20}
            size={1}
            className="tier-letter font-display col-start-1 row-start-1 w-full min-w-0 bg-transparent px-1 text-center text-[2rem] leading-none caret-white outline-none"
          />
        </span>

        {/* epithet (등급명) */}
        <input
          value={tier.epithet ?? ""}
          onChange={(e) => onReEpithet(tier.id, e.target.value)}
          aria-label="티어 등급명"
          maxLength={6}
          placeholder="등급명"
          className="w-full bg-transparent text-center text-[10px] font-bold text-white/90 caret-white outline-none placeholder:text-white/40"
        />

        <div className="absolute bottom-1.5 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover/label:opacity-100">
          <label className="grid size-5 cursor-pointer place-items-center rounded-full ring-1 ring-white/50">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: tier.color, filter: "brightness(0.78)" }}
            />
            <input
              type="color"
              value={tier.color}
              onChange={(e) => onRecolor(tier.id, e.target.value)}
              aria-label="티어 색상"
              className="absolute size-0 opacity-0"
            />
          </label>
          {canDelete && (
            <button
              type="button"
              aria-label="티어 삭제"
              onClick={() => onDeleteTier(tier.id)}
              className="grid size-5 place-items-center rounded-full text-white/75 ring-1 ring-white/50 transition-colors hover:bg-white/20 hover:text-white"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={dropRef}
        style={delay}
        className={cn(
          "animate-fade-in flex min-h-[84px] flex-wrap content-center items-center gap-[7px] bg-paper p-[9px] transition-colors duration-150",
          isOver && "bg-accent",
        )}
      >
        {items.length === 0 && !isOver && (
          <span className="px-1 text-xs text-muted-foreground/70">
            {dndEnabled ? "여기로 끌어다 놓으세요" : "비어 있음"}
          </span>
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
            onEdit={onEditItem}
            onRemove={onRemoveItem}
            onSelect={onSelectItem}
          />
        ))}
      </div>
    </>
  );
}
