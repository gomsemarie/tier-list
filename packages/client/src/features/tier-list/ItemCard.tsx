import { useEffect, useRef, useState } from "react";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";

import { cn } from "@/lib/utils";
import type { Item } from "@tier-list/shared";
import { isCardData, type CardData } from "./dnd";

/** Deterministic hue swatch color (matches the design: hsl(h,40%,46%)). */
function swatchColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${((hash % 360) + 360) % 360},40%,46%)`;
}

function initials(name: string): string {
  const t = name.trim();
  return t ? t.slice(0, 2) : "?";
}

type ItemCardProps = {
  item: Item;
  listId: string;
  /** Opens the tier popover, anchored to the clicked card's rect. */
  onSelect?: (item: Item, rect: DOMRect) => void;
  /** Search match → ring+glow; non-match → dimmed. */
  highlight?: boolean;
  dim?: boolean;
  /** This item is up for a live vote. */
  voting?: boolean;
  /** This item's popover/detail is open. */
  selected?: boolean;
  dndEnabled?: boolean;
  // Kept for the Phase-2 tier popover (edit/remove); unused in the card itself.
  onEdit?: (item: Item) => void;
  onRemove?: (id: string) => void;
};

/** 66px tier item: image or hue-initials swatch + name gradient. Click opens the
 *  tier popover (via onSelect); drag reorders / moves between tiers. */
export function ItemCard({
  item,
  listId,
  onSelect,
  highlight,
  dim,
  voting,
  selected,
  dndEnabled = true,
}: ItemCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !dndEnabled) return;
    const data: CardData = { kind: "card", itemId: item.id, listId };
    return combine(
      draggable({
        element: el,
        getInitialData: () => ({ ...data }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => isCardData(source.data),
        getData: ({ input, element }) =>
          attachClosestEdge({ ...data }, { input, element, allowedEdges: ["left", "right"] }),
        getIsSticky: () => true,
        onDrag: ({ self, source }) => {
          if (source.element === el) {
            setClosestEdge(null);
            return;
          }
          setClosestEdge(extractClosestEdge(self.data));
        },
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      }),
    );
  }, [item.id, listId, dndEnabled]);

  return (
    <div className="relative shrink-0">
      {closestEdge && (
        <div
          className={cn(
            "absolute -top-1 -bottom-1 z-10 w-[3px] rounded-full bg-foreground",
            closestEdge === "left" ? "-left-1.5" : "-right-1.5",
          )}
        />
      )}
      <div
        ref={ref}
        onClick={(e) => onSelect?.(item, e.currentTarget.getBoundingClientRect())}
        title={item.name}
        className={cn(
          "relative size-[66px] cursor-pointer overflow-hidden rounded-[4px] transition-opacity select-none",
          dndEnabled && "cursor-grab active:cursor-grabbing",
          dragging && "opacity-40",
        )}
        style={{ boxShadow: "0 1px 4px rgba(0,0,0,.4)" }}
      >
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} draggable={false} className="size-full object-cover" />
        ) : (
          <div
            className="grid size-full place-items-center text-[17px] font-extrabold text-white"
            style={{ background: swatchColor(item.name) }}
          >
            {initials(item.name)}
          </div>
        )}

        {/* name */}
        <div
          className="absolute inset-x-0 bottom-0 overflow-hidden px-[3px] py-[2px] text-center text-[9px] font-semibold text-ellipsis whitespace-nowrap text-white"
          style={{ background: "linear-gradient(transparent,rgba(7,8,12,.94))" }}
        >
          {item.name}
        </div>

        {/* live vote */}
        {voting && (
          <>
            <div className="pointer-events-none absolute inset-0 rounded-[4px] shadow-[0_0_0_2px_#FF4C3A_inset]" />
            <span className="absolute top-[3px] left-[3px] rounded-[2px] bg-[#FF4C3A] px-[4px] py-px text-[8px] font-extrabold text-white">
              LIVE
            </span>
          </>
        )}
        {/* selected (popover open) */}
        {selected && (
          <div className="pointer-events-none absolute inset-0 rounded-[4px] shadow-[0_0_0_2px_#F5B942_inset]" />
        )}
        {/* search dim */}
        {dim && <div className="pointer-events-none absolute inset-0 rounded-[4px] bg-[rgba(8,9,13,.7)]" />}
        {/* search match */}
        {highlight && (
          <div className="pointer-events-none absolute inset-0 rounded-[4px] shadow-[0_0_0_2px_#F5B942_inset,0_0_12px_rgba(245,182,66,.5)]" />
        )}
      </div>
    </div>
  );
}
