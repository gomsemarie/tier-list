import { useEffect, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { POOL_ID } from "@tier-list/shared";
import { ItemCard } from "./ItemCard";
import { isCardData, type ListData } from "./dnd";
import type { Item } from "@tier-list/shared";

type ItemPoolProps = {
  items: Item[];
  onEditItem: (item: Item) => void;
  onRemoveItem: (id: string) => void;
  onSelectItem?: (item: Item, rect: DOMRect) => void;
  matchedIds?: Set<string> | null;
  votingItemId?: string;
  selectedItemId?: string | null;
  dndEnabled?: boolean;
  /** Bottom draft tray: a single horizontal scrolling row (no dashed box). */
  horizontal?: boolean;
};

export function ItemPool({
  items,
  onEditItem,
  onRemoveItem,
  onSelectItem,
  matchedIds,
  votingItemId,
  selectedItemId,
  dndEnabled = true,
  horizontal = false,
}: ItemPoolProps) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = dropRef.current;
    if (!el || !dndEnabled) return;

    const data: ListData = { kind: "list", listId: POOL_ID };
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => isCardData(source.data),
      getData: () => ({ ...data }),
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    });
  }, [dndEnabled]);

  return (
    <div
      ref={dropRef}
      className={cn(
        horizontal
          ? "flex min-h-[88px] items-center gap-2.5 overflow-x-auto px-5 py-3 transition-colors duration-150"
          : "flex min-h-32 flex-wrap content-start gap-2.5 rounded-xl border border-dashed border-border bg-muted/40 p-4 transition-colors duration-150",
        isOver && (horizontal ? "bg-accent/60" : "border-foreground/40 bg-accent"),
      )}
    >
      {items.length === 0 ? (
        horizontal ? (
          <span className="px-1 text-sm text-muted-foreground">
            모든 대상이 배치되었습니다 — 위 입력칸에서 새 대상을 추가하세요.
          </span>
        ) : (
          <div className="m-auto flex flex-col items-center gap-2 text-center text-muted-foreground">
            <Inbox className="size-6 opacity-60" strokeWidth={1.5} />
            <p className="text-sm">
              대상을 추가하거나, 티어에서 이곳으로 끌어다 놓으세요.
            </p>
          </div>
        )
      ) : (
        items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            listId={POOL_ID}
            highlight={matchedIds ? matchedIds.has(item.id) : undefined}
            dim={matchedIds ? !matchedIds.has(item.id) : undefined}
            voting={votingItemId === item.id}
            selected={selectedItemId === item.id}
            dndEnabled={dndEnabled}
            onEdit={onEditItem}
            onRemove={onRemoveItem}
            onSelect={onSelectItem}
          />
        ))
      )}
    </div>
  );
}
