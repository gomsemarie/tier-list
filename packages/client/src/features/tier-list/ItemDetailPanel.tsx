import { useEffect } from "react";
import { History, Landmark, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Item } from "@tier-list/shared";

/** Deterministic, muted background color for the initials placeholder. */
function placeholderColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 32%, 58%)`;
}

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "방금";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

type ItemDetailPanelProps = {
  item: Item;
  /** Tier label + color the item sits in, or null when it's still unplaced. */
  tierLabel: string | null;
  tierColor: string | null;
  onClose: () => void;
  onEdit: (item: Item) => void;
  onRemove: (id: string) => void;
  /** Open a tier vote for this item (multiplayer, item placed in a tier). */
  onStartVote?: () => void;
};

/** Left fixed panel showing a large view of the selected item. */
export function ItemDetailPanel({
  item,
  tierLabel,
  tierColor,
  onClose,
  onEdit,
  onRemove,
  onStartVote,
}: ItemDetailPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="animate-slide-in-left shadow-pop fixed top-0 left-0 z-40 flex h-svh w-80 max-w-[85vw] flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-3">
        <p className="label-caps text-muted-foreground">상세 정보</p>
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* Large image */}
        <div className="aspect-square w-full overflow-hidden rounded-2xl border border-border">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="size-full object-cover"
            />
          ) : (
            <div
              className="flex size-full items-center justify-center text-6xl font-black text-white/95"
              style={{ backgroundColor: placeholderColor(item.name) }}
            >
              {item.name.trim().slice(0, 2) || "?"}
            </div>
          )}
        </div>

        <h2 className="mt-5 text-2xl font-extrabold tracking-tight break-words">
          {item.name}
        </h2>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">티어</dt>
            <dd>
              {tierLabel ? (
                <span
                  className="rounded-md px-2.5 py-1 font-bold text-white"
                  style={{ backgroundColor: tierColor ?? "var(--brand)" }}
                >
                  {tierLabel}
                </span>
              ) : (
                <span className="rounded-md bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                  미배치
                </span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <dt className="text-muted-foreground">올린 사람</dt>
            <dd className="font-medium">{item.addedBy?.trim() || "—"}</dd>
          </div>
        </dl>

        {onStartVote && (
          <Button
            variant="outline"
            className="mt-5 w-full"
            onClick={onStartVote}
          >
            <Landmark /> 인정협회 티어 투표
          </Button>
        )}

        {/* Tier-change history (most recent first, up to 10) */}
        {item.history && item.history.length > 0 && (
          <div className="mt-6">
            <p className="label-caps mb-2 flex items-center gap-1.5 text-muted-foreground">
              <History className="size-3.5" /> 티어 변경 이력
            </p>
            <ol className="grid gap-1.5">
              {[...item.history].reverse().map((h, i) => (
                <li
                  key={`${h.ts}-${i}`}
                  className="flex items-baseline gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                >
                  <span className="font-bold">{h.tier}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {h.by || "—"}
                  </span>
                  <span className="shrink-0 text-muted-foreground/70">
                    {relTime(h.ts)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-border p-3">
        <Button variant="outline" className="flex-1" onClick={() => onEdit(item)}>
          <Pencil /> 수정
        </Button>
        <Button
          variant="outline"
          className="text-destructive hover:bg-destructive hover:text-white"
          onClick={() => {
            if (window.confirm(`'${item.name}'을(를) 삭제할까요?`)) {
              onRemove(item.id);
              onClose();
            }
          }}
        >
          <Trash2 /> 삭제
        </Button>
      </div>
    </aside>
  );
}
