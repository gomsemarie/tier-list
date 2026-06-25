import { useEffect, useRef, useState } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  ArrowDownAZ,
  Copy,
  ListPlus,
  LogIn,
  LogOut,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Search as SearchIcon,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { POOL_ID, rolePriority, VOTE_ABSTAIN, type MemberRole } from "@tier-list/shared";
import { AccountDialog } from "./AccountDialog";
import { AttackEffect } from "./AttackEffect";
import { AuthDialog } from "./AuthDialog";
import { Avatar } from "./Avatar";
import { BanWarningFrame } from "./BanWarningFrame";
import { BulkAddDialog } from "./BulkAddDialog";
import { ChangeHistory } from "./ChangeHistory";
import { ChatPanel } from "./ChatPanel";
import { isCardData, isListData } from "./dnd";
import { ItemFormDialog } from "./ItemFormDialog";
import { ItemPool } from "./ItemPool";
import { ModerationEffect } from "./ModerationEffect";
import { MultiplayerDialog } from "./MultiplayerDialog";
import { PanelVoteCard } from "./PanelVoteCard";
import { PromotionEffect } from "./PromotionEffect";
import { QuickVoteBar } from "./QuickVoteBar";
import { ThemeToggle } from "./ThemeToggle";
import { StartVoteDialog } from "./StartVoteDialog";
import { RoleBadge } from "./RoleBadge";
import { TierPopover } from "./TierPopover";
import { TierRow } from "./TierRow";
import { UserProfileOverlay, type ProfileView } from "./UserProfileOverlay";
import { VoteOverlay } from "./VoteOverlay";
import type { Item } from "@tier-list/shared";
import { useLocalTierList } from "./useTierList";
import { useRoom } from "./useRoom";

export function TierListPage() {
  const local = useLocalTierList();
  const room = useRoom();

  const inRoom = room.room !== null;
  const controller = inRoom && room.controller ? room.controller : local;
  const { state } = controller;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [multiOpen, setMultiOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [menu, setMenu] = useState<{ item: Item; rect: DOMRect } | null>(null);
  const [voteStartItem, setVoteStartItem] = useState<Item | null>(null);
  const [search, setSearch] = useState("");
  const [alphabetical, setAlphabetical] = useState(false);
  const [trayOpen, setTrayOpen] = useState(true);
  const [draftName, setDraftName] = useState("");
  // Vote id this user dismissed via 무효표 (overlay hidden for them).
  const [dismissedVoteId, setDismissedVoteId] = useState<string | null>(null);

  const authUser = room.authUser;

  // Viewer's role in the current room (admin outranks owner outranks member).
  const viewerRole: MemberRole = !authUser
    ? "member"
    : authUser.isAdmin
      ? "admin"
      : room.room?.ownerId === authUser.id
        ? "owner"
        : "member";
  const viewerCanModerate = viewerRole === "admin" || viewerRole === "owner";

  // Selected participant for the profile/moderation overlay (read live so its
  // mute/ban status refreshes after a moderation action).
  const profileMember =
    profileMemberId && room.room
      ? (room.room.members.find((m) => m.id === profileMemberId) ?? null)
      : null;
  const profileView: ProfileView | null = profileMember
    ? {
        userId: profileMember.userId,
        nickname: profileMember.name,
        avatar: profileMember.avatar,
        username: profileMember.username,
        frame: profileMember.frame,
        role: profileMember.role,
        mutedUntil: profileMember.mutedUntil,
        placeBannedUntil: profileMember.placeBannedUntil,
        voteBannedUntil: profileMember.voteBannedUntil,
      }
    : null;
  const canModerateTarget =
    !!profileMember &&
    !!authUser &&
    profileMember.userId !== authUser.id &&
    rolePriority(viewerRole) > rolePriority(profileMember.role ?? "member");
  // Admins can promote/demote anyone but themselves (env admins are blocked
  // server-side). Independent of the moderation outranking rule.
  const canGrantAdmin =
    !!profileMember &&
    !!authUser &&
    authUser.isAdmin &&
    profileMember.userId !== authUser.id;
  // Attack: owner/admin over the target, OR anyone who unlocked the attack perk.
  const canAttackTarget =
    !!profileMember &&
    !!authUser &&
    profileMember.userId !== authUser.id &&
    (canModerateTarget || authUser.unlocked.includes("attack"));

  // My own moderation status in the room.
  const myMember =
    room.room && authUser
      ? room.room.members.find((m) => m.userId === authUser.id)
      : undefined;
  const myPlaceBannedUntil = myMember?.placeBannedUntil;
  const placeBanned =
    myPlaceBannedUntil !== undefined && myPlaceBannedUntil > Date.now();

  // The popover's item (read fresh from state) + its current tier id.
  const menuItem = menu ? (state.items[menu.item.id] ?? null) : null;
  const menuTierId = menuItem
    ? (Object.entries(state.placement).find(([, ids]) =>
        ids.includes(menuItem.id),
      )?.[0] ?? null)
    : null;

  // Current tier of the item being put up for a vote (for the start dialog).
  const voteStartTier = (() => {
    if (!voteStartItem) return null;
    const lid = Object.entries(state.placement).find(([, ids]) =>
      ids.includes(voteStartItem.id),
    )?.[0];
    const t = lid && lid !== POOL_ID ? state.tiers.find((x) => x.id === lid) : null;
    return t ? { label: t.label, color: t.color } : null;
  })();

  // Close the multiplayer dialog once we've joined a room.
  useEffect(() => {
    if (inRoom) setMultiOpen(false);
  }, [inRoom]);

  // Refs let the drop monitor read the latest controller/placement without
  // re-subscribing on every state change.
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
        const targetData = target.data;

        if (isCardData(targetData)) {
          const list = placementRef.current[targetData.listId] ?? [];
          const idx = list.indexOf(targetData.itemId);
          const edge = extractClosestEdge(targetData);
          const insertIndex = edge === "right" ? idx + 1 : idx;
          controllerRef.current.moveItem(itemId, targetData.listId, insertIndex);
        } else if (isListData(targetData)) {
          const list = placementRef.current[targetData.listId] ?? [];
          controllerRef.current.moveItem(itemId, targetData.listId, list.length);
        }
      },
    });
  }, []);

  function itemsOf(listId: string): Item[] {
    const arr = (state.placement[listId] ?? [])
      .map((id) => state.items[id])
      .filter(Boolean);
    // Alphabetical is a *view* only — it doesn't change the stored ranking.
    return alphabetical
      ? [...arr].sort((a, b) => a.name.localeCompare(b.name, "ko"))
      : arr;
  }

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function quickAdd() {
    const n = draftName.trim();
    if (!n) return;
    controller.addItem(n, null);
    setDraftName("");
  }

  function openEdit(item: Item) {
    setEditing(item);
    setDialogOpen(true);
  }

  function handleSave(name: string, imageUrl: string | null) {
    if (editing) {
      controller.updateItem(editing.id, { name, imageUrl });
    } else {
      controller.addItem(name, imageUrl);
    }
  }

  function handleReset() {
    const msg = inRoom
      ? "이 방의 모든 티어와 대상을 초기화할까요? (참가자 모두에게 적용됩니다)"
      : "모든 티어와 대상을 초기화할까요?";
    if (window.confirm(msg)) controller.reset();
  }

  function copyCode() {
    if (!room.room) return;
    const code = room.room.id;
    // navigator.clipboard is unavailable over plain http (non-secure context),
    // which is exactly the LAN-IP case — fall back to a temp textarea.
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(code);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = code;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      // ignore — user can copy manually
    }
    document.body.removeChild(ta);
  }

  const totalItems = Object.keys(state.items).length;
  const rankedCount = totalItems - itemsOf(POOL_ID).length;

  // Board search: highlight matching items, dim the rest.
  const searchQuery = search.trim().toLowerCase();
  const matchedIds = searchQuery
    ? new Set(
        Object.values(state.items)
          .filter((it) => it.name.toLowerCase().includes(searchQuery))
          .map((it) => it.id),
      )
    : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ── App header ── */}
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-panel-head px-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-[26px] w-[26px] flex-col justify-center gap-[3px] rounded-md border border-line-strong bg-secondary px-[6px]">
            <span className="h-[3px] w-full rounded-sm bg-amber" />
            <span className="h-[3px] w-[68%] rounded-sm bg-indigo" />
            <span className="h-[3px] w-[42%] rounded-sm bg-teal" />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">티어리스트</span>
        </div>

        {inRoom && room.room && (
          <>
            <span className="h-5 w-px shrink-0 bg-border" />
            <div className="flex min-w-0 items-center">
              {room.room.members.slice(0, 6).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.name}
                  onClick={() => setProfileMemberId(m.id)}
                  className="-ml-1.5 rounded-full ring-2 ring-panel-head transition-transform first:ml-0 hover:z-10 hover:-translate-y-0.5"
                >
                  <Avatar name={m.name} src={m.avatar ?? null} frame={m.frame} size={26} />
                </button>
              ))}
              {room.room.members.length > 6 && (
                <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                  +{room.room.members.length - 6}
                </span>
              )}
            </div>
          </>
        )}

        <div className="flex-1" />

        <Button size="sm" onClick={openAdd}>
          <Plus /> 대상 추가
        </Button>
        <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
          <ListPlus /> 일괄
        </Button>
        {inRoom ? (
          <Button size="sm" variant="outline" onClick={room.leaveRoom}>
            <LogOut /> 나가기
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setMultiOpen(true)}>
            <span
              className={cn(
                "size-2 rounded-full",
                room.status === "online"
                  ? "bg-green-500"
                  : room.status === "connecting"
                    ? "bg-amber-400"
                    : "bg-muted-foreground/40",
              )}
            />
            멀티
          </Button>
        )}
        <Button variant="outline" size="icon-sm" aria-label="초기화" onClick={handleReset}>
          <RotateCcw />
        </Button>
        <ThemeToggle />
        {authUser ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 pl-1.5"
            onClick={() => setAccountOpen(true)}
          >
            <Avatar
              name={authUser.nickname}
              src={authUser.avatar ?? null}
              frame={authUser.frame}
              size={20}
            />
            <span className="max-w-20 truncate">{authUser.nickname}</span>
            {authUser.isAdmin && <RoleBadge role="admin" />}
          </Button>
        ) : (
          room.status === "online" && (
            <Button size="sm" variant="outline" onClick={() => setAuthOpen(true)}>
              <LogIn /> 로그인
            </Button>
          )
        )}
      </header>

      {placeBanned && myPlaceBannedUntil && (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-5 py-1.5 text-center text-xs font-medium text-destructive">
          배치가 약 {Math.ceil((myPlaceBannedUntil - Date.now()) / 60_000)}분 동안 금지되어
          대상을 추가·이동할 수 없어요.
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* Center column: board header + board + draft tray */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Board header */}
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5 px-5 pt-4 pb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                {inRoom && (
                  <span className="flex items-center gap-1.5 rounded border border-live/40 bg-live/10 px-2 py-0.5">
                    <span
                      className="size-1.5 rounded-full bg-live"
                      style={{ animation: "pulseDot 1.5s infinite" }}
                    />
                    <span className="text-[10px] font-extrabold tracking-wider text-live">
                      LIVE
                    </span>
                  </span>
                )}
                <h1 className="truncate text-2xl font-extrabold tracking-tight">
                  {inRoom ? room.room?.title || "멀티 룸" : "티어리스트"}
                </h1>
                {inRoom && room.room && (
                  <button
                    type="button"
                    onClick={copyCode}
                    title="초대 코드 복사"
                    className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 font-mono text-xs font-bold tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    {room.room.id}
                    <Copy className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="font-semibold text-muted-foreground">
                  <b className="text-indigo-fg tabular-nums">{rankedCount}</b> / {totalItems} 배치
                </span>
                <span className="h-1 w-28 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-indigo transition-[width] duration-300"
                    style={{
                      width: `${totalItems ? Math.round((rankedCount / totalItems) * 100) : 0}%`,
                    }}
                  />
                </span>
                <span className="text-xs text-muted-foreground">티어 {state.tiers.length}</span>
                {inRoom && room.room && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3.5" /> {room.room.members.length}
                  </span>
                )}
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
              <span className="text-xs text-indigo-fg tabular-nums">
                {matchedIds.size}개 일치
              </span>
            )}
            <button
              type="button"
              onClick={() => setAlphabetical((v) => !v)}
              title="사전순 보기 (켜면 드래그 잠금)"
              aria-pressed={alphabetical}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
                alphabetical
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowDownAZ className="size-4" /> 사전순
            </button>
          </div>

          {/* Quick-vote strip — simplified mode only */}
          {inRoom &&
            room.activeVote &&
            room.activeVote.phase === "voting" &&
            room.voteOptOut && (
              <div className="px-5 pb-2">
                <QuickVoteBar
                  vote={room.activeVote}
                  myUserId={authUser?.id}
                  onCast={room.castVote}
                />
              </div>
            )}

          {/* Board (scrolls internally) */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            {/* Board — grid so the label column auto-sizes to the widest label */}
            <section className="grid grid-cols-[auto_1fr] gap-px overflow-hidden rounded-[8px] border border-[#1E232D] bg-[#181C24]">
              {state.tiers.map((tier, i) => (
                <TierRow
                  key={tier.id}
                  index={i}
                  tier={tier}
                  items={itemsOf(tier.id)}
                  canDelete={state.tiers.length > 1}
                  matchedIds={matchedIds}
                  votingItemId={
                    room.activeVote?.phase === "voting"
                      ? room.activeVote.itemId
                      : undefined
                  }
                  selectedItemId={menu?.item.id ?? null}
                  dndEnabled={!alphabetical}
                  onEditItem={openEdit}
                  onRemoveItem={controller.removeItem}
                  onSelectItem={(item, rect) => setMenu({ item, rect })}
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
              className="mt-3 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="size-4" /> 티어 추가
            </button>

          </div>

          {/* ── Bottom draft tray (미배치) ── */}
          <div className="shrink-0 border-t border-border bg-panel">
            <div className="flex items-center gap-2.5 px-5 pt-2.5">
              <span className="text-[11px] font-extrabold tracking-wide text-muted-foreground">
                미배치
              </span>
              <span className="rounded bg-indigo/15 px-1.5 text-[11px] font-bold text-indigo-fg tabular-nums">
                {itemsOf(POOL_ID).length}
              </span>
              <div className="relative w-44">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                  ＋
                </span>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) quickAdd();
                  }}
                  placeholder="새 대상 입력 후 Enter"
                  className="h-8 w-full rounded-md border border-border bg-card pr-2 pl-6 text-xs outline-none focus:border-foreground/40"
                />
              </div>
              <div className="flex-1" />
              <span className="hidden text-[11px] text-muted-foreground sm:block">
                티어로 드래그
              </span>
              <button
                type="button"
                onClick={() => setTrayOpen((v) => !v)}
                aria-label="트레이 접기/펼치기"
                className="grid size-7 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
              >
                {trayOpen ? "▾" : "▸"}
              </button>
            </div>
            {trayOpen && (
              <ItemPool
                horizontal
                items={itemsOf(POOL_ID)}
                matchedIds={matchedIds}
                votingItemId={
                  room.activeVote?.phase === "voting"
                    ? room.activeVote.itemId
                    : undefined
                }
                selectedItemId={menu?.item.id ?? null}
                dndEnabled={!alphabetical}
                onEditItem={openEdit}
                onRemoveItem={controller.removeItem}
                onSelectItem={(item, rect) => setMenu({ item, rect })}
              />
            )}
          </div>
        </div>

        {/* ── Right live panel ── */}
        {inRoom && room.room && (
          <aside className="hidden w-[340px] shrink-0 flex-col border-l border-border bg-panel lg:flex">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <span className="text-sm font-extrabold">라이브</span>
              <span className="size-1.5 rounded-full bg-teal" />
              <span className="text-xs text-muted-foreground">{room.room.members.length}명</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => room.setVoteOptOut(!room.voteOptOut)}
                title="투표 간소화 — 켜면 상단 퀵 투표 카드 + 간소화 결과로 표시"
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors",
                  room.voteOptOut
                    ? "border-amber/50 bg-amber/15 text-amber-fg"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {room.voteOptOut ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                간소화 {room.voteOptOut ? "ON" : "OFF"}
              </button>
            </div>

            {/* Pinned retro vote card (participating mode) */}
            {room.activeVote &&
              room.activeVote.phase === "voting" &&
              !room.voteOptOut && (
                <PanelVoteCard
                  vote={room.activeVote}
                  myUserId={authUser?.id}
                  onCast={room.castVote}
                  onAbstain={() => {
                    room.castVote(VOTE_ABSTAIN);
                    setDismissedVoteId(room.activeVote!.id);
                  }}
                />
              )}
            {/* Opt-out notice */}
            {room.activeVote &&
              room.activeVote.phase === "voting" &&
              room.voteOptOut && (
                <div
                  className="font-pixel mx-3 mt-3 rounded-[2px] border-2 border-dashed p-3 text-[12px] leading-relaxed text-[#9A9FAC]"
                  style={{ borderColor: "#2A3142", background: "#11141B" }}
                >
                  투표 간소화 중 — 화면 상단{" "}
                  <b className="text-amber">빠른 투표 카드</b>로 한 표를 던지세요. 던지기 전엔 과반수에 포함되지 않아요.
                </div>
              )}

            <ChangeHistory
              state={state}
              avatarOf={(name) => {
                const m = room.room?.members.find((x) => x.name === name);
                return m ? { src: m.avatar ?? null, frame: m.frame } : undefined;
              }}
            />
            <ChatPanel
              room={room.room}
              hints={room.hints}
              onSend={room.sendChat}
              canModerate={viewerCanModerate}
              onClearChat={() => room.moderate("clearChat")}
              mutedUntil={myMember?.mutedUntil}
              className="min-h-0 flex-1"
            />
          </aside>
        )}
      </div>

      {/* Item detail — left fixed panel */}
      {menu && menuItem && (
        <TierPopover
          item={menuItem}
          anchor={menu.rect}
          tiers={state.tiers}
          currentTierId={menuTierId && menuTierId !== POOL_ID ? menuTierId : null}
          onMove={(tierId) => {
            controller.moveItem(
              menuItem.id,
              tierId,
              (state.placement[tierId] ?? []).length,
            );
            setMenu(null);
          }}
          onPool={() => {
            controller.moveItem(
              menuItem.id,
              POOL_ID,
              (state.placement[POOL_ID] ?? []).length,
            );
            setMenu(null);
          }}
          onStartVote={
            inRoom
              ? () => {
                  setVoteStartItem(menuItem);
                  setMenu(null);
                }
              : undefined
          }
          onEdit={() => {
            openEdit(menuItem);
            setMenu(null);
          }}
          onRemove={() => {
            if (window.confirm(`'${menuItem.name}'을(를) 삭제할까요?`))
              controller.removeItem(menuItem.id);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {/* Start-vote reason dialog */}
      <StartVoteDialog
        open={voteStartItem !== null}
        onOpenChange={(o) => !o && setVoteStartItem(null)}
        item={voteStartItem}
        currentTier={voteStartTier}
        onStart={(reason, seconds) => {
          if (voteStartItem) room.startVote(voteStartItem.id, reason, seconds);
        }}
      />

      {/* 인정협회 티어 투표 — voting + revote/keep/void results.
          Hidden for opt-out users / after 무효표. The "moved" result is shown
          to everyone as a game-style promotion effect instead (below). */}
      {inRoom &&
        room.activeVote &&
        !room.voteOptOut &&
        room.activeVote.id !== dismissedVoteId &&
        room.activeVote.phase === "result" &&
        room.activeVote.result?.outcome !== "moved" && (
          <VoteOverlay
            vote={room.activeVote}
            myUserId={authUser?.id}
            onCast={room.castVote}
            onAbstain={() => {
              room.castVote(VOTE_ABSTAIN);
              setDismissedVoteId(room.activeVote!.id);
            }}
          />
        )}

      {/* Promotion celebration — game-like effect + sound, shown to everyone. */}
      {inRoom &&
        room.activeVote &&
        room.activeVote.phase === "result" &&
        room.activeVote.result?.outcome === "moved" &&
        room.activeVote.result.toLabel &&
        room.activeVote.result.toColor && (
          <PromotionEffect
            key={room.activeVote.id}
            effectKey={room.activeVote.id}
            itemName={room.activeVote.itemName}
            itemImage={room.activeVote.itemImage}
            toLabel={room.activeVote.result.toLabel}
            toColor={room.activeVote.result.toColor}
            tiers={state.tiers}
            epithet={
              state.tiers.find(
                (t) =>
                  t.label === room.activeVote!.result!.toLabel &&
                  t.color === room.activeVote!.result!.toColor,
              )?.epithet
            }
            contributors={(() => {
              const i = state.tiers.findIndex(
                (t) =>
                  t.label === room.activeVote!.result!.toLabel &&
                  t.color === room.activeVote!.result!.toColor,
              );
              const winId = i >= 0 ? state.tiers[i].id : undefined;
              return winId
                ? (room.activeVote!.tally.find((t) => t.tierId === winId)
                    ?.voters ?? [])
                : [];
            })()}
            compact={room.voteOptOut}
          />
        )}

      {/* Self ban warning frame (game-style red pulsing border) */}
      {inRoom && (
        <BanWarningFrame
          mutedUntil={myMember?.mutedUntil}
          placeBannedUntil={myMember?.placeBannedUntil}
          voteBannedUntil={myMember?.voteBannedUntil}
        />
      )}

      {/* Moderation broadcast — center-top game effect shown to everyone */}
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

      {/* Admin attack hit effect — every item flies; lower tiers bigger/wilder */}
      {room.attack && (
        <AttackEffect
          key={room.attack.at}
          attackKey={room.attack.at}
          by={room.attack.by}
          parryable={room.attack.parryable}
          onParry={() => {
            if (room.attack?.byUserId) room.parryAttack(room.attack.byUserId);
          }}
          onDone={room.clearAttack}
          items={(() => {
            const n = state.tiers.length;
            const tierIndex = new Map(state.tiers.map((t, i) => [t.id, i] as const));
            const listOf = new Map<string, string>();
            for (const [lid, ids] of Object.entries(state.placement))
              for (const id of ids) listOf.set(id, lid);
            return Object.values(state.items).map((it) => {
              const lid = listOf.get(it.id);
              const weight =
                lid && tierIndex.has(lid)
                  ? n > 1
                    ? tierIndex.get(lid)! / (n - 1)
                    : 0.2
                  : 0.45; // pool / unplaced
              return { src: it.imageUrl, name: it.name, weight };
            });
          })()}
        />
      )}

      <ItemFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSave={handleSave}
        existingItems={Object.values(state.items)}
        onReplace={(id, name, imageUrl) =>
          controller.updateItem(id, { name, imageUrl })
        }
        onRemove={controller.removeItem}
      />

      <BulkAddDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onAdd={controller.addItems}
        existingItems={Object.values(state.items)}
      />

      <MultiplayerDialog
        open={multiOpen}
        onOpenChange={setMultiOpen}
        status={room.status}
        error={room.error}
        authUser={authUser}
        roomList={room.roomList}
        onCreate={room.createRoom}
        onJoin={room.joinRoom}
        onList={room.listRooms}
        onRename={room.renameRoom}
        onDelete={room.deleteRoom}
        onRequireLogin={() => {
          setMultiOpen(false);
          setAuthOpen(true);
        }}
        onManageAccount={() => {
          setMultiOpen(false);
          setAccountOpen(true);
        }}
        clearError={room.clearError}
      />

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onLogin={room.login}
        onRegister={room.register}
      />

      {authUser && (
        <AccountDialog
          open={accountOpen}
          onOpenChange={setAccountOpen}
          user={authUser}
          onUpdate={room.updateProfile}
          onLogout={room.logout}
          onRedeem={room.redeemCode}
          onEquip={room.equipPerk}
          onFetchCodes={room.fetchCodes}
          onIssueCode={room.issueCode}
        />
      )}

      <UserProfileOverlay
        open={profileView !== null}
        onOpenChange={(o) => !o && setProfileMemberId(null)}
        profile={profileView}
        canModerate={canModerateTarget}
        onModerate={(action, seconds) =>
          room.moderate(action, profileMember?.userId, seconds)
        }
        canGrantAdmin={canGrantAdmin}
        onGrantAdmin={(makeAdmin) => {
          if (profileMember?.userId) room.grantAdmin(profileMember.userId, makeAdmin);
        }}
        canAttack={canAttackTarget}
      />
    </div>
  );
}
