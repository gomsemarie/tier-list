import { useEffect, useRef, useState } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { LogOut, Plus, RotateCcw, Search as SearchIcon, UserCog, Users } from "lucide-react";

import { POOL_ID } from "@tier-list/shared";
import type { Item, Member } from "@tier-list/shared";
import { isCardData, isListData } from "./dnd";
import { AccountDialog } from "./AccountDialog";
import { AttackEffect, type AttackItem } from "./AttackEffect";
import { AuthDialog } from "./AuthDialog";
import { BanWarningFrame } from "./BanWarningFrame";
import { BulkAddDialog } from "./BulkAddDialog";
import { ItemFormDialog } from "./ItemFormDialog";
import { ItemPool } from "./ItemPool";
import { LivePanel } from "./LivePanel";
import { MemberOverlay } from "./MemberOverlay";
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
  const [promo, setPromo] = useState<{ itemName: string; tier: { label: string; color: string; epithet: string } } | null>(null);
  const promoKeyRef = useRef<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Close the lobby once we're actually in a room.
  const inRoom = !!room.room;
  useEffect(() => {
    if (inRoom) setLobby(false);
  }, [inRoom]);

  // Show the RANK UP effect once when a vote resolves into an upward move
  // (opt-out members see the compact mini-result via QuickVoteBar instead).
  const activeVote = room.activeVote;
  const voteOptOut = room.voteOptOut;
  const tiers = state.tiers;
  useEffect(() => {
    if (!activeVote || activeVote.phase !== "result") return;
    const r = activeVote.result;
    if (!r || r.outcome !== "moved" || !r.toLabel || voteOptOut) return;
    const key = `${activeVote.id}:${activeVote.round}`;
    if (promoKeyRef.current === key) return;
    const toIndex = tiers.findIndex((t) => t.label === r.toLabel);
    const fromIndex = activeVote.currentTier
      ? tiers.findIndex((t) => t.label === activeVote.currentTier!.label)
      : Infinity;
    if (toIndex === -1 || toIndex >= fromIndex) return; // only upward moves
    promoKeyRef.current = key;
    const t = tiers[toIndex];
    setPromo({ itemName: activeVote.itemName, tier: { label: r.toLabel, color: r.toColor ?? t.color, epithet: t.epithet ?? "" } });
  }, [activeVote, voteOptOut, tiers]);

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
              className="h-[34px] rounded-md border border-border bg-card px-3 text-[13px] font-bold text-foreground"
            >
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
          title="승급 효과 미리보기"
          onClick={() => {
            const t = state.tiers[0];
            const sample = Object.values(state.items)[0]?.name ?? "샘플";
            if (t) setPromo({ itemName: sample, tier: { label: t.label, color: t.color, epithet: t.epithet ?? "" } });
          }}
          className="hidden h-[34px] rounded-md border border-border bg-card px-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground sm:block"
        >
          승급 효과
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
                selectedItemId={menu?.item.id ?? null}
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
           setVoteOptOut={room.setVoteOptOut}
           onCast={room.castVote}
           onSend={room.sendChat}
           onOpenMember={setMemberView}
         />
       )}
      </div>

      {menu && (
        <TierPopover
          item={menu.item}
          anchor={menu.anchor}
          tiers={state.tiers}
          currentTierId={tierOf(menu.item.id)}
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
          onLogout={() => {
            setAccount(false);
            room.logout();
          }}
          onClose={() => setAccount(false)}
        />
      )}

      {room.room && room.voteOptOut && room.activeVote && (
        <QuickVoteBar vote={room.activeVote} onCast={room.castVote} />
      )}

      {memberView && room.room && room.authUser && (() => {
        const me = room.room.members.find((m) => m.userId === room.authUser!.id);
        const myRole = me?.role;
        const canModerate = room.authUser.isAdmin || myRole === "owner" || myRole === "admin";
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
            onModerate={(action, seconds) => {
              room.moderate(action, memberView.userId, seconds);
              if (action === "kick") setMemberView(null);
            }}
            onGrantAdmin={(make) => {
              if (memberView.userId) room.grantAdmin(memberView.userId, make);
            }}
            onClose={() => setMemberView(null)}
          />
        );
      })()}

      {promo && (
        <PromotionEffect
          itemName={promo.itemName}
          tier={promo.tier}
          tiers={state.tiers}
          onDismiss={() => setPromo(null)}
        />
      )}

      {room.attack && (
        <AttackEffect
          key={room.attack.at}
          attackKey={room.attack.at}
          by={room.attack.by}
          parryable={room.attack.parryable}
          items={attackItems()}
          onParry={() => room.attack?.byUserId && room.parryAttack(room.attack.byUserId)}
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
          onCreate={(t, p) => {
            room.clearError();
            room.createRoom(t, p);
          }}
          onClose={() => {
            room.clearError();
            setLobby(false);
          }}
        />
      )}
    </div>
  );
}
