import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
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

function swatch(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360},40%,46%)`;
}

type ItemCardProps = {
  item: Item;
  listId: string;
  onSelect?: (item: Item, rect: DOMRect) => void;
  highlight?: boolean;
  dim?: boolean;
  voting?: boolean;
  /** Pinned to this tier by a won decision match — glow ring + 🔒 badge. */
  locked?: boolean;
  selected?: boolean;
  dndEnabled?: boolean;
};

/** 66px tier item — image or hue-initials, name gradient, live/selected states. */
export function ItemCard({
  item,
  listId,
  onSelect,
  highlight,
  dim,
  voting,
  locked,
  selected,
  dndEnabled = true,
}: ItemCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);

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
        onDrag: ({ self, source }) =>
          setEdge(source.element === el ? null : extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [item.id, listId, dndEnabled]);

  return (
    <div className="relative shrink-0">
      {edge && (
        <div
          className={cn(
            // Centered in the 7px gap so a card's right edge and the next
            // card's left edge land on the exact same line (no double bar).
            "absolute -top-1 -bottom-1 z-10 w-[3px] rounded-full bg-foreground",
            edge === "left" ? "-left-[5px]" : "-right-[5px]",
          )}
        />
      )}
      <div
        ref={ref}
        title={item.name}
        onClick={(e) => onSelect?.(item, e.currentTarget.getBoundingClientRect())}
        className={cn(
          "relative size-[66px] cursor-pointer overflow-hidden rounded-[4px] select-none",
          dndEnabled && "active:cursor-grabbing",
          dragging && "opacity-40",
        )}
        style={{
          // Outer ring + lift; the inner neutral ring is an overlay below so the
          // image can't paint over it (selected/voting rings layer on top).
          boxShadow: "0 0 0 1px rgba(0,0,0,.5), 0 1px 4px rgba(0,0,0,.45)",
        }}
      >
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} draggable={false} className="size-full object-cover" />
        ) : (
          <div
            className="grid size-full place-items-center text-[17px] font-extrabold text-white"
            style={{ background: swatch(item.name) }}
          >
            {item.name.slice(0, 2)}
          </div>
        )}
        <div
          className="absolute inset-x-0 bottom-0 truncate px-1 py-[3px] text-center text-[9px] leading-tight font-bold text-white"
          style={{ background: "rgba(17,20,28,.92)", borderTop: "1px solid rgba(255,255,255,.1)" }}
        >
          {item.name}
        </div>
        {/* Always-on neutral ring (over the image) for clear card boundaries. */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[4px]"
          style={{ boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.28)" }}
        />
        {voting && (
          <>
            <div className="pointer-events-none absolute inset-0 rounded-[4px] shadow-[0_0_0_2px_#FF4C3A_inset]" />
            <span className="absolute top-[3px] left-[3px] rounded-[2px] bg-[#FF4C3A] px-[4px] py-px text-[8px] font-extrabold text-white">
              LIVE
            </span>
          </>
        )}
        {locked && (
          <>
            <div className="pointer-events-none absolute inset-0 rounded-[4px] shadow-[0_0_0_2px_#818CF8_inset,0_0_12px_rgba(129,140,248,.6)]" />
            <span className="absolute top-[3px] right-[3px] grid size-[15px] place-items-center rounded-[3px] bg-[#6366F1] text-white">
              <Lock className="size-2.5" strokeWidth={2.5} />
            </span>
          </>
        )}
        {selected && (
          <div className="pointer-events-none absolute inset-0 rounded-[4px] shadow-[0_0_0_2px_#F5B942_inset]" />
        )}
        {dim && <div className="pointer-events-none absolute inset-0 rounded-[4px] bg-[rgba(8,9,13,.7)]" />}
        {highlight && (
          <div className="pointer-events-none absolute inset-0 rounded-[4px] shadow-[0_0_0_2px_#F5B942_inset,0_0_12px_rgba(245,182,66,.5)]" />
        )}
      </div>
    </div>
  );
}
