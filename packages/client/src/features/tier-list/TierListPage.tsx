import { useEffect, useRef, useState } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { Plus, RotateCcw, Search as SearchIcon } from "lucide-react";

import { POOL_ID } from "@tier-list/shared";
import type { Item } from "@tier-list/shared";
import { isCardData, isListData } from "./dnd";
import { ItemPool } from "./ItemPool";
import { TierRow } from "./TierRow";
import { useLocalTierList } from "./useTierList";

/**
 * NOTE: fresh rebuild in progress (Claude Design handoff). This is the single-
 * mode board shell; multiplayer / popover / live panel / dialogs / effects are
 * being rebuilt component-by-component on top of the preserved data layer.
 */
export function TierListPage() {
  const controller = useLocalTierList();
  const { state } = controller;

  const [search, setSearch] = useState("");
  const [draftName, setDraftName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const placementRef = useRef(state.placement);
  placementRef.current = state.placement;

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => isCardData(source.data),
      onDrop: ({ location, source }) => {
        const target = location.current.dropTargets[0];
        if (!target || !isCardData(source.data)) return;
        const itemId = source.data.itemId;
        const td = target.data;
        if (isCardData(td)) {
          const list = placementRef.current[td.listId] ?? [];
          const idx = list.indexOf(td.itemId);
          const edge = extractClosestEdge(td);
          controllerRef.current.moveItem(itemId, td.listId, edge === "right" ? idx + 1 : idx);
        } else if (isListData(td)) {
          const list = placementRef.current[td.listId] ?? [];
          controllerRef.current.moveItem(itemId, td.listId, list.length);
        }
      },
    });
  }, []);

  function itemsOf(listId: string): Item[] {
    return (state.placement[listId] ?? []).map((id) => state.items[id]).filter(Boolean);
  }

  function quickAdd() {
    const n = draftName.trim();
    if (!n) return;
    controller.addItem(n, null);
    setDraftName("");
  }

  const q = search.trim().toLowerCase();
  const matchedIds = q
    ? new Set(Object.values(state.items).filter((it) => it.name.toLowerCase().includes(q)).map((it) => it.id))
    : null;

  const total = Object.keys(state.items).length;
  const ranked = total - itemsOf(POOL_ID).length;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* App header */}
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-panel-head px-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-[26px] w-[26px] flex-col justify-center gap-[3px] rounded-md border border-line-strong bg-secondary px-[6px]">
            <span className="h-[3px] w-full rounded-sm bg-amber" />
            <span className="h-[3px] w-[68%] rounded-sm bg-indigo" />
            <span className="h-[3px] w-[42%] rounded-sm bg-teal" />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">티어리스트</span>
          <span className="text-[11px] text-muted-foreground">로컬 편집 · 브라우저 저장</span>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => addInputRef.current?.focus()}
          className="flex h-[34px] items-center gap-1.5 rounded-md bg-indigo px-3.5 text-[13px] font-bold text-white"
        >
          <Plus className="size-4" /> 대상 추가
        </button>
        <button
          type="button"
          aria-label="초기화"
          onClick={() => window.confirm("모든 티어와 대상을 초기화할까요?") && controller.reset()}
          className="grid size-[34px] place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Board header */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5 px-5 pt-4 pb-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">티어리스트</h1>
            <div className="mt-2 flex items-center gap-x-3 text-[13px]">
              <span className="font-semibold text-muted-foreground">
                <b className="text-indigo-fg tabular-nums">{ranked}</b> / {total} 배치
              </span>
              <span className="h-1 w-28 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-indigo transition-[width] duration-300"
                  style={{ width: `${total ? Math.round((ranked / total) * 100) : 0}%` }}
                />
              </span>
              <span className="text-xs text-muted-foreground">티어 {state.tiers.length}</span>
            </div>
          </div>
          <div className="flex-1" />
          <div className="relative w-60 max-w-full">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              placeholder="대상 검색"
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          {matchedIds && (
            <span className="text-xs text-indigo-fg tabular-nums">{matchedIds.size}개 일치</span>
          )}
        </div>

        {/* Board */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <section className="overflow-hidden rounded-[8px] border border-[#1E232D] bg-[#181C24]">
            {state.tiers.map((tier) => (
              <TierRow
                key={tier.id}
                tier={tier}
                items={itemsOf(tier.id)}
                canDelete={state.tiers.length > 1}
                matchedIds={matchedIds}
                selectedItemId={null}
                onRelabel={(id, label) => controller.updateTier(id, { label })}
                onReEpithet={(id, epithet) => controller.updateTier(id, { epithet })}
                onRecolor={(id, color) => controller.updateTier(id, { color })}
                onDeleteTier={controller.removeTier}
              />
            ))}
          </section>
          <button
            type="button"
            onClick={controller.addTier}
            className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-[#2A303C] px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" /> 티어 추가
          </button>
        </div>

        {/* Draft tray */}
        <div className="shrink-0 border-t border-border bg-panel">
          <div className="flex items-center gap-2.5 px-5 pt-2.5">
            <span className="text-[11px] font-extrabold tracking-wide text-muted-foreground">미배치</span>
            <span className="rounded bg-indigo/15 px-1.5 text-[11px] font-bold text-indigo-fg tabular-nums">
              {itemsOf(POOL_ID).length}
            </span>
            <div className="relative w-48">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">＋</span>
              <input
                ref={addInputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && quickAdd()}
                placeholder="새 대상 입력 후 Enter"
                className="h-8 w-full rounded-md border border-border bg-card pr-2 pl-6 text-xs outline-none focus:border-foreground/40"
              />
            </div>
            <div className="flex-1" />
            <span className="text-[11px] text-muted-foreground">티어로 드래그</span>
          </div>
          <ItemPool
            items={itemsOf(POOL_ID)}
            matchedIds={matchedIds}
            selectedItemId={null}
          />
        </div>
      </div>
    </div>
  );
}
