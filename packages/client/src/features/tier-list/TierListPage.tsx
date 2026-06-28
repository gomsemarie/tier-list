import { useEffect, useRef, useState } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronUp,
  LogOut,
  Palette,
  Plus,
  RotateCcw,
  Search as SearchIcon,
  Trophy,
  UserCog,
  Users,
} from "lucide-react";

import { POOL_ID, TIER_COLORS } from "@tier-list/shared";
import type { Item, Member } from "@tier-list/shared";
import { isCardData, isListData } from "./dnd";
import { AccountDialog } from "./AccountDialog";
import { AttackEffect, type AttackItem } from "./AttackEffect";
import { AuthDialog } from "./AuthDialog";
import { Avatar } from "./Avatar";
import { BanWarningFrame } from "./BanWarningFrame";
import { BulkAddDialog } from "./BulkAddDialog";
import { HintToast } from "./HintToast";
import { ItemFormDialog } from "./ItemFormDialog";
import { ItemPool } from "./ItemPool";
import { LivePanel } from "./LivePanel";
import { MemberOverlay } from "./MemberOverlay";
import { MiniResult } from "./MiniResult";
import { PresenceAvatar } from "./PresenceAvatar";
import { ModerationEffect } from "./ModerationEffect";
import { PromotionEffect } from "./PromotionEffect";
import { QuickVoteBar } from "./QuickVoteBar";
import { RoomDialog } from "./RoomDialog";
import { StartVoteDialog } from "./StartVoteDialog";
import { TierPopover } from "./TierPopover";
import { TierRow } from "./TierRow";
import { useRoom } from "./useRoom";
import { useLocalTierList } from "./useTierList";

const STATUS_META = {
  online: { color: "#5BD3A0", label: "온라인" },
  connecting: { color: "#F5B942", label: "연결 중" },
  offline: { color: "#7A808E", label: "오프라인" },
} as const;

/**
 * NOTE: fresh rebuild in progress (Claude Design handoff). This is the single-
 * mode board shell; multiplayer / popover / live panel / dialogs / effects are
 * being rebuilt component-by-component on top of the preserved data layer.
 */
export function TierListPage() {
  const room = useRoom();
  const local = useLocalTierList();
  const controller = room.controller ?? local;
  const { state } = controller;

  const [search, setSearch] = useState("");
  const [sortAZ, setSortAZ] = useState(false);
  const [topN, setTopN] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [menu, setMenu] = useState<{ item: Item; anchor: DOMRect } | null>(null);
  const [form, setForm] = useState<{ item?: Item } | null>(null);
  const [bulk, setBulk] = useState(false);
  const [auth, setAuth] = useState(false);
  const [lobby, setLobby] = useState(false);
  const [voteFor, setVoteFor] = useState<Item | null>(null);
  const [acct, setAcct] = useState(false);
  const [account, setAccount] = useState(false);
  const [memberView, setMemberView] = useState<Member | null>(null);
  const [attackCd, setAttackCd] = useState<Record<string, number>>({});
  const [promo, setPromo] = useState<{
    itemName: string;
    tier: { label: string; color: string; epithet: string };
    kind: "up" | "down" | "keep";
  } | null>(null);
  const promoKeyRef = useRef<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Close the lobby once we're actually in a room.
  const inRoom = !!room.room;
  useEffect(() => {
    if (inRoom) setLobby(false);
  }, [inRoom]);

  const myMember = room.room?.members.find((m) => m.userId === room.authUser?.id);
  const canModerate =
    !!room.authUser && (room.authUser.isAdmin || myMember?.role === "owner" || myMember?.role === "admin");

  // Show the tier-decided effect once whenever a vote resolves into a move
  // (any direction, all members — heading adapts: 승급 / 강등 / 유지).
  const activeVote = room.activeVote;
  const tiers = state.tiers;
  useEffect(() => {
    if (!activeVote || activeVote.phase !== "result") return;
    const r = activeVote.result;
    if (!r || r.outcome !== "moved" || !r.toLabel) return;
    const key = `${activeVote.id}:${activeVote.round}`;
    if (promoKeyRef.current === key) return;
    const toIndex = tiers.findIndex((t) => t.label === r.toLabel);
    if (toIndex === -1) return;
    const fromIndex = activeVote.currentTier
      ? tiers.findIndex((t) => t.label === activeVote.currentTier!.label)
      : Infinity;
    const kind = fromIndex === Infinity || toIndex < fromIndex ? "up" : toIndex > fromIndex ? "down" : "keep";
    promoKeyRef.current = key;
    const t = tiers[toIndex];
    setPromo({
      itemName: activeVote.itemName,
      tier: { label: r.toLabel, color: r.toColor ?? t.color, epithet: t.epithet ?? "" },
      kind,
    });
  }, [activeVote, tiers]);

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
    const list = (state.placement[listId] ?? []).map((id) => state.items[id]).filter(Boolean);
    return sortAZ ? [...list].sort((a, b) => a.name.localeCompare(b.name, "ko")) : list;
  }

  function tierOf(itemId: string): string | null {
    for (const tier of state.tiers) {
      if ((state.placement[tier.id] ?? []).includes(itemId)) return tier.id;
    }
    return null;
  }

  // Items to scatter during an attack — lower tier = heavier (bigger, wilder).
  function attackItems(): AttackItem[] {
    const last = Math.max(1, state.tiers.length - 1);
    return Object.values(state.items).map((it) => {
      const tid = tierOf(it.id);
      const idx = tid ? state.tiers.findIndex((t) => t.id === tid) : -1;
      return { src: it.imageUrl ?? null, name: it.name, weight: idx < 0 ? 0.5 : idx / last };
    });
  }

  // Re-apply the current default palette to existing tiers (color only — keeps
  // labels, epithets, and items). Fixes rooms created with an older palette.
  function applyPalette() {
    state.tiers.forEach((t, i) => controller.updateTier(t.id, { color: TIER_COLORS[i % TIER_COLORS.length] }));
  }

  function quickAdd() {
    const n = draftName.trim();
    if (!n) return;
    controller.addItem(n, null);
    setDraftName("");
  }

  const q = search.trim().toLowerCase();
  const searchSet = q
    ? new Set(Object.values(state.items).filter((it) => it.name.toLowerCase().includes(q)).map((it) => it.id))
    : null;
  // Overall ranking: tier order (S first), then placement order within a tier
  // (top-left = higher). Pool items are unranked. Top-N = first N of that order.
  let topSet: Set<string> | null = null;
  if (topN != null && topN > 0) {
    const ranking: string[] = [];
    for (const tier of state.tiers) {
      for (const id of state.placement[tier.id] ?? []) if (state.items[id]) ranking.push(id);
    }
    topSet = new Set(ranking.slice(0, topN));
  }
  const matchedIds = topSet
    ? searchSet
      ? new Set([...searchSet].filter((id) => topSet!.has(id)))
      : topSet
    : searchSet;

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
          {!room.room && <span className="text-[11px] text-muted-foreground">로컬 편집 · 브라우저 저장</span>}
        </div>

        {room.room && (
          <>
            <span className="h-[22px] w-px bg-border" />
            <div className="flex items-center gap-2">
              {room.room.members.slice(0, 8).map((m) => (
                <PresenceAvatar key={m.id} member={m} size={34} onClick={() => setMemberView(m)} />
              ))}
              {room.room.members.length > 8 && (
                <span className="text-[12px] font-semibold text-muted-foreground">
                  +{room.room.members.length - 8}
                </span>
              )}
              <span className="ml-1 text-[12px] font-semibold text-muted-foreground">{room.room.members.length}명</span>
            </div>
          </>
        )}

        <div className="flex-1" />
        <span
          title={`서버 ${STATUS_META[room.status].label}`}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground"
        >
          <span className="size-[7px] rounded-full" style={{ background: STATUS_META[room.status].color }} />
          {STATUS_META[room.status].label}
        </span>
        {room.room ? (
          <>
            <span className="max-w-[200px] truncate text-[13px] font-bold text-foreground" title={room.room.title}>
              {room.room.title}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-[1px] text-muted-foreground">
              {room.room.id}
            </span>
            <button
              type="button"
              onClick={room.leaveRoom}
              className="flex h-[34px] items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-bold text-foreground"
            >
              <LogOut className="size-4" /> 나가기
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => (room.authUser ? setLobby(true) : setAuth(true))}
            className="flex h-[34px] items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-bold text-foreground"
          >
            <Users className="size-4" /> 멀티
          </button>
        )}
        {room.authUser ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setAcct((v) => !v)}
              className="flex h-[34px] items-center gap-1.5 rounded-md border border-border bg-card pr-3 pl-1.5 text-[13px] font-bold text-foreground"
            >
              <Avatar name={room.authUser.nickname} src={room.authUser.avatar} frame={room.authUser.frame} size={26} />
              {room.authUser.nickname}
            </button>
            {acct && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAcct(false)} />
                <div className="absolute right-0 z-50 mt-1.5 w-40 overflow-hidden rounded-md border border-border bg-card py-1 shadow-[0_12px_32px_rgba(0,0,0,.5)]">
                  <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
                    <span className="font-bold text-foreground">{room.authUser.nickname}</span> 으로 로그인됨
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAcct(false);
                      setAccount(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-accent"
                  >
                    <UserCog className="size-4" /> 계정 관리
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAcct(false);
                      room.logout();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-accent"
                  >
                    <LogOut className="size-4" /> 로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAuth(true)}
            className="h-[34px] rounded-md border border-border bg-card px-3 text-[13px] font-bold text-foreground"
          >
            로그인
          </button>
        )}
        <button
          type="button"
          onClick={() => setForm({})}
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

      <div className="flex min-h-0 flex-1">
       <div className="flex min-w-0 flex-1 flex-col">
        {/* Board header */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5 px-5 pt-4 pb-3">
          <div>
            <h1 className="max-w-[420px] truncate text-2xl font-extrabold tracking-tight">
              {room.room ? room.room.title : "티어리스트"}
            </h1>
            <div className="mt-2 flex items-center gap-x-3 text-[13px]">
              <span className="font-semibold text-muted-foreground">
                <b className="text-indigo-fg tabular-nums">{ranked}</b> / {total} 배치
              </span>
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-[#2C333F] ring-1 ring-inset ring-[#3A4250]">
                <span
                  className="block h-full rounded-full bg-indigo transition-[width] duration-300"
                  style={{ width: `${total ? Math.round((ranked / total) * 100) : 0}%` }}
                />
              </span>
              <span className="text-xs font-semibold text-indigo-fg tabular-nums">
                {total ? Math.round((ranked / total) * 100) : 0}%
              </span>
              <span className="text-xs text-muted-foreground">티어 {state.tiers.length}</span>
            </div>
          </div>
          <div className="flex-1" />
          {room.room && (
            <button
              type="button"
              onClick={() => room.setVoteOptOut(!room.voteOptOut)}
              title="투표 간소화 — 켜면 큰 카드 대신 상단 미니 현황으로 보고, 원할 때만 한 표 던집니다"
              className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-bold"
              style={
                room.voteOptOut
                  ? { borderColor: "rgba(245,182,66,.5)", background: "rgba(245,182,66,.14)", color: "#F5B942" }
                  : { borderColor: "var(--border)", background: "var(--card)", color: "var(--muted-foreground)" }
              }
            >
              <span className="size-[7px] rounded-full" style={{ background: room.voteOptOut ? "#F5B942" : "#6A707E" }} />
              투표 간소화
            </button>
          )}
          <button
            type="button"
            onClick={() => window.confirm("티어 색상을 현재 기본 팔레트로 새로 적용할까요? (아이템·이름은 유지)") && applyPalette()}
            title="티어 색상 새 팔레트로 적용 (아이템·이름 유지)"
            className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            <Palette className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setSortAZ((v) => !v)}
            title="사전순 보기 (켜면 드래그 잠금)"
            className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-bold"
            style={
              sortAZ
                ? { borderColor: "rgba(99,102,241,.5)", background: "rgba(99,102,241,.14)", color: "var(--indigo-fg)" }
                : { borderColor: "var(--border)", background: "var(--card)", color: "var(--muted-foreground)" }
            }
          >
            <ArrowDownAZ className="size-4" /> 사전순
          </button>
          <div
            className="flex h-9 items-center gap-1 rounded-lg border pr-2 pl-1"
            style={
              topN != null
                ? { borderColor: "rgba(99,102,241,.5)", background: "rgba(99,102,241,.14)" }
                : { borderColor: "var(--border)", background: "var(--card)" }
            }
          >
            <button
              type="button"
              onClick={() => setTopN((v) => (v == null ? 10 : null))}
              title="상위 N개만 강조 (랭킹: 티어 순서 + 티어 내 왼쪽 위)"
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-bold"
              style={{ color: topN != null ? "var(--indigo-fg)" : "var(--muted-foreground)" }}
            >
              <Trophy className="size-4" /> 상위
            </button>
            {topN != null && (
              <div className="flex h-7 items-center overflow-hidden rounded-md border border-border bg-card">
                <input
                  type="number"
                  min={1}
                  value={topN}
                  onChange={(e) => setTopN(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                  className="h-full w-11 bg-transparent text-center text-[15px] font-extrabold text-foreground tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <div className="flex h-full w-5 flex-col border-l border-border">
                  <button
                    type="button"
                    aria-label="증가"
                    onClick={() => setTopN((n) => (n ?? 10) + 1)}
                    className="grid flex-1 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ChevronUp className="size-3" strokeWidth={3} />
                  </button>
                  <button
                    type="button"
                    aria-label="감소"
                    onClick={() => setTopN((n) => Math.max(1, (n ?? 10) - 1))}
                    className="grid flex-1 place-items-center border-t border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ChevronDown className="size-3" strokeWidth={3} />
                  </button>
                </div>
              </div>
            )}
          </div>
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
                selectedItemId={menu?.item.id ?? null}
                dndEnabled={!sortAZ}
                onSelectItem={(item, anchor) => setMenu({ item, anchor })}
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
            <button
              type="button"
              onClick={() => setBulk(true)}
              className="h-8 rounded-md border border-border bg-card px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              일괄 추가
            </button>
            <div className="flex-1" />
            <span className="text-[11px] text-muted-foreground">티어로 드래그</span>
          </div>
          <ItemPool
            items={itemsOf(POOL_ID)}
            matchedIds={matchedIds}
            selectedItemId={menu?.item.id ?? null}
            dndEnabled={!sortAZ}
            onSelectItem={(item, anchor) => setMenu({ item, anchor })}
          />
        </div>
       </div>

       {room.room && (
         <LivePanel
           members={room.room.members}
           messages={room.room.messages}
           history={room.room.history ?? []}
           activeVote={room.activeVote}
           voteOptOut={room.voteOptOut}
           canSuper={
             !!room.authUser?.scStyle && room.authUser.unlocked.includes(room.authUser.scStyle)
           }
           canModerate={canModerate}
           onCast={room.castVote}
           onSend={room.sendChat}
           onClearChat={() => room.moderate("clearChat")}
           onOpenMember={setMemberView}
         />
       )}
      </div>

      {menu && (
        <TierPopover
          item={state.items[menu.item.id] ?? menu.item}
          anchor={menu.anchor}
          tiers={state.tiers}
          currentTierId={tierOf(menu.item.id)}
          history={room.room?.history?.filter((h) => h.itemName === menu.item.name)}
          members={room.room?.members}
          onMove={(tierId) => {
            controller.moveItem(menu.item.id, tierId, state.placement[tierId]?.length ?? 0);
            setMenu(null);
          }}
          onPool={() => {
            controller.moveItem(menu.item.id, POOL_ID, state.placement[POOL_ID]?.length ?? 0);
            setMenu(null);
          }}
          onStartVote={
            room.room
              ? () => {
                  setVoteFor(menu.item);
                  setMenu(null);
                }
              : undefined
          }
          onEdit={() => {
            setForm({ item: menu.item });
            setMenu(null);
          }}
          onRemove={() => {
            controller.removeItem(menu.item.id);
            setMenu(null);
          }}
          onSetLinks={(links) => controller.updateItem(menu.item.id, { links })}
          onClose={() => setMenu(null)}
        />
      )}

      {form && (
        <ItemFormDialog
          item={form.item}
          onSubmit={(name, imageUrl) => {
            if (form.item) controller.updateItem(form.item.id, { name, imageUrl });
            else controller.addItem(name, imageUrl);
            setForm(null);
          }}
          onDelete={
            form.item
              ? () => {
                  controller.removeItem(form.item!.id);
                  setForm(null);
                }
              : undefined
          }
          onClose={() => setForm(null)}
        />
      )}

      {bulk && (
        <BulkAddDialog
          onSubmit={(names) => {
            controller.addItems(names.map((name) => ({ name, imageUrl: null })));
            setBulk(false);
          }}
          onClose={() => setBulk(false)}
        />
      )}

      {auth && (
        <AuthDialog
          onLogin={room.login}
          onRegister={room.register}
          onClose={() => setAuth(false)}
        />
      )}

      {account && room.authUser && (
        <AccountDialog
          user={room.authUser}
          onUpdateProfile={room.updateProfile}
          onEquip={room.equipPerk}
          onRedeem={room.redeemCode}
          onIssueCode={room.issueCode}
          onFetchCodes={room.fetchCodes}
          onLogout={() => {
            setAccount(false);
            room.logout();
          }}
          onClose={() => setAccount(false)}
        />
      )}

      {room.room && room.voteOptOut && room.activeVote && (
        <QuickVoteBar vote={room.activeVote} myUserId={room.authUser?.id} onCast={room.castVote} />
      )}

      {memberView && room.room && room.authUser && (() => {
        const canAttack = canModerate || room.authUser.unlocked.includes("attack");
        const live = room.room.members.find((m) => m.userId === memberView.userId) ?? memberView;
        const isSelf = memberView.userId === room.authUser.id;
        return (
          <MemberOverlay
            member={live}
            isSelf={isSelf}
            canModerate={canModerate}
            canGrantAdmin={room.authUser.isAdmin}
            canAttack={canAttack}
            attackReadyAt={memberView.userId ? attackCd[memberView.userId] ?? 0 : 0}
            onModerate={(action, seconds) => {
              room.moderate(action, memberView.userId, seconds);
              if (action === "attack" && memberView.userId)
                setAttackCd((c) => ({ ...c, [memberView.userId!]: Date.now() + 5_000 }));
              if (action === "kick") setMemberView(null);
            }}
            onGrantAdmin={(make) => {
              if (memberView.userId) room.grantAdmin(memberView.userId, make);
            }}
            onClose={() => setMemberView(null)}
          />
        );
      })()}

      {promo &&
        (room.voteOptOut ? (
          <MiniResult
            itemName={promo.itemName}
            tier={promo.tier}
            kind={promo.kind}
            onDone={() => setPromo(null)}
          />
        ) : (
          <PromotionEffect
            itemName={promo.itemName}
            tier={promo.tier}
            kind={promo.kind}
            tiers={state.tiers}
            onDismiss={() => setPromo(null)}
          />
        ))}

      {room.attack && (
        <AttackEffect
          key={room.attack.at}
          attackKey={room.attack.at}
          by={room.attack.by}
          parryable={room.attack.parryable}
          level={room.attack.level}
          items={attackItems()}
          onParry={(escalate) => room.attack?.byUserId && room.parryAttack(room.attack.byUserId, escalate)}
          onHit={() => room.attack?.byUserId && room.rallyHit(room.attack.byUserId)}
          onDone={room.clearAttack}
        />
      )}

      {room.moderation && (
        <ModerationEffect
          key={room.moderation.at}
          effectKey={room.moderation.at}
          action={room.moderation.action}
          targetName={room.moderation.targetName}
          by={room.moderation.by}
          durationLabel={room.moderation.durationLabel}
          onDone={room.clearModeration}
        />
      )}

      {(() => {
        const me = room.room?.members.find((m) => m.userId === room.authUser?.id);
        return me ? (
          <BanWarningFrame
            mutedUntil={me.mutedUntil}
            placeBannedUntil={me.placeBannedUntil}
            voteBannedUntil={me.voteBannedUntil}
          />
        ) : null;
      })()}

      <HintToast hints={room.hints} />

      {voteFor && (
        <StartVoteDialog
          item={voteFor}
          currentTier={(() => {
            const id = tierOf(voteFor.id);
            const t = id ? state.tiers.find((x) => x.id === id) : null;
            return t ? { label: t.label, color: t.color } : null;
          })()}
          onConfirm={(reason, seconds) => {
            room.startVote(voteFor.id, reason, seconds);
            setVoteFor(null);
          }}
          onCancel={() => setVoteFor(null)}
        />
      )}

      {lobby && room.authUser && (
        <RoomDialog
          rooms={room.roomList}
          nickname={room.authUser.nickname}
          myId={room.authUser.id}
          isAdmin={room.authUser.isAdmin}
          error={room.error}
          onRefresh={room.listRooms}
          onRename={(id, title) => {
            room.renameRoom(id, title);
            room.listRooms();
          }}
          onDelete={(id) => {
            room.deleteRoom(id);
            room.listRooms();
          }}
          onJoin={(c) => {
            room.clearError();
            room.joinRoom(c);
          }}
          onCreate={(t, p, img) => {
            room.clearError();
            room.createRoom(t, p, img);
          }}
          onSetImage={room.setRoomImage}
          onClose={() => {
            room.clearError();
            setLobby(false);
          }}
        />
      )}
    </div>
  );
}
