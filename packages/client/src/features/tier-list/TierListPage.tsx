import { useCallback, useEffect, useRef, useState } from "react";
import { useMatch, useNavigate, useParams } from "react-router-dom";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  ArrowDownAZ,
  Blocks,
  Bot,
  ChevronDown,
  ChevronUp,
  Gamepad2,
  Heart,
  LogOut,
  Palette,
  Plus,
  RotateCcw,
  Search as SearchIcon,
  Shield,
  Target,
  Trophy,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import { POOL_ID, TIER_COLORS } from "@tier-list/shared";
import type { DuelGameMode, Item, Member } from "@tier-list/shared";
import { checkDuplicate, findSimilarItems, SIM_WARN, type SimilarItem } from "@/lib/similarity";
import { ARCADE, PIXEL } from "./duelChrome";
import { isCardData, isListData } from "./dnd";
import { AccountDialog } from "./AccountDialog";
import { AttackEffect, type AttackItem } from "./AttackEffect";
import { ComboRushEffect } from "./ComboRushEffect";
import { TetrisGame } from "./TetrisGame";
import { createTetrisBot, BOT_LABEL, type BotDifficulty, type TetrisBot } from "./tetrisBot";
import { AuthDialog } from "./AuthDialog";
import { Avatar } from "./Avatar";
import { BanWarningFrame } from "./BanWarningFrame";
import { BulkAddDialog } from "./BulkAddDialog";
import { ImageSearchPanel } from "./ImageSearchPanel";
import { HintToast } from "./HintToast";
import { ItemFormDialog } from "./ItemFormDialog";
import { ItemPool } from "./ItemPool";
import { LivePanel } from "./LivePanel";
import { MemberOverlay } from "./MemberOverlay";
import { MiniResult } from "./MiniResult";
import { PresenceAvatar } from "./PresenceAvatar";
import { ModerationEffect } from "./ModerationEffect";
import { PromotionEffect } from "./PromotionEffect";
import { RoomDialog } from "./RoomDialog";
import { StartVoteDialog } from "./StartVoteDialog";
import { TierPopover } from "./TierPopover";
import { TierRow } from "./TierRow";
import { useRoom } from "./useRoom";
import { useLocalTierList } from "./useTierList";

/** Hue-initials fallback color for an item with no image. */
function swatch(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360},40%,46%)`;
}

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
  const [quickSearch, setQuickSearch] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ item: Item; anchor: DOMRect } | null>(null);
  const [form, setForm] = useState<{ item?: Item } | null>(null);
  const [bulk, setBulk] = useState(false);
  const [auth, setAuth] = useState(false);
  const [voteFor, setVoteFor] = useState<Item | null>(null);
  const [acct, setAcct] = useState(false);
  const [account, setAccount] = useState(false);
  // Admin solo practice: an imaginary opponent that always escalates, so the
  // difficulty climbs by 1 every successful parry until you miss.
  const [solo, setSolo] = useState<{ mode: DuelGameMode; level: number; key: number; seconds?: number } | null>(null);
  const [soloEnd, setSoloEnd] = useState<{ mode: DuelGameMode; level: number } | null>(null);
  // 봇 대전 (client-side Tetris AI opponent).
  const [bot, setBot] = useState<{ difficulty: BotDifficulty; seconds: number; key: number } | null>(null);
  const [botSeconds, setBotSeconds] = useState(180);
  const [botResult, setBotResult] = useState<"win" | "lose" | null>(null);
  const botRef = useRef<TetrisBot | null>(null);
  const botDeltaRef = useRef(0);
  const botGarbageRef = useRef(0);
  const [soloNote, setSoloNote] = useState<{ Icon: LucideIcon; title: string; sub: string; color: string } | null>(null);
  const soloParried = useRef(false);
  const soloLives = useRef(0); // 목숨(life): 미스를 버틸 수 있는 횟수
  const soloAbsorb = useRef(0); // 방어(bulwark): 난이도 상승을 흡수하는 횟수
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A skill fired (방어 흡수 / 목숨 부활): pause the loop, show a telegraph, then
  // resume the same level — so the player actually registers what happened.
  const soloTelegraph = (note: { Icon: LucideIcon; title: string; sub: string; color: string }, mode: DuelGameMode, level: number) => {
    setSolo(null);
    setSoloNote(note);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      setSoloNote(null);
      setSolo({ mode, level, key: Date.now() });
    }, 1050);
  };
  const startSolo = (mode: DuelGameMode, seconds = 60) => {
    // 내 장착 전투 스킬을 솔로 연습에도 반영(half는 renderDuel의 perStack로 적용됨).
    const buff = room.authUser?.combatBuff;
    soloParried.current = false;
    soloLives.current = buff === "life" ? 1 : 0;
    soloAbsorb.current = buff === "bulwark" ? 1 : 0;
    setSoloNote(null);
    setSoloEnd(null);
    setSolo({ mode, level: 0, key: Date.now(), seconds });
  };
  const [memberView, setMemberView] = useState<Member | null>(null);
  const [attackCd, setAttackCd] = useState<Record<string, number>>({});
  const [promo, setPromo] = useState<{
    itemName: string;
    tier: { label: string; color: string; epithet: string };
    kind: "up" | "down" | "keep";
  } | null>(null);
  const promoKeyRef = useRef<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // --- REST-style routing (URL ⇄ realtime room) -----------------------------
  // The path is the source of truth for which room we're in:
  //   /              → solo board   /rooms → lobby   /rooms/:roomId → that room
  const navigate = useNavigate();
  const { roomId: routeRoomId } = useParams();
  const lobby = !!useMatch("/rooms");
  const targetRoom = routeRoomId ? routeRoomId.toUpperCase() : null;
  const joinedId = room.room?.id ?? null;
  const { authUser, error: roomError, joinRoom, leaveRoom, clearError } = room;
  // Tracks the room we last asked to join, so a failed/ejected join can bounce
  // home exactly once instead of re-attempting every render.
  const requestedRef = useRef<string | null>(null);

  // URL → realtime: join the room named in the path, or leave when it's gone.
  // Only the solo "/" route forces a leave — at "/rooms" (lobby) we may be mid-
  // create, where joinedId is about to be set and Effect B redirects to it.
  useEffect(() => {
    if (targetRoom) {
      if (!authUser) return; // anon visitor on a share link — auth prompt below
      if (joinedId !== targetRoom && requestedRef.current !== targetRoom) {
        requestedRef.current = targetRoom;
        clearError();
        joinRoom(targetRoom);
      }
    } else if (!lobby) {
      requestedRef.current = null;
      if (joinedId) leaveRoom();
    }
  }, [targetRoom, lobby, authUser, joinedId, joinRoom, leaveRoom, clearError]);

  // realtime → URL: reflect the joined room (e.g. right after creating one).
  useEffect(() => {
    if (joinedId && targetRoom !== joinedId) navigate(`/rooms/${joinedId}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedId]);

  // Ejected (kicked/closed) or a failed join → return to the solo board.
  useEffect(() => {
    if (targetRoom && !joinedId && roomError && requestedRef.current === targetRoom) {
      requestedRef.current = null;
      navigate("/", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomError, joinedId]);

  // Anon visitor opened a /rooms or /rooms/:id link → prompt login.
  useEffect(() => {
    if ((lobby || targetRoom) && !authUser) setAuth(true);
  }, [lobby, targetRoom, authUser]);

  // Browser tab title tracks the active room.
  useEffect(() => {
    document.title = room.room?.title
      ? `${room.room.title} · 티어리스트`
      : "티어리스트 — 실시간 티어 정하기";
  }, [room.room?.title]);

  // Won a duel (opponent missed): drop the waiting screen, show YOU WIN briefly.
  const { duelWin, clearAttack, clearDuelWin } = room;
  useEffect(() => {
    if (!duelWin) return;
    clearAttack();
    const t = setTimeout(clearDuelWin, 2800);
    return () => clearTimeout(t);
  }, [duelWin, clearAttack, clearDuelWin]);

  // --- 테트리스 대전 (multiplayer): stable callbacks so the Phaser game is not
  // torn down on unrelated re-renders. The opponent board + clock come from refs
  // the useRoom socket listeners keep fresh; onGameOver reports my loss.
  const [tetrisLost, setTetrisLost] = useState(false);
  const tetrisAt = room.tetris?.at;
  const tetrisBy = room.tetris?.by;
  // 결정전 Tetris: no local DEFEAT overlay — the DecisionCard + server tetris:done
  // drive elimination/revive/rematch, so we just report the loss and wait.
  const tetrisDecision = !!room.tetris?.decision;
  useEffect(() => {
    if (tetrisAt) setTetrisLost(false);
  }, [tetrisAt]);
  const { tetrisOppRef, tetrisClear, tetrisBoard, tetrisDead } = room;
  const tetrisGetOpp = useCallback(() => {
    const o = tetrisOppRef.current;
    return o ? { grid: o.grid, seconds: o.seconds, name: tetrisBy ?? "상대" } : null;
  }, [tetrisOppRef, tetrisBy]);
  const tetrisOnClear = useCallback((lines: number, garbage: number) => tetrisClear(lines, garbage), [tetrisClear]);
  const tetrisOnBoard = useCallback((grid: number[][], seconds: number) => tetrisBoard(grid, seconds), [tetrisBoard]);
  const tetrisOnGameOver = useCallback(() => {
    tetrisDead();
    if (!tetrisDecision) setTetrisLost(true);
  }, [tetrisDead, tetrisDecision]);

  // 봇 대전 lifecycle: spin up the AI opponent for a battle, tear it down after.
  useEffect(() => {
    if (!bot) return;
    botDeltaRef.current = 0;
    botGarbageRef.current = 0;
    const b = createTetrisBot({
      seconds: bot.seconds,
      difficulty: bot.difficulty,
      onClear: (lines, garbage) => {
        botDeltaRef.current -= 2 * lines; // bot's clears drain my clock
        botGarbageRef.current += garbage; // + stack garbage on me
      },
      onDead: () => setBotResult("win"), // bot topped out / ran out → I win
    });
    botRef.current = b;
    b.start();
    return () => {
      b.stop();
      botRef.current = null;
    };
  }, [bot]);
  const botGetOpp = useCallback(() => {
    const b = botRef.current;
    if (!b || !bot) return null;
    const bd = b.getBoard();
    return { grid: bd.grid, seconds: bd.seconds, name: BOT_LABEL[bot.difficulty] };
  }, [bot]);
  const botOnClear = useCallback((lines: number, garbage: number) => botRef.current?.receive(lines, garbage), []);
  const botOnGameOver = useCallback(() => {
    botRef.current?.stop();
    setBotResult("lose");
  }, []);
  const closeBot = () => {
    botRef.current?.stop();
    setBot(null);
    setBotResult(null);
  };

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

  // Duplicate-name gate with a real UI: exact/near-dup → block (shows what it
  // matches); similar → ask, showing the similar items, before proceeding.
  const [dup, setDup] = useState<{ name: string; verdict: "warn" | "block"; matches: SimilarItem[]; onAdd: () => void } | null>(null);
  function withDupCheck(name: string, proceed: () => void) {
    const items = Object.values(state.items);
    const v = checkDuplicate(name, items);
    if (v.kind === "ok") {
      proceed();
      return;
    }
    setDup({ name, verdict: v.kind, matches: findSimilarItems(name, items, SIM_WARN).slice(0, 4), onAdd: proceed });
  }

  function quickAdd() {
    const n = draftName.trim();
    if (!n) return;
    withDupCheck(n, () => {
      setDraftName("");
      setQuickSearch(n); // open the image picker for this name
    });
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

  const locks = room.room?.locks ?? {};

  const total = Object.keys(state.items).length;
  const ranked = total - itemsOf(POOL_ID).length;

  // Render the right parry mini-game for a duel exchange (real or solo practice).
  const renderDuel = (o: {
    mode?: DuelGameMode;
    keyId: number;
    by: string;
    parryable: boolean;
    level?: number;
    quick?: boolean;
    calm?: boolean;
    wait?: boolean;
    onParry: (escalate: boolean) => void;
    onHit: () => void;
    onDone: () => void;
    onSurrender?: () => void;
  }) => {
    const perStack = room.authUser?.combatBuff === "half" ? 0.05 : 0.1;
    return o.mode === "combo" ? (
      <ComboRushEffect
        key={o.keyId}
        attackKey={o.keyId}
        by={o.by}
        parryable={o.parryable}
        level={o.level}
        perStack={perStack}
        quick={o.quick}
        calm={o.calm}
        wait={o.wait}
        items={attackItems()}
        onParry={o.onParry}
        onHit={o.onHit}
        onDone={o.onDone}
        onSurrender={o.onSurrender}
      />
    ) : (
      <AttackEffect
        key={o.keyId}
        attackKey={o.keyId}
        by={o.by}
        parryable={o.parryable}
        level={o.level}
        perStack={perStack}
        quick={o.quick}
        calm={o.calm}
        wait={o.wait}
        items={attackItems()}
        onParry={o.onParry}
        onHit={o.onHit}
        onDone={o.onDone}
        onSurrender={o.onSurrender}
      />
    );
  };

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
              onClick={() => navigate("/")}
              className="flex h-[34px] items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-bold text-foreground"
            >
              <LogOut className="size-4" /> 나가기
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/rooms")}
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
                  <div className="my-1 border-t border-border" />
                  <div className="px-3 pt-0.5 pb-1 text-[10px] font-bold tracking-wide text-muted-foreground">혼자 연습</div>
                  <button
                    type="button"
                    onClick={() => {
                      setAcct(false);
                      startSolo("timing");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-accent"
                  >
                    <Target className="size-4" /> 타이밍 연습
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAcct(false);
                      startSolo("combo");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-accent"
                  >
                    <Gamepad2 className="size-4" /> 콤보 연습
                  </button>
                  <div className="px-3 pt-1.5 pb-1 flex items-center gap-2 text-[13px] text-foreground">
                    <Blocks className="size-4" /> 테트리스 연습
                  </div>
                  <div className="flex gap-1.5 px-3 pb-1.5">
                    {([
                      { s: 60, name: "1분" },
                      { s: 180, name: "3분" },
                      { s: 300, name: "5분" },
                    ] as const).map((d) => (
                      <button
                        key={d.s}
                        type="button"
                        onClick={() => {
                          setAcct(false);
                          startSolo("tetris", d.s);
                        }}
                        className="flex-1 rounded-[6px] border border-border px-2 py-1.5 text-[12px] font-bold text-foreground hover:bg-accent"
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                  <div className="px-3 pt-1.5 pb-1 flex items-center gap-2 text-[13px] text-foreground">
                    <Bot className="size-4" /> 테트리스 봇 대전
                  </div>
                  <div className="flex gap-1.5 px-3 pb-1">
                    {([
                      { s: 60, name: "1분" },
                      { s: 180, name: "3분" },
                      { s: 300, name: "5분" },
                    ] as const).map((d) => (
                      <button
                        key={d.s}
                        type="button"
                        onClick={() => setBotSeconds(d.s)}
                        className={`flex-1 rounded-[6px] border px-2 py-1 text-[11px] font-bold ${botSeconds === d.s ? "" : "border-border text-foreground hover:bg-accent"}`}
                        style={botSeconds === d.s ? { borderColor: "#6366F1", background: "rgba(99,102,241,.14)", color: "#A5B4FC" } : undefined}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5 px-3 pb-1.5">
                    {([
                      { d: "easy", name: "쉬움" },
                      { d: "normal", name: "보통" },
                      { d: "hard", name: "어려움" },
                    ] as const).map((b) => (
                      <button
                        key={b.d}
                        type="button"
                        onClick={() => {
                          setAcct(false);
                          setBotResult(null);
                          setBot({ difficulty: b.d, seconds: botSeconds, key: Date.now() });
                        }}
                        className="flex-1 rounded-[6px] border border-border px-2 py-1.5 text-[12px] font-bold text-foreground hover:bg-accent"
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                  <div className="my-1 border-t border-border" />
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
              title="클릭하면 투표 참여/미참여를 전환합니다. 미참여 시 투표에 표를 던질 수 없고 현황만 표시됩니다."
              className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-bold"
              style={
                room.voteOptOut
                  ? { borderColor: "rgba(245,182,66,.5)", background: "rgba(245,182,66,.14)", color: "#F5B942" }
                  : { borderColor: "rgba(34,197,94,.45)", background: "rgba(34,197,94,.12)", color: "#4ADE80" }
              }
            >
              <span className="size-[7px] rounded-full" style={{ background: room.voteOptOut ? "#F5B942" : "#22C55E" }} />
              {room.voteOptOut ? "투표 미참여" : "투표 참여"}
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
                locks={locks}
                coupang={room.room?.coupang}
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
            coupang={room.room?.coupang}
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
           activeDecision={room.activeDecision}
           myUserId={room.authUser?.id}
           onDecisionJoin={room.joinDecision}
           onDecisionLeave={room.leaveDecision}
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
          coupang={room.room?.coupang}
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
          onProposeDecision={
            room.room
              ? (tierId, mode, seconds) => {
                  room.proposeDecision(menu.item.id, tierId, mode, seconds);
                  setMenu(null);
                }
              : undefined
          }
          lock={
            room.room?.locks?.[menu.item.id]
              ? {
                  tierLabel: room.room.locks[menu.item.id].label,
                  until: room.room.locks[menu.item.id].until,
                  reason: room.room.locks[menu.item.id].reason,
                }
              : undefined
          }
          onLock={
            canModerate && room.room && !room.room.locks?.[menu.item.id]
              ? (seconds) => {
                  room.lockTier(menu.item.id, seconds);
                  setMenu(null);
                }
              : undefined
          }
          onUnlock={
            canModerate && room.room?.locks?.[menu.item.id]
              ? () => {
                  room.unlockTier(menu.item.id);
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
            if (form.item) {
              controller.updateItem(form.item.id, { name, imageUrl });
              setForm(null);
            } else {
              withDupCheck(name, () => {
                controller.addItem(name, imageUrl);
                setForm(null);
              });
            }
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
          existing={Object.values(state.items)}
          onSubmit={(entries) => {
            controller.addItems(entries);
            setBulk(false);
          }}
          onClose={() => setBulk(false)}
        />
      )}

      {dup && (
        <>
          <div className="fixed inset-0 z-[84] bg-black/60" onClick={() => setDup(null)} />
          <div
            className="fixed top-1/2 left-1/2 z-[85] w-[380px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-[#242a3a] bg-[#13161D] p-5"
            style={{ boxShadow: "0 24px 64px rgba(0,0,0,.6)", animation: "popIn .16s ease both" }}
          >
            <div className="mb-1 text-[15px] font-extrabold text-[#EDEAE2]">
              {dup.verdict === "block" ? "이미 있는 항목이에요" : "비슷한 항목이 있어요"}
            </div>
            <div className="mb-3 text-[12px] text-[#8A8F9C]">
              <b className="text-[#C4C8D2]">{dup.name}</b>
              {dup.verdict === "block" ? " 은(는) 아래와 겹쳐 추가할 수 없어요." : " 와(과) 비슷한 항목:"}
            </div>
            <div className="mb-4 flex flex-col gap-1.5">
              {dup.matches.map((m) => (
                <div key={m.item.id} className="flex items-center gap-2.5 rounded-[7px] border border-[#242a3a] bg-[#0E1117] px-2.5 py-1.5">
                  <div className="size-10 shrink-0 overflow-hidden rounded-[5px] border border-[#2A303C]">
                    {m.item.imageUrl ? (
                      <img src={m.item.imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="grid size-full place-items-center text-[12px] font-extrabold text-white" style={{ background: swatch(m.item.name) }}>
                        {m.item.name.slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-[#EDEAE2]">{m.item.name}</div>
                    <div className="text-[11px] text-[#8A8F9C]">유사도 {Math.round(m.score * 100)}%</div>
                  </div>
                </div>
              ))}
            </div>
            {dup.verdict === "block" ? (
              <button
                type="button"
                onClick={() => setDup(null)}
                className="h-10 w-full rounded-[6px] bg-[#6366F1] text-[13px] font-bold text-white"
              >
                확인
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDup(null)}
                  className="h-10 flex-1 rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[13px] font-semibold text-[#C4C8D2]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dup.onAdd();
                    setDup(null);
                  }}
                  className="h-10 flex-1 rounded-[6px] bg-[#6366F1] text-[13px] font-bold text-white"
                >
                  그래도 추가
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {quickSearch && (
        <ImageSearchPanel
          initialQuery={quickSearch}
          onSelect={(url) => {
            controller.addItem(quickSearch, url);
            setQuickSearch(null);
          }}
          onClose={() => {
            controller.addItem(quickSearch, null);
            setQuickSearch(null);
          }}
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

      {memberView && room.room && room.authUser && (() => {
        // 연습 결투는 로그인한 모든 참가자가 서로 신청할 수 있다 (권한 제한 없음).
        const canAttack = true;
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
            onModerate={(action, seconds, mode) => {
              room.moderate(action, memberView.userId, seconds, mode);
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

      {room.attack &&
        renderDuel({
          mode: room.attack.mode,
          keyId: room.attack.at,
          by: room.attack.by,
          parryable: room.attack.parryable,
          level: room.attack.level,
          // Practice 1:1 → wait for the opponent's reflect. Decision matches run
          // their own bracket flow (DecisionCard), so they clear fast instead.
          wait: !room.attack.decision,
          // No red strobe anywhere — every duel (practice + 결정전) uses the calm
          // CRT backdrop.
          calm: true,
          onParry: (escalate) => room.attack?.byUserId && room.parryAttack(room.attack.byUserId, escalate),
          onHit: () => room.attack?.byUserId && room.rallyHit(room.attack.byUserId),
          onDone: room.clearAttack,
          // 항복: concede → I take the hit (opponent wins), then close the overlay.
          onSurrender: () => {
            if (room.attack?.byUserId) room.rallyHit(room.attack.byUserId);
            room.clearAttack();
          },
        })}

      {/* Solo practice — Tetris is a standalone time-attack; parry games loop. */}
      {solo && solo.mode === "tetris" && (
        <TetrisGame
          key={solo.key}
          by={room.authUser?.nickname ?? "연습"}
          startSeconds={solo.seconds ?? 60}
          lives={room.authUser?.combatBuff === "life" ? 1 : 0}
          onGameOver={() => {}}
          onSurrender={() => setSolo(null)}
          onClose={() => setSolo(null)}
        />
      )}

      {/* 봇 대전 — client-side Tetris AI opponent (same board/UI as multiplayer). */}
      {bot && !botResult && (
        <TetrisGame
          key={bot.key}
          by={room.authUser?.nickname ?? "나"}
          startSeconds={bot.seconds}
          getOpponent={botGetOpp}
          deltaRef={botDeltaRef}
          garbageRef={botGarbageRef}
          lives={room.authUser?.combatBuff === "life" ? 1 : 0}
          onClear={botOnClear}
          onGameOver={botOnGameOver}
          onSurrender={botOnGameOver}
          onClose={closeBot}
        />
      )}
      {bot && botResult && (
        <div className="fixed inset-0 z-[216] grid place-items-center bg-black/75 select-none" onClick={closeBot}>
          <div className="flex flex-col items-center gap-3" style={{ animation: "slam .5s steps(4) both" }}>
            {botResult === "win" ? (
              <>
                <Trophy className="size-14" style={{ color: "#FDE047", filter: "drop-shadow(4px 4px 0 #000)" }} strokeWidth={2.4} />
                <div style={{ fontFamily: ARCADE, fontSize: 40, color: "#FDE047", textShadow: "5px 5px 0 #000, 0 0 24px rgba(253,224,71,.8)" }}>YOU WIN!</div>
                <div style={{ fontFamily: PIXEL, fontSize: 14, fontWeight: 700, color: "#fff", textShadow: "2px 2px 0 #000" }}>{BOT_LABEL[bot.difficulty]} 격파!</div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: ARCADE, fontSize: 38, color: "#F87171", textShadow: "5px 5px 0 #000" }}>DEFEAT</div>
                <div style={{ fontFamily: PIXEL, fontSize: 14, fontWeight: 700, color: "#FFD0C8", textShadow: "2px 2px 0 #000" }}>{BOT_LABEL[bot.difficulty]}에게 패배…</div>
              </>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); closeBot(); }} style={{ marginTop: 6, fontFamily: ARCADE, fontSize: 13, color: "#06121A", background: "#22D3EE", border: "3px solid #000", boxShadow: "3px 3px 0 #000", padding: "10px 18px", cursor: "pointer" }}>
              EXIT
            </button>
          </div>
        </div>
      )}

      {/* Parry solo practice — opponent always escalates: parry → level+1, miss → end. */}
      {solo &&
        solo.mode !== "tetris" &&
        renderDuel({
          mode: solo.mode,
          keyId: solo.key,
          by: "난이도 봇 (무조건 상승)",
          parryable: true,
          level: solo.level,
          quick: true,
          calm: true,
          onParry: () => {
            soloParried.current = true;
          },
          onHit: () => {
            soloParried.current = false;
          },
          onDone: () => {
            const cur = solo;
            if (soloParried.current) {
              soloParried.current = false;
              if (soloAbsorb.current > 0 && cur) {
                soloAbsorb.current -= 1;
                soloTelegraph({ Icon: Shield, title: "GUARD", sub: "방어 발동 — 난이도 유지", color: "#67E8F9" }, cur.mode, cur.level);
              } else {
                setSolo((s) => (s ? { ...s, level: s.level + 1, key: s.key + 1 } : null)); // 빠르게 다음 난이도
              }
            } else if (soloLives.current > 0 && cur) {
              soloLives.current -= 1;
              soloTelegraph({ Icon: Heart, title: "REVIVE", sub: "목숨 1 소모 — 부활", color: "#FF6B8A" }, cur.mode, cur.level);
            } else {
              setSoloEnd(cur ? { mode: cur.mode, level: cur.level } : null);
              setSolo(null);
            }
          },
          // 항복: end the practice run at the current level.
          onSurrender: () => {
            setSoloEnd(solo ? { mode: solo.mode, level: solo.level } : null);
            setSolo(null);
          },
        })}

      {/* 테트리스 대전 (multiplayer): both play at once; opponent shown at half size. */}
      {room.tetris && !tetrisLost && (
        <TetrisGame
          key={room.tetris.at}
          by={room.authUser?.nickname ?? "나"}
          startSeconds={room.tetris.seconds}
          getOpponent={tetrisGetOpp}
          deltaRef={room.tetrisDeltaRef}
          garbageRef={room.tetrisGarbageRef}
          startGarbage={room.tetris.startGarbage ?? 0}
          lives={room.tetris.lives ?? 0}
          onClear={tetrisOnClear}
          onBoard={tetrisOnBoard}
          onGameOver={tetrisOnGameOver}
          onSurrender={tetrisOnGameOver}
          onClose={() => {
            room.clearTetris();
            setTetrisLost(false);
          }}
        />
      )}

      {/* 테트리스 승리 통보 */}
      {room.tetrisWin && (
        <div className="fixed inset-0 z-[216] grid place-items-center bg-black/75 select-none" onClick={() => room.clearTetrisWin()}>
          <div className="flex flex-col items-center gap-3" style={{ animation: "slam .5s steps(4) both" }}>
            <Trophy className="size-14" style={{ color: "#FDE047", filter: "drop-shadow(4px 4px 0 #000)" }} strokeWidth={2.4} />
            <div style={{ fontFamily: ARCADE, fontSize: 40, color: "#FDE047", textShadow: "5px 5px 0 #000, 0 0 24px rgba(253,224,71,.8)" }}>YOU WIN!</div>
            <div style={{ fontFamily: PIXEL, fontSize: 15, fontWeight: 700, color: "#fff", textShadow: "2px 2px 0 #000" }}>{room.tetrisWin.by}에게 승리!</div>
            <div style={{ fontFamily: PIXEL, fontSize: 12, color: "#9AD8E8" }}>테트리스 대전</div>
          </div>
        </div>
      )}

      {/* 테트리스 패배 */}
      {tetrisLost && (
        <div
          className="fixed inset-0 z-[216] grid place-items-center bg-black/75 select-none"
          onClick={() => {
            setTetrisLost(false);
            room.clearTetris();
          }}
        >
          <div className="flex flex-col items-center gap-3" style={{ animation: "slam .5s steps(4) both" }}>
            <div style={{ fontFamily: ARCADE, fontSize: 38, color: "#F87171", textShadow: "5px 5px 0 #000" }}>DEFEAT</div>
            <div style={{ fontFamily: PIXEL, fontSize: 14, fontWeight: 700, color: "#FFD0C8", textShadow: "2px 2px 0 #000" }}>{tetrisBy ?? "상대"}에게 패배…</div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTetrisLost(false);
                room.clearTetris();
              }}
              style={{ marginTop: 6, fontFamily: ARCADE, fontSize: 13, color: "#06121A", background: "#22D3EE", border: "3px solid #000", boxShadow: "3px 3px 0 #000", padding: "10px 18px", cursor: "pointer" }}
            >
              EXIT
            </button>
          </div>
        </div>
      )}

      {room.duelWin && (
        <div className="fixed inset-0 z-[215] grid place-items-center bg-black/70 select-none" onClick={() => room.clearDuelWin()}>
          <div className="flex flex-col items-center gap-3" style={{ animation: "slam .5s steps(4) both" }}>
            <Trophy className="size-14" style={{ color: "#FDE047", filter: "drop-shadow(4px 4px 0 #000)" }} strokeWidth={2.4} />
            <div style={{ fontFamily: ARCADE, fontSize: 40, color: "#FDE047", textShadow: "5px 5px 0 #000, 0 0 24px rgba(253,224,71,.8)" }}>YOU WIN!</div>
            <div style={{ fontFamily: PIXEL, fontSize: 15, fontWeight: 700, color: "#fff", textShadow: "2px 2px 0 #000" }}>{room.duelWin.by}에게 승리!</div>
          </div>
        </div>
      )}

      {soloNote && (
        <div className="pointer-events-none fixed inset-0 z-[210] grid place-items-center select-none">
          <div className="flex flex-col items-center gap-2.5" style={{ animation: "slam .4s steps(4) both" }}>
            <div
              className="grid size-[78px] place-items-center"
              style={{ background: "#0E1117", border: `4px solid ${soloNote.color}`, boxShadow: `5px 5px 0 #000, 0 0 24px ${soloNote.color}` }}
            >
              <soloNote.Icon className="size-9" style={{ color: soloNote.color }} strokeWidth={2.5} fill={soloNote.color} fillOpacity={0.18} />
            </div>
            <div style={{ fontFamily: ARCADE, fontSize: 20, color: soloNote.color, textShadow: `4px 4px 0 #000, 0 0 16px ${soloNote.color}` }}>{soloNote.title}</div>
            <div style={{ fontFamily: PIXEL, fontSize: 12, fontWeight: 700, color: "#fff", textShadow: "2px 2px 0 #000" }}>{soloNote.sub}</div>
          </div>
        </div>
      )}

      {soloEnd && (
        <div
          className="fixed inset-0 z-[205] flex items-center justify-center bg-black/75"
          onClick={() => setSoloEnd(null)}
        >
          <div
            className="px-9 py-7 text-center"
            style={{ background: "#0E1117", border: "4px solid #6366F1", boxShadow: "6px 6px 0 #000, 0 0 28px rgba(99,102,241,.5)", animation: "slam .4s steps(4) both" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontFamily: PIXEL, fontSize: 12, fontWeight: 700, color: "#9AD8E8", textShadow: "1px 1px 0 #000" }}>
              {soloEnd.mode === "combo" ? "COMBO RUSH" : "TIMING"}
            </div>
            <div className="mt-1.5 flex items-baseline justify-center gap-1.5">
              <span style={{ fontFamily: ARCADE, fontSize: 16, color: "#A5B4FC", textShadow: "2px 2px 0 #000" }}>LV.</span>
              <span style={{ fontFamily: ARCADE, fontSize: 40, color: "#fff", textShadow: "4px 4px 0 #000, 0 0 18px rgba(165,180,252,.7)" }}>{soloEnd.level}</span>
            </div>
            <div className="mt-1.5" style={{ fontFamily: PIXEL, fontSize: 12, color: "#FFD0C8", textShadow: "1px 1px 0 #000" }}>여기까지 도달!</div>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => startSolo(soloEnd.mode)}
                style={{ fontFamily: ARCADE, fontSize: 13, color: "#06121A", background: "#22D3EE", border: "3px solid #000", boxShadow: "3px 3px 0 #000", padding: "10px 18px", cursor: "pointer" }}
              >
                RETRY
              </button>
              <button
                type="button"
                onClick={() => setSoloEnd(null)}
                style={{ fontFamily: ARCADE, fontSize: 13, color: "#C4C8D2", background: "#171B22", border: "3px solid #000", boxShadow: "3px 3px 0 #000", padding: "10px 18px", cursor: "pointer" }}
              >
                EXIT
              </button>
            </div>
          </div>
        </div>
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
            duelBannedUntil={me.duelBannedUntil}
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
            navigate(`/rooms/${c.toUpperCase()}`);
          }}
          onCreate={(t, p, img, cp) => {
            room.clearError();
            room.createRoom(t, p, img, cp);
          }}
          onSetImage={room.setRoomImage}
          onSetCoupang={room.setRoomCoupang}
          onClose={() => {
            room.clearError();
            navigate("/");
          }}
        />
      )}
    </div>
  );
}
