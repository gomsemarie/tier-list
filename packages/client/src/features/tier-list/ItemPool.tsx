import { useEffect, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

import { cn } from "@/lib/utils";
import { POOL_ID } from "@tier-list/shared";
import { ItemCard } from "./ItemCard";
import { isCardData, type ListData } from "./dnd";
import type { Item } from "@tier-list/shared";

type ItemPoolProps = {
  items: Item[];
  matchedIds?: Set<string> | null;
  votingItemId?: string;
  /** Room has Coupang shortcut enabled. */
  coupang?: boolean;
  selectedItemId?: string | null;
  dndEnabled?: boolean;
  onSelectItem?: (item: Item, rect: DOMRect) => void;
};

/** Bottom draft tray: single horizontal scrolling row of unplaced items. */
export function ItemPool({
  items,
  matchedIds,
  votingItemId,
  coupang,
  selectedItemId,
  dndEnabled = true,
  onSelectItem,
}: ItemPoolProps) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = dropRef.current;
    if (!el || !dndEnabled) return;
    const data: ListData = { kind: "list", listId: POOL_ID };
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => isCardData(source.data),
      getData: () => ({ ...data }),
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false),
    });
  }, [dndEnabled]);

  return (
    <div
      ref={dropRef}
      className={cn(
        "flex min-h-[88px] items-center gap-[7px] overflow-x-auto px-5 py-3 transition-colors",
        over && "bg-accent/60",
      )}
    >
      {items.length === 0 ? (
        <span className="px-1 text-sm text-muted-foreground">
          모든 대상이 배치되었습니다 — 위 입력칸에서 새 대상을 추가하세요.
        </span>
      ) : (
        items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            listId={POOL_ID}
            highlight={matchedIds ? matchedIds.has(item.id) : undefined}
            dim={matchedIds ? !matchedIds.has(item.id) : undefined}
            voting={votingItemId === item.id}
            coupang={coupang}
            selected={selectedItemId === item.id}
            dndEnabled={dndEnabled}
            onSelect={onSelectItem}
          />
        ))
      )}
    </div>
  );
}
