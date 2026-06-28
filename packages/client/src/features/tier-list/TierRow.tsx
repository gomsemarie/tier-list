import { useEffect, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ItemCard } from "./ItemCard";
import { isCardData, type ListData } from "./dnd";
import type { Item, Tier } from "@tier-list/shared";

/** Emblem label can be up to 4 chars — shrink so it fits the 84px emblem. */
function emblemFont(label: string): number {
  const n = [...label].length;
  return n <= 2 ? 32 : n === 3 ? 25 : 20;
}

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
  const colorRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [hover, setHover] = useState(false);

  // Edit label/epithet locally and commit on blur — committing on every
  // keystroke round-trips to the server in a room and breaks Korean IME.
  const [labelDraft, setLabelDraft] = useState(tier.label);
  const [epithetDraft, setEpithetDraft] = useState(tier.epithet ?? "");
  const editingLabel = useRef(false);
  const editingEpithet = useRef(false);
  useEffect(() => {
    if (!editingLabel.current) setLabelDraft(tier.label);
  }, [tier.label]);
  useEffect(() => {
    if (!editingEpithet.current) setEpithetDraft(tier.epithet ?? "");
  }, [tier.epithet]);

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
    <div className="flex border-b-2 border-[#454D5C] last:border-0">
      {/* Emblem */}
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="relative flex w-[84px] shrink-0 flex-col items-center justify-center gap-0.5 px-1 py-0.5"
        style={{ background: tier.color }}
      >
        <span className="absolute top-[5px] right-1.5 text-[10px] font-bold text-white/70 tabular-nums">
          {items.length}
        </span>
        <input
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onFocus={() => (editingLabel.current = true)}
          onBlur={() => {
            editingLabel.current = false;
            if (labelDraft !== tier.label) onRelabel(tier.id, labelDraft);
          }}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.currentTarget.blur()}
          aria-label="티어 이름"
          maxLength={4}
          className="font-display w-full truncate bg-transparent text-center leading-none text-white caret-white outline-none"
          style={{ fontSize: emblemFont(labelDraft), textShadow: "0 1px 3px rgba(0,0,0,.4)" }}
        />
        <input
          value={epithetDraft}
          onChange={(e) => setEpithetDraft(e.target.value)}
          onFocus={() => (editingEpithet.current = true)}
          onBlur={() => {
            editingEpithet.current = false;
            if (epithetDraft !== (tier.epithet ?? "")) onReEpithet(tier.id, epithetDraft);
          }}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.currentTarget.blur()}
          aria-label="티어 등급명"
          maxLength={6}
          placeholder="등급명"
          className="w-full bg-transparent text-center text-[10px] font-bold text-white/90 caret-white outline-none placeholder:text-white/40"
        />
        <div
          className={cn(
            "absolute top-1 left-1 flex items-center gap-1 transition-opacity",
            hover ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <button
            type="button"
            title="색상 변경"
            onClick={(e) => {
              e.stopPropagation();
              colorRef.current?.click();
            }}
            className="relative grid size-[18px] cursor-pointer place-items-center rounded-full bg-black/30 shadow-[0_0_0_1px_rgba(255,255,255,.45)]"
          >
            <span className="size-2 rounded-full bg-white" />
            <input
              ref={colorRef}
              type="color"
              value={tier.color}
              onChange={(e) => onRecolor(tier.id, e.target.value)}
              tabIndex={-1}
              className="pointer-events-none absolute bottom-0 size-0 opacity-0"
            />
          </button>
          {canDelete && (
            <button
              type="button"
              title="티어 삭제"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`'${tier.label}' 티어를 삭제할까요?`)) onDeleteTier(tier.id);
              }}
              className="grid size-[18px] place-items-center rounded-[4px] bg-black/30 text-white shadow-[0_0_0_1px_rgba(255,255,255,.45)]"
            >
              <X className="size-3" strokeWidth={3} />
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
