import "./env"; // must run before any module reads process.env
import { createServer } from "node:http";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Server, type Socket } from "socket.io";

import {
  createInitialState,
  helpText,
  tierListReducer,
  type Action,
} from "@tier-list/shared";
import { perkById, rolePriority, VOTE_ABSTAIN, isSpecBuff, isCombatBuff } from "@tier-list/shared";
import type {
  AuthResult,
  AuthUser,
  ChangeEntry,
  ChatKind,
  ChatMessage,
  CodeInfo,
  IssueCodePayload,
  IssueCodeResult,
  Member,
  MemberRole,
  ModeratePayload,
  ProfileUpdate,
  PublicUser,
  RedeemResult,
  RoomSnapshot,
  RoomSummary,
  UpdateResult,
  VoteSnapshot,
  DecisionSnapshot,
  DecisionSide,
  DecisionRole,
  DuelParticipant,
} from "@tier-list/shared";
import type { Item, Tier, TierListState } from "@tier-list/shared";

import {
  createSession,
  createUser,
  deleteSession,
  getSessionUserId,
  getUserById,
  getUserByUsername,
  updateUser,
  type UserRow,
} from "./db";
import { deleteRoom, loadAllRooms, saveRoom } from "./db";
import {
  createCode,
  getCode,
  listCodes,
  markCodeUsed,
  seedCode,
} from "./db";

type Room = {
  id: string;
  title: string;
  ownerId: string;
  createdAt: number;
  /** Public rooms show in the lobby; private rooms are code-join only. */
  isPublic: boolean;
  /** Optional room cover image (data URL); "" when unset. */
  image: string;
  state: TierListState;
  messages: ChatMessage[];
  /** Recent tier moves for the live "변경 이력" panel (in-memory, not persisted). */
  history: ChangeEntry[];
  members: Map<
    string,
    {
      userId: string;
      name: string;
      avatar: string;
      username: string;
      isAdmin: boolean;
      frame: string;
      /** Equipped spectator buff id ("" = none); contributes to a 결정전 team. */
      specBuff: string;
      /** Equipped combat buff id ("" = none); contributes when fighting. */
      combatBuff: string;
    }
  >;
  /** Per-account moderation timers (epoch ms). Not persisted — reset on restart. */
  mutes: Map<string, number>;
  placeBans: Map<string, number>;
  voteBans: Map<string, number>;
  duelBans: Map<string, number>;
  /** Original ban durations (ms), for the client's depleting timer ring. */
  muteDur: Map<string, number>;
  placeBanDur: Map<string, number>;
  voteBanDur: Map<string, number>;
  duelBanDur: Map<string, number>;
  /** In-progress tier vote (ephemeral, not persisted). */
  vote: VoteState | null;
  voteTimer: ReturnType<typeof setTimeout> | null;
  /** Account ids that opted out of votes (no overlay, excluded from counts). */
  voteOptOut: Set<string>;
  /** Active attack/parry rally per user-pair → the chat message id it updates. */
  rallies: Map<string, string>;
  /** In-progress tier decision match (ephemeral, one per room). */
  decision: DecisionState | null;
  decisionTimer: ReturnType<typeof setTimeout> | null;
  /** Items pinned to a tier by a decision match, a vote, or an admin: itemId → lock. */
  tierLocks: Map<string, { tierId: string; until: number; dur: number; reason: "decision" | "vote" | "admin" }>;
  /** Re-propose ban after a defender win: itemId → epoch ms. */
  decisionCooldown: Map<string, number>;
};

type DecisionState = {
  id: string;
  itemId: string;
  targetTierId: string;
  proposerId: string;
  proposerName: string;
  phase: "signup" | "balance" | "duel" | "resolved" | "canceled";
  endsAt: number;
  durationMs: number;
  fromTier: string | null;
  /** userId rosters; a user is in at most one bucket. */
  pro: { fighters: Set<string>; spectators: Set<string> };
  con: { fighters: Set<string>; spectators: Set<string> };
  duel?: {
    /** Active simultaneous matchups. */
    pairs: { proId: string; conId: string; pk: string }[];
    /** Decided matchups (KOs), newest last. */
    results: { winnerId: string; loserId: string; winnerSide: DecisionSide }[];
    /** Recent buff firings for the live effect ticker (capped). */
    feed: { kind: "absorb" | "gamble" | "life"; side: DecisionSide; name: string; amount: number; ts: number }[];
    proAlive: string[];
    conAlive: string[];
    proTotal: number;
    conTotal: number;
    /** Pending difficulty (split-stack of a fallen teammate) applied on next pairing. */
    debt: Map<string, number>;
    /** Pooled buffs (spectator + combat) locked in at duel start. */
    buffs: {
      pro: { bulwark: number; surge: number; gamble: number; life: number };
      con: { bulwark: number; surge: number; gamble: number; life: number };
    };
    /** Remaining 방어 absorb charges per side. */
    bulwarkLeft: { pro: number; con: number };
    /** Remaining 목숨 reserve lives per side. */
    reserveLives: { pro: number; con: number };
  };
  result?: { winner: DecisionSide; outcome: "moved" | "kept"; toTier: string | null; lockUntil?: number };
};

type VoteState = {
  id: string;
  itemId: string;
  options: string[]; // candidate tier ids
  endsAt: number;
  durationMs: number; // per-round length (chosen at open time)
  round: number;
  votes: Map<string, string>; // userId -> tier id
  abstained: Set<string>; // userIds that cast 무효표 (persists across rounds)
  reason: string;
  starter: string;
  fromTier: string | null; // tier id at start, or null if it was unplaced
  phase: "voting" | "result";
  result?: {
    outcome: "moved" | "revote" | "void" | "keep";
    toTier?: string;
    counts: { tierId: string; count: number }[];
    nextOptions?: string[];
  };
};

const DEFAULT_VOTE_SECONDS = 10;
// Tie → re-vote once (round 2). A tie again at round 2 keeps the current tier.
const MAX_VOTE_ROUNDS = 2;
// A vote needs at least this many room members to open.
const VOTE_MIN_MEMBERS = 2;
// A decided vote pins the item for 5min — but only for deliberate (≥30s) votes.
const VOTE_LOCK_MS = 5 * 60 * 1000;
const VOTE_LOCK_MIN_DURATION_MS = 30_000;

/** Clamp the requested vote seconds to a sane range (3–300s). */
function voteDurationMs(seconds: unknown): number {
  const s = Math.floor(Number(seconds));
  return (Number.isFinite(s) && s > 0 ? Math.max(3, Math.min(300, s)) : DEFAULT_VOTE_SECONDS) * 1000;
}

const MAX_AVATAR = 300_000; // cap data-url size

// Attack rate limits (ephemeral). Difficulty only ramps along a parry *relay*.
const ATTACK_COOLDOWN_MS = 5_000; // per (attacker → target) pair
const MAX_PARRY_LEVEL = 50; // effectively uncapped — the rally ends when someone misses
const attackCooldownPair = new Map<string, number>(); // `${roomId}:${attacker}:${target}` -> ts
// Per-person parry difficulty: how many inner-reflects the *opponent* landed on
// this player in the current rally. Keyed `${roomId}:${pairKey}:${victimId}`.
const parryLevel = new Map<string, number>();

// 티어 결정전 (decision match) timings.
const DECISION_SIGNUP_MS = 10_000; // recruit window
const DECISION_BALANCE_MS = 10_000; // equalize-fighters window after signup (configurable)
const DECISION_LOCK_MS = 60 * 60 * 1000; // challenger win → 1h tier lock
const DECISION_CON_COOLDOWN_MS = 60_000; // defender win → 60s re-propose ban
const DUEL_BAN_ON_LOSS_MS = 10_000; // KO'd fighter can't duel again for 10s
const DECISION_RESULT_HOLD_MS = 6_000; // result card shown this long before clearing

// --- Password hashing (Node crypto scrypt — no external deps) ----------------
function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password: string, salt: string, hash: string): boolean {
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
}
function parseUnlocked(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname || row.username,
    avatar: row.avatar || undefined,
    isAdmin: row.is_admin === 1,
    unlocked: parseUnlocked(row.unlocked),
    frame: row.frame || undefined,
    scStyle: row.sc_style || undefined,
    specBuff: row.spec_buff || undefined,
    combatBuff: row.combat_buff || undefined,
  };
}
function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname || row.username,
    avatar: row.avatar || undefined,
    isAdmin: row.is_admin === 1,
    frame: row.frame || undefined,
  };
}

/** Redeem codes → perk ids. Server-only (never sent to clients except admins). */
const REDEEM_CODES: Record<string, string[]> = {
  // rare / epic
  GOLD2026: ["sc_gold", "fr_gold"],
  NEON: ["sc_neon", "fr_neon"],
  SUNSET: ["sc_sunset"],
  RAINBOW: ["fr_rainbow"],
  MONO: ["sc_mono"],
  // legendary
  AURORA: ["sc_aurora"],
  PRISM: ["sc_prism"],
  FLAME: ["fr_flame"],
  HOLO: ["fr_holo"],
  LEGEND: ["sc_aurora", "sc_prism", "fr_flame", "fr_holo"],
  // ability
  ATTACK: ["attack"],
  // everything
  VIP: [
    "sc_gold",
    "sc_neon",
    "sc_sunset",
    "sc_mono",
    "sc_aurora",
    "sc_prism",
    "fr_gold",
    "fr_neon",
    "fr_rainbow",
    "fr_flame",
    "fr_holo",
    "attack",
  ],
};

// Seed the legacy promo codes into the DB as *reusable* (single_use=0) so the
// owner can keep handing them out; admin-issued codes are single-use & tracked.
for (const [code, ids] of Object.entries(REDEEM_CODES)) seedCode(code, ids, false);

// Admin accounts are designated by env (comma-separated usernames), so admin
// status follows configuration rather than anything a client can set.
const ADMIN_USERNAMES = new Set(
  (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
function isAdminUsername(username: string): boolean {
  return ADMIN_USERNAMES.has(username.trim().toLowerCase());
}
/**
 * Env-listed accounts are always admins (force-upgrade). We never auto-DOWNGRADE
 * here, so admins granted in-app persist. To remove a granted admin, use the
 * in-app toggle; env admins cannot be demoted.
 */
function syncAdmin(row: UserRow): UserRow {
  if (isAdminUsername(row.username) && row.is_admin !== 1) {
    updateUser(row.id, { is_admin: 1 });
    return { ...row, is_admin: 1 };
  }
  return row;
}

const rooms = new Map<string, Room>();

// Restore persisted rooms so they survive a server restart (members start empty).
for (const persisted of loadAllRooms()) {
  rooms.set(persisted.id, {
    id: persisted.id,
    title: persisted.title,
    ownerId: persisted.ownerId,
    createdAt: persisted.createdAt,
    isPublic: persisted.isPublic,
    image: persisted.image ?? "",
    state: persisted.state,
    messages: persisted.messages,
    history: [],
    members: new Map(),
    mutes: new Map(),
    placeBans: new Map(),
    voteBans: new Map(),
    duelBans: new Map(),
    muteDur: new Map(),
    placeBanDur: new Map(),
    voteBanDur: new Map(),
    duelBanDur: new Map(),
    vote: null,
    voteTimer: null,
    voteOptOut: new Set(),
    rallies: new Map(),
    decision: null,
    decisionTimer: null,
    tierLocks: new Map(),
    decisionCooldown: new Map(),
  });
}
console.log(`restored ${rooms.size} room(s) from disk`);

// Optionally seed a default admin account from env on first run.
if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
  const u = process.env.ADMIN_USERNAME.trim();
  if (u && !getUserByUsername(u)) {
    const { salt, hash } = hashPassword(process.env.ADMIN_PASSWORD);
    createUser({
      id: randomUUID(),
      username: u,
      nickname: u,
      avatar: "",
      salt,
      hash,
      is_admin: 1,
      created_at: Date.now(),
    });
    ADMIN_USERNAMES.add(u.toLowerCase());
    console.log(`seeded admin account '${u}'`);
  } else {
    ADMIN_USERNAMES.add(u.toLowerCase());
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
function makeRoomCode(): string {
  let code = "";
  do {
    code = Array.from(
      { length: 6 },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
  } while (rooms.has(code));
  return code;
}

function message(author: string, text: string, kind: ChatKind, authorId?: string): ChatMessage {
  return { id: crypto.randomUUID(), author, text, ts: Date.now(), kind, authorId };
}

/** Order-independent key for a pair of users (one rally per pair). */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Build the rally card payload: both players + their own difficulty levels. */
function buildRally(room: Room, pk: string, count: number) {
  const [id1, id2] = pk.split("|");
  const nameOf = (id: string) =>
    [...room.members.values()].find((m) => m.userId === id)?.name ?? "참가자";
  return {
    a: nameOf(id1),
    b: nameOf(id2),
    aLevel: parryLevel.get(`${room.id}:${pk}:${id1}`) ?? 0,
    bLevel: parryLevel.get(`${room.id}:${pk}:${id2}`) ?? 0,
    count,
  };
}

function snapshot(room: Room): RoomSnapshot {
  const now = Date.now();
  const members: Member[] = [...room.members.entries()].map(([id, m]) => {
    const mutedUntil = room.mutes.get(m.userId);
    const placeBannedUntil = room.placeBans.get(m.userId);
    const voteBannedUntil = room.voteBans.get(m.userId);
    const duelBannedUntil = room.duelBans.get(m.userId);
    return {
      id,
      name: m.name,
      avatar: m.avatar || undefined,
      username: m.username || undefined,
      userId: m.userId || undefined,
      frame: m.frame || undefined,
      role: memberRole(room, m.userId, m.isAdmin),
      mutedUntil: mutedUntil && mutedUntil > now ? mutedUntil : undefined,
      placeBannedUntil:
        placeBannedUntil && placeBannedUntil > now ? placeBannedUntil : undefined,
      voteBannedUntil:
        voteBannedUntil && voteBannedUntil > now ? voteBannedUntil : undefined,
      duelBannedUntil: duelBannedUntil && duelBannedUntil > now ? duelBannedUntil : undefined,
      mutedFor: mutedUntil && mutedUntil > now ? room.muteDur.get(m.userId) : undefined,
      placeBannedFor: placeBannedUntil && placeBannedUntil > now ? room.placeBanDur.get(m.userId) : undefined,
      voteBannedFor: voteBannedUntil && voteBannedUntil > now ? room.voteBanDur.get(m.userId) : undefined,
      duelBannedFor: duelBannedUntil && duelBannedUntil > now ? room.duelBanDur.get(m.userId) : undefined,
    };
  });
  const locks: RoomSnapshot["locks"] = {};
  for (const [itemId, l] of room.tierLocks) {
    if (l.until > now)
      locks[itemId] = { tierId: l.tierId, ...tierMeta(room, l.tierId), until: l.until, dur: l.dur, reason: l.reason };
  }
  return {
    id: room.id,
    title: room.title,
    ownerId: room.ownerId,
    state: room.state,
    messages: room.messages,
    members,
    history: room.history,
    locks,
  };
}

function roomSummary(room: Room): RoomSummary {
  return {
    id: room.id,
    title: room.title,
    ownerId: room.ownerId,
    ownerName: getUserById(room.ownerId)?.nickname || undefined,
    itemCount: Object.keys(room.state.items).length,
    tierCount: room.state.tiers.length,
    memberCount: room.members.size,
    isPublic: room.isPublic,
    image: room.image || undefined,
    members: [...room.members.values()].slice(0, 5).map((m) => ({
      name: m.name,
      avatar: m.avatar || undefined,
      frame: m.frame || undefined,
    })),
    createdAt: room.createdAt,
    updatedAt: Date.now(),
  };
}

/** Lobby list — public rooms only (private rooms are code-join). */
function roomList(): RoomSummary[] {
  return [...rooms.values()]
    .filter((r) => r.isPublic)
    .map(roomSummary)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function broadcastRoomList(io: Server) {
  io.emit("rooms:list", roomList());
}

function pushMessage(room: Room, msg: ChatMessage) {
  room.messages.push(msg);
  if (room.messages.length > 200) room.messages = room.messages.slice(-200);
}

function broadcast(io: Server, room: Room) {
  io.to(room.id).emit("room:state", snapshot(room));
  saveRoom(room); // persist every change
}

/** Record a tier move in the live 변경 이력 panel (who · from → to · when).
 *  Call AFTER the move is applied, passing the captured source tier id. */
function recordHistory(
  room: Room,
  itemId: string,
  fromTierId: string | null,
  toTierId: string,
  actor: string,
  actorId?: string,
) {
  const item = room.state.items[itemId];
  const toTier = room.state.tiers.find((t) => t.id === toTierId);
  if (!item || !toTier) return;
  const fromTier = fromTierId ? room.state.tiers.find((t) => t.id === fromTierId) : null;
  room.history.unshift({
    id: crypto.randomUUID(),
    actor,
    actorId,
    itemName: item.name,
    fromLabel: fromTier ? fromTier.label : "미배치",
    toLabel: toTier.label,
    toColor: toTier.color,
    ts: Date.now(),
  });
  room.history = room.history.slice(0, 20);
}

// --- 인정협회 티어 투표 ------------------------------------------------------

/** Tier id the item is currently placed in, or null if unplaced/missing. */
function tierOfItem(state: TierListState, itemId: string): string | null {
  for (const tier of state.tiers) {
    if ((state.placement[tier.id] ?? []).includes(itemId)) return tier.id;
  }
  return null;
}

/** Unique member account ids expected to vote (opted-out users excluded). */
function uniqueVoterIds(room: Room): Set<string> {
  const s = new Set<string>();
  for (const m of room.members.values())
    if (m.userId && !room.voteOptOut.has(m.userId)) s.add(m.userId);
  return s;
}

/** Like uniqueVoterIds but also excludes the current vote's abstainers. */
function voteExpectedIds(room: Room): Set<string> {
  const s = uniqueVoterIds(room);
  if (room.vote) for (const id of room.vote.abstained) s.delete(id);
  // Vote-banned members can't cast, so they don't hold up an early finish.
  const now = Date.now();
  for (const [id, until] of room.voteBans) if (until > now) s.delete(id);
  return s;
}

/** "약 N초/분" remaining label for a ban deadline. */
function leftLabel(until: number): string {
  const s = Math.ceil(Math.max(0, until - Date.now()) / 1000);
  return s < 60 ? `약 ${s}초` : `약 ${Math.ceil(s / 60)}분`;
}

function isRoomMember(room: Room, userId: string): boolean {
  for (const m of room.members.values()) if (m.userId === userId) return true;
  return false;
}

/** Total who count toward the vote: those expected to vote ∪ anyone who voted
 *  (e.g. opted-out members who used quick-vote). Drives the "N / M" display. */
function voteTotalVoters(room: Room): number {
  const ids = voteExpectedIds(room);
  if (room.vote) for (const id of room.vote.votes.keys()) ids.add(id);
  return ids.size;
}

/** True once every *expected* voter has cast (opted-out/abstainers don't block). */
function expectedAllVoted(room: Room): boolean {
  const v = room.vote;
  if (!v) return false;
  const expected = voteExpectedIds(room);
  if (expected.size === 0) return false; // nobody to wait for → let the timer run
  for (const id of expected) if (!v.votes.has(id)) return false;
  return true;
}

function tierMeta(room: Room, tierId: string) {
  const tier = room.state.tiers.find((t) => t.id === tierId);
  return { label: tier?.label ?? "?", color: tier?.color ?? "#888" };
}

const RESULT_HOLD_MS = 2500; // moved/void result shown this long
const REVOTE_HOLD_MS = 3500; // tie notice shown before the next round

function buildVoteSnapshot(room: Room): VoteSnapshot | null {
  const v = room.vote;
  if (!v) return null;
  const item = room.state.items[v.itemId];
  const memberByUser = (userId: string) => {
    for (const m of room.members.values()) if (m.userId === userId) return m;
    return null;
  };
  const tally = v.options.map((tierId) => ({
    tierId,
    voters: [...v.votes.entries()]
      .filter(([, t]) => t === tierId)
      .map(([uid]) => {
        const m = memberByUser(uid);
        return {
          userId: uid,
          name: m?.name ?? "참가자",
          avatar: m?.avatar || undefined,
          frame: m?.frame || undefined,
        };
      }),
  }));
  const options = v.options.map((tierId) => ({ tierId, ...tierMeta(room, tierId) }));
  const abstainers = [...v.abstained].map((uid) => {
    const m = memberByUser(uid);
    return {
      userId: uid,
      name: m?.name ?? "참가자",
      avatar: m?.avatar || undefined,
      frame: m?.frame || undefined,
    };
  });
  const result: VoteSnapshot["result"] = v.result
    ? {
        outcome: v.result.outcome,
        toLabel: v.result.toTier ? tierMeta(room, v.result.toTier).label : undefined,
        toColor: v.result.toTier ? tierMeta(room, v.result.toTier).color : undefined,
        counts: v.result.counts.map((c) => ({ tierId: c.tierId, count: c.count, ...tierMeta(room, c.tierId) })),
        nextCount: v.result.nextOptions?.length,
      }
    : undefined;
  return {
    id: v.id,
    itemId: v.itemId,
    itemName: item?.name ?? "?",
    itemImage: item?.imageUrl ?? null,
    reason: v.reason,
    starter: v.starter,
    currentTier: v.fromTier ? tierMeta(room, v.fromTier) : null,
    options,
    tally,
    abstainers,
    endsAt: v.endsAt,
    durationMs: v.durationMs,
    round: v.round,
    totalVoters: voteTotalVoters(room),
    phase: v.phase,
    result,
  };
}

function broadcastVote(io: Server, room: Room) {
  io.to(room.id).emit("room:vote", buildVoteSnapshot(room));
}

function clearVote(room: Room) {
  if (room.voteTimer) clearTimeout(room.voteTimer);
  room.voteTimer = null;
  room.vote = null;
}

function scheduleVoteEnd(io: Server, room: Room) {
  if (room.voteTimer) clearTimeout(room.voteTimer);
  const ms = Math.max(0, (room.vote?.endsAt ?? Date.now()) - Date.now());
  room.voteTimer = setTimeout(() => endVote(io, room), ms);
}

/** Start a vote for a placed item. Returns an error string, or null on success. */
function startVote(
  io: Server,
  room: Room,
  itemId: string,
  starter: string,
  reason: string,
  seconds?: number,
): string | null {
  if (room.vote) return "이미 진행 중인 투표가 있어요.";
  const item = room.state.items[itemId];
  if (!item) return "대상을 찾지 못했어요.";
  const lock = itemLock(room, itemId);
  if (lock) return `${lock.reason === "vote" ? "투표로" : "결정전으로"} 고정된 아이템은 투표할 수 없어요.`;
  const memberCount = new Set([...room.members.values()].map((m) => m.userId).filter(Boolean)).size;
  if (memberCount < VOTE_MIN_MEMBERS) return `투표는 ${VOTE_MIN_MEMBERS}명 이상일 때만 열 수 있어요.`;
  // Placed or unplaced both allowed; fromTier is null for pool items.
  const fromTier = tierOfItem(room.state, itemId);
  if (room.state.tiers.length < 2) return "투표하려면 티어가 2개 이상 필요해요.";
  const durationMs = voteDurationMs(seconds);
  room.vote = {
    id: crypto.randomUUID(),
    itemId,
    options: room.state.tiers.map((t) => t.id),
    endsAt: Date.now() + durationMs,
    durationMs,
    round: 1,
    votes: new Map(),
    abstained: new Set(),
    reason: reason.trim().slice(0, 200),
    starter,
    fromTier,
    phase: "voting",
  };
  scheduleVoteEnd(io, room);
  pushMessage(
    room,
    message("system", `${starter} 님이 '${item.name}' 티어 투표를 개최했습니다. (${durationMs / 1000}초)`, "action"),
  );
  broadcast(io, room);
  broadcastVote(io, room);
  return null;
}

function castVote(io: Server, room: Room, userId: string, tierId: string) {
  const v = room.vote;
  if (!v || v.phase !== "voting") return;
  if (!isRoomMember(room, userId)) return;
  // 투표 미참여(opt-out) members cannot cast — they only watch the tally.
  if (room.voteOptOut.has(userId)) return;
  const voteBannedUntil = room.voteBans.get(userId);
  if (voteBannedUntil && voteBannedUntil > Date.now()) return;
  if (tierId === VOTE_ABSTAIN) {
    v.abstained.add(userId); // 무효표 — excluded from expected voters
    v.votes.delete(userId);
  } else {
    if (!v.options.includes(tierId)) return;
    v.abstained.delete(userId);
    v.votes.set(userId, tierId);
  }
  broadcastVote(io, room);
  // End early once every expected voter has cast.
  if (expectedAllVoted(room)) endVote(io, room);
}

/** Pin a vote-decided item to its tier for 5min — deliberate (≥30s) votes only. */
function applyVoteLock(room: Room, itemId: string, durationMs: number) {
  if (durationMs < VOTE_LOCK_MIN_DURATION_MS) return;
  const tierId = tierOfItem(room.state, itemId);
  if (!tierId) return; // unplaced — nothing to pin
  room.tierLocks.set(itemId, { tierId, until: Date.now() + VOTE_LOCK_MS, dur: VOTE_LOCK_MS, reason: "vote" });
}

/** Tally the round and enter the "result" phase, then move/revote/clear. */
function endVote(io: Server, room: Room) {
  const v = room.vote;
  if (!v || v.phase !== "voting") return;
  if (room.voteTimer) clearTimeout(room.voteTimer);
  room.voteTimer = null;

  const counts = v.options.map((tierId) => ({
    tierId,
    count: [...v.votes.values()].filter((t) => t === tierId).length,
  }));
  const max = Math.max(...counts.map((c) => c.count));
  const item = room.state.items[v.itemId];
  const itemName = item?.name ?? "대상";
  v.phase = "result";

  if (max === 0) {
    v.result = { outcome: "void", counts };
    pushMessage(room, message("system", `'${itemName}' 투표가 무산되었습니다. (표 없음)`, "action"));
    broadcast(io, room);
    broadcastVote(io, room);
    room.voteTimer = setTimeout(() => {
      clearVote(room);
      broadcastVote(io, room);
    }, RESULT_HOLD_MS);
    return;
  }

  const winners = counts.filter((c) => c.count === max).map((c) => c.tierId);

  if (winners.length === 1) {
    const target = winners[0];
    const from = tierOfItem(room.state, v.itemId);
    const list = room.state.placement[target] ?? [];
    room.state = tierListReducer(room.state, {
      type: "moveItem",
      itemId: v.itemId,
      targetListId: target,
      targetIndex: list.length,
      by: "🏛️ 인정협회 투표",
      ts: Date.now(),
    });
    recordHistory(room, v.itemId, from, target, "🏛️ 인정협회 투표");
    v.result = { outcome: "moved", toTier: target, counts };
    applyVoteLock(room, v.itemId, v.durationMs);
    pushMessage(
      room,
      message("system", `🏛️ 투표 결과: '${itemName}' → ${tierMeta(room, target).label} 티어`, "action"),
    );
    broadcast(io, room);
    broadcastVote(io, room);
    room.voteTimer = setTimeout(() => {
      clearVote(room);
      broadcastVote(io, room);
    }, RESULT_HOLD_MS);
    return;
  }

  // Tie. Re-vote once (rounds < MAX); a tie again keeps the current tier.
  if (v.round >= MAX_VOTE_ROUNDS) {
    v.result = { outcome: "keep", counts };
    applyVoteLock(room, v.itemId, v.durationMs);
    pushMessage(
      room,
      message("system", `재투표도 동점 — '${itemName}'은(는) 현상 유지합니다.`, "action"),
    );
    broadcast(io, room);
    broadcastVote(io, room);
    room.voteTimer = setTimeout(() => {
      clearVote(room);
      broadcastVote(io, room);
    }, RESULT_HOLD_MS);
    return;
  }

  v.result = { outcome: "revote", counts, nextOptions: winners };
  pushMessage(
    room,
    message("system", `동점! ${winners.length}개 티어로 재투표합니다. (마지막 라운드)`, "action"),
  );
  broadcast(io, room);
  broadcastVote(io, room);
  room.voteTimer = setTimeout(() => {
    const cur = room.vote;
    if (!cur) return;
    cur.options = winners;
    cur.votes = new Map();
    cur.endsAt = Date.now() + cur.durationMs;
    cur.round += 1;
    cur.phase = "voting";
    cur.result = undefined;
    scheduleVoteEnd(io, room);
    broadcastVote(io, room);
  }, REVOTE_HOLD_MS);
}

// --- 티어 결정전 (decision match) -------------------------------------------

/** Resolve a userId to a display participant (name/avatar/frame). */
function memberInfo(room: Room, userId: string): DuelParticipant {
  for (const m of room.members.values())
    if (m.userId === userId)
      return { userId, name: m.name, avatar: m.avatar || undefined, frame: m.frame || undefined };
  return { userId, name: "참가자" };
}

/** Pool a side's buffs: spectators' specBuff + fighters' combatBuff (member records). */
function aggregateBuffs(room: Room, fighterIds: Iterable<string>, spectatorIds: Iterable<string>) {
  let bulwark = 0;
  let surge = 0;
  let gamble = 0;
  let life = 0;
  const member = (id: string) => [...room.members.values()].find((x) => x.userId === id);
  for (const id of spectatorIds) {
    const b = member(id)?.specBuff;
    if (b === "bulwark") bulwark += 1;
    else if (b === "surge") surge += 1;
    else if (b === "gamble") gamble += 1;
  }
  for (const id of fighterIds) {
    const b = member(id)?.combatBuff;
    if (b === "bulwark") bulwark += 1;
    else if (b === "surge") surge += 1;
    else if (b === "life") life += 1;
  }
  return { bulwark, surge, gamble, life };
}

/** Which duel side a fighter belongs to (during an active duel), or null. */
function duelSideOf(d: DecisionState, userId: string): DecisionSide | null {
  if (!d.duel) return null;
  if (d.duel.proAlive.includes(userId)) return "pro";
  if (d.duel.conAlive.includes(userId)) return "con";
  return null;
}

/** Unique account ids taking part (fighters + spectators, both sides). */
function decisionParticipants(d: DecisionState): Set<string> {
  return new Set([...d.pro.fighters, ...d.pro.spectators, ...d.con.fighters, ...d.con.spectators]);
}

/** Members needed for the match to be valid: ⌈unique members / 2⌉. */
function decisionNeeded(room: Room): number {
  const ids = new Set<string>();
  for (const m of room.members.values()) if (m.userId) ids.add(m.userId);
  return Math.max(1, Math.ceil(ids.size / 2));
}

/** Active tier lock for an item (expired locks are pruned), or null. */
function itemLock(room: Room, itemId: string) {
  const l = room.tierLocks.get(itemId);
  if (l && l.until > Date.now()) return l;
  if (l) room.tierLocks.delete(itemId);
  return null;
}

/** Remaining re-propose cooldown (epoch ms) after a defender win, or 0. */
function decisionCooldownUntil(room: Room, itemId: string): number {
  const until = room.decisionCooldown.get(itemId);
  if (until && until > Date.now()) return until;
  if (until) room.decisionCooldown.delete(itemId);
  return 0;
}

function decisionRemove(d: DecisionState, userId: string) {
  d.pro.fighters.delete(userId);
  d.pro.spectators.delete(userId);
  d.con.fighters.delete(userId);
  d.con.spectators.delete(userId);
}

function buildDecisionSnapshot(room: Room): DecisionSnapshot | null {
  const d = room.decision;
  if (!d) return null;
  const item = room.state.items[d.itemId];
  const roster = (r: { fighters: Set<string>; spectators: Set<string> }) => ({
    fighters: [...r.fighters].map((id) => memberInfo(room, id)),
    spectators: [...r.spectators].map((id) => memberInfo(room, id)),
  });
  return {
    id: d.id,
    itemId: d.itemId,
    itemName: item?.name ?? "?",
    itemImage: item?.imageUrl ?? null,
    targetTier: { tierId: d.targetTierId, ...tierMeta(room, d.targetTierId) },
    currentTier: d.fromTier ? tierMeta(room, d.fromTier) : null,
    proposer: d.proposerName,
    phase: d.phase,
    endsAt: d.endsAt,
    durationMs: d.durationMs,
    pro: roster(d.pro),
    con: roster(d.con),
    participants: decisionParticipants(d).size,
    needed: decisionNeeded(room),
    buffs: {
      pro: buffsView(room, d, "pro"),
      con: buffsView(room, d, "con"),
    },
    duel: d.duel
      ? {
          pairs: d.duel.pairs.map((p) => ({
            pro: memberInfo(room, p.proId),
            con: memberInfo(room, p.conId),
            proLevel: parryLevel.get(`${room.id}:${p.pk}:${p.proId}`) ?? 0,
            conLevel: parryLevel.get(`${room.id}:${p.pk}:${p.conId}`) ?? 0,
          })),
          results: d.duel.results.map((r) => ({
            winner: memberInfo(room, r.winnerId),
            loser: memberInfo(room, r.loserId),
            winnerSide: r.winnerSide,
          })),
          feed: d.duel.feed.filter((e) => Date.now() - e.ts < 4000),
          proAlive: d.duel.proAlive.length,
          conAlive: d.duel.conAlive.length,
          proTotal: d.duel.proTotal,
          conTotal: d.duel.conTotal,
        }
      : undefined,
    result: d.result
      ? {
          winner: d.result.winner,
          outcome: d.result.outcome,
          toLabel: d.result.toTier ? tierMeta(room, d.result.toTier).label : undefined,
          toColor: d.result.toTier ? tierMeta(room, d.result.toTier).color : undefined,
          lockUntil: d.result.lockUntil,
        }
      : undefined,
  };
}

/** Buff summary for a side — locked-in totals once the duel starts, else a live
 *  preview from the current spectators. */
function buffsView(room: Room, d: DecisionState, side: DecisionSide) {
  if (d.duel) {
    const b = d.duel.buffs[side];
    return { ...b, bulwarkLeft: d.duel.bulwarkLeft[side], lifeLeft: d.duel.reserveLives[side] };
  }
  const b = aggregateBuffs(room, d[side].fighters, d[side].spectators);
  return { ...b, bulwarkLeft: b.bulwark, lifeLeft: b.life };
}

function broadcastDecision(io: Server, room: Room) {
  io.to(room.id).emit("room:decision", buildDecisionSnapshot(room));
}

function clearDecision(room: Room) {
  if (room.decisionTimer) clearTimeout(room.decisionTimer);
  room.decisionTimer = null;
  room.decision = null;
}

function scheduleDecisionEnd(io: Server, room: Room) {
  if (room.decisionTimer) clearTimeout(room.decisionTimer);
  const ms = Math.max(0, (room.decision?.endsAt ?? Date.now()) - Date.now());
  room.decisionTimer = setTimeout(() => onDecisionSignupEnd(io, room), ms);
}

/** Open a decision match. Returns an error string, or null on success. */
function proposeDecision(
  io: Server,
  room: Room,
  itemId: string,
  targetTierId: string,
  proposerId: string,
  proposerName: string,
): string | null {
  if (room.decision) return "이미 진행 중인 결정전이 있어요.";
  const memberCount = new Set([...room.members.values()].map((m) => m.userId).filter(Boolean)).size;
  if (memberCount < 2) return "결정전은 접속자가 2명 이상일 때만 신청할 수 있어요.";
  const item = room.state.items[itemId];
  if (!item) return "대상을 찾지 못했어요.";
  const target = room.state.tiers.find((t) => t.id === targetTierId);
  if (!target) return "대상 티어를 찾지 못했어요.";
  if (itemLock(room, itemId)) return "고정된 아이템이에요. 고정이 풀린 뒤 신청하세요.";
  const cd = decisionCooldownUntil(room, itemId);
  if (cd) return `잠시 후 다시 신청할 수 있어요. (${Math.ceil((cd - Date.now()) / 1000)}초)`;
  const from = tierOfItem(room.state, itemId);
  if (from === targetTierId) return "이미 해당 티어에 있어요.";
  room.decision = {
    id: crypto.randomUUID(),
    itemId,
    targetTierId,
    proposerId,
    proposerName,
    phase: "signup",
    endsAt: Date.now() + DECISION_SIGNUP_MS,
    durationMs: DECISION_SIGNUP_MS,
    fromTier: from,
    pro: { fighters: new Set([proposerId]), spectators: new Set() },
    con: { fighters: new Set(), spectators: new Set() },
  };
  scheduleDecisionEnd(io, room);
  pushMessage(
    room,
    message("system", `${proposerName} 님이 '${item.name}' → ${target.label} 티어 결정전을 신청했습니다.`, "action"),
  );
  broadcast(io, room);
  broadcastDecision(io, room);
  return null;
}

function joinDecision(io: Server, room: Room, userId: string, side: DecisionSide, role: DecisionRole) {
  const d = room.decision;
  if (!d || (d.phase !== "signup" && d.phase !== "balance")) return;
  if (!isRoomMember(room, userId)) return;
  // During the balance window only fighter recruitment to either side is allowed.
  if (d.phase === "balance" && role !== "fighter") return;
  decisionRemove(d, userId);
  (role === "fighter" ? d[side].fighters : d[side].spectators).add(userId);
  broadcastDecision(io, room);
}

function leaveDecision(io: Server, room: Room, userId: string) {
  const d = room.decision;
  if (!d || (d.phase !== "signup" && d.phase !== "balance")) return;
  decisionRemove(d, userId);
  broadcastDecision(io, room);
}

/** A match that never formed a real contest → no objection: the proposal passes
 *  uncontested (item moves to the target tier and is locked). */
function decisionCancel(io: Server, room: Room, why: string) {
  const d = room.decision;
  if (!d) return;
  const item = room.state.items[d.itemId];
  const itemName = item?.name ?? "대상";
  const target = d.targetTierId;
  const targetValid = !!item && room.state.tiers.some((t) => t.id === target);
  if (targetValid) {
    const from = tierOfItem(room.state, d.itemId);
    const list = room.state.placement[target] ?? [];
    room.state = tierListReducer(room.state, {
      type: "moveItem",
      itemId: d.itemId,
      targetListId: target,
      targetIndex: list.length,
      by: "⚖️ 무산 (이의 없음)",
      ts: Date.now(),
    });
    recordHistory(room, d.itemId, from, target, `${d.proposerName} (결정전 무산)`, d.proposerId);
    const until = Date.now() + DECISION_LOCK_MS;
    room.tierLocks.set(d.itemId, { tierId: target, until, dur: DECISION_LOCK_MS, reason: "decision" });
    d.result = { winner: "pro", outcome: "moved", toTier: target, lockUntil: until };
    pushMessage(
      room,
      message("system", `결정전 무산(${why}) — 이의가 없어 '${itemName}'을(를) ${tierMeta(room, target).label} 티어로 이동·고정합니다.`, "action"),
    );
  } else {
    d.result = { winner: "con", outcome: "kept", toTier: null };
    pushMessage(room, message("system", `'${itemName}' 결정전 무산 — ${why}`, "action"));
  }
  d.phase = "resolved";
  broadcast(io, room);
  broadcastDecision(io, room);
  if (room.decisionTimer) clearTimeout(room.decisionTimer);
  room.decisionTimer = setTimeout(() => {
    clearDecision(room);
    broadcastDecision(io, room);
  }, DECISION_RESULT_HOLD_MS);
}

/** Signup window closed → check quorum, then equalize (balance) or duel/cancel. */
function onDecisionSignupEnd(io: Server, room: Room) {
  const d = room.decision;
  if (!d || d.phase !== "signup") return;
  const participants = decisionParticipants(d).size;
  const needed = decisionNeeded(room);
  if (participants < needed) {
    decisionCancel(io, room, `정족수 미달 (${participants}/${needed})`);
    return;
  }
  // Need ≥1 fighter on at least one side to have any duel to balance toward.
  if (d.pro.fighters.size === 0 && d.con.fighters.size === 0) {
    decisionCancel(io, room, "결투자 없음");
    return;
  }
  if (d.pro.fighters.size === d.con.fighters.size) {
    startDecisionDuel(io, room);
    return;
  }
  // Uneven sides → open a short window to recruit fighters to the short side.
  d.phase = "balance";
  d.endsAt = Date.now() + DECISION_BALANCE_MS;
  d.durationMs = DECISION_BALANCE_MS;
  if (room.decisionTimer) clearTimeout(room.decisionTimer);
  room.decisionTimer = setTimeout(() => onDecisionBalanceEnd(io, room), DECISION_BALANCE_MS);
  pushMessage(room, message("system", `⚖️ 결투 인원 보충 중 — 동수를 맞춰주세요 (${DECISION_BALANCE_MS / 1000}초)`, "action"));
  broadcast(io, room);
  broadcastDecision(io, room);
}

/** Balance window closed → trim the larger side to min, then duel (or cancel). */
function onDecisionBalanceEnd(io: Server, room: Room) {
  const d = room.decision;
  if (!d || d.phase !== "balance") return;
  const k = Math.min(d.pro.fighters.size, d.con.fighters.size);
  if (k < 1) {
    decisionCancel(io, room, "동수 결투자 모집 실패");
    return;
  }
  // Keep the earliest k fighters per side (선착순); demote the surplus to spectator.
  for (const side of ["pro", "con"] as const) {
    const fighters = [...d[side].fighters];
    for (const extra of fighters.slice(k)) {
      d[side].fighters.delete(extra);
      d[side].spectators.add(extra);
    }
  }
  startDecisionDuel(io, room);
}

/** Kick off K simultaneous matchups (challenger seat vs defender seat by order). */
function startDecisionDuel(io: Server, room: Room) {
  const d = room.decision;
  if (!d) return;
  d.phase = "duel";
  const proAlive = [...d.pro.fighters];
  const conAlive = [...d.con.fighters];
  const buffs = {
    pro: aggregateBuffs(room, d.pro.fighters, d.pro.spectators),
    con: aggregateBuffs(room, d.con.fighters, d.con.spectators),
  };
  d.duel = {
    pairs: [],
    results: [],
    feed: [],
    proAlive,
    conAlive,
    proTotal: proAlive.length,
    conTotal: conAlive.length,
    debt: new Map(),
    buffs,
    bulwarkLeft: { pro: buffs.pro.bulwark, con: buffs.con.bulwark },
    reserveLives: { pro: buffs.pro.life, con: buffs.con.life },
  };
  pushMessage(
    room,
    message("system", `⚔️ 결정전 시작 — 찬성 ${proAlive.length} vs 반대 ${conAlive.length}`, "action"),
  );
  rematchDuel(io, room);
  broadcast(io, room);
  broadcastDecision(io, room);
}

/** Pair up free survivors (≤ min available) and start a parry rally for each. */
function rematchDuel(io: Server, room: Room) {
  const d = room.decision;
  if (!d?.duel) return;
  const du = d.duel;
  const engaged = new Set(du.pairs.flatMap((p) => [p.proId, p.conId]));
  const freePro = du.proAlive.filter((id) => !engaged.has(id));
  const freeCon = du.conAlive.filter((id) => !engaged.has(id));
  // Starting difficulty = inherited debt + opponent 공격 (surge), floored at 0.
  const startLevel = (side: DecisionSide, id: string) => {
    const opp = side === "pro" ? "con" : "pro";
    return Math.max(0, (du.debt.get(id) ?? 0) + du.buffs[opp].surge);
  };
  while (freePro.length && freeCon.length) {
    const proId = freePro.shift()!;
    const conId = freeCon.shift()!;
    const pk = pairKey(proId, conId);
    parryLevel.set(`${room.id}:${pk}:${proId}`, startLevel("pro", proId));
    parryLevel.set(`${room.id}:${pk}:${conId}`, startLevel("con", conId));
    du.debt.delete(proId);
    du.debt.delete(conId);
    du.pairs.push({ proId, conId, pk });
    // Challenger (pro) opens; defender (con) gets the parry prompt.
    const proName = memberInfo(room, proId).name;
    for (const [sid, m] of room.members) {
      if (m.userId === conId)
        io.to(sid).emit("room:attacked", {
          by: proName,
          byUserId: proId,
          parryable: true,
          level: parryLevel.get(`${room.id}:${pk}:${conId}`) ?? 0,
        });
    }
  }
}

/** A fighter missed in a duel pair → 목숨 revives them if any, else eliminate +
 *  split their stack across surviving teammates, record the KO, then re-pair. */
function onDuelHit(io: Server, room: Room, loserId: string, pk: string) {
  const d = room.decision;
  if (!d?.duel || d.phase !== "duel") return;
  const du = d.duel;
  const pairIdx = du.pairs.findIndex((p) => p.pk === pk);
  if (pairIdx < 0) return;
  const [pair] = du.pairs.splice(pairIdx, 1);
  const loserSide: DecisionSide = pair.proId === loserId ? "pro" : "con";
  const winnerId = pair.proId === loserId ? pair.conId : pair.proId;
  const loserStack = parryLevel.get(`${room.id}:${pk}:${loserId}`) ?? 0;
  parryLevel.delete(`${room.id}:${pk}:${pair.proId}`);
  parryLevel.delete(`${room.id}:${pk}:${pair.conId}`);

  // 목숨: a reserve life lets the fallen fighter survive and re-enter the pool.
  if (du.reserveLives[loserSide] > 0) {
    du.reserveLives[loserSide] -= 1;
    du.feed.push({ kind: "life", side: loserSide, name: memberInfo(room, loserId).name, amount: 0, ts: Date.now() });
    if (du.feed.length > 8) du.feed.shift();
    rematchDuel(io, room);
    broadcast(io, room);
    broadcastDecision(io, room);
    return;
  }

  const alive = loserSide === "pro" ? du.proAlive : du.conAlive;
  const i = alive.indexOf(loserId);
  if (i >= 0) alive.splice(i, 1);
  du.results.push({ winnerId, loserId, winnerSide: loserSide === "pro" ? "con" : "pro" });
  // Defeated fighter is duel-banned for a while (shows as a profile debuff timer).
  room.duelBans.set(loserId, Date.now() + DUEL_BAN_ON_LOSS_MS);
  room.duelBanDur.set(loserId, DUEL_BAN_ON_LOSS_MS);

  // The fallen fighter's difficulty stack is split evenly (÷N) among survivors.
  const survivors = [...alive];
  if (loserStack > 0 && survivors.length > 0) {
    const per = Math.floor(loserStack / survivors.length);
    if (per > 0) {
      for (const id of survivors) {
        const inPair = du.pairs.find((p) => p.proId === id || p.conId === id);
        if (inPair) {
          const k = `${room.id}:${inPair.pk}:${id}`;
          parryLevel.set(k, (parryLevel.get(k) ?? 0) + per);
        } else {
          du.debt.set(id, (du.debt.get(id) ?? 0) + per);
        }
      }
    }
  }

  if (du.proAlive.length === 0 || du.conAlive.length === 0) {
    resolveDecision(io, room, du.conAlive.length === 0 ? "pro" : "con");
    return;
  }
  rematchDuel(io, room);
  broadcast(io, room);
  broadcastDecision(io, room);
}

/** The duel is over — winner side decides the item's fate. */
function resolveDecision(io: Server, room: Room, winner: DecisionSide) {
  const d = room.decision;
  if (!d || d.phase !== "duel") return;
  const item = room.state.items[d.itemId];
  const itemName = item?.name ?? "대상";
  if (winner === "pro") {
    const target = d.targetTierId;
    const from = tierOfItem(room.state, d.itemId);
    const list = room.state.placement[target] ?? [];
    room.state = tierListReducer(room.state, {
      type: "moveItem",
      itemId: d.itemId,
      targetListId: target,
      targetIndex: list.length,
      by: "⚔️ 티어 결정전",
      ts: Date.now(),
    });
    recordHistory(room, d.itemId, from, target, `${d.proposerName} (결정전)`, d.proposerId);
    const until = Date.now() + DECISION_LOCK_MS;
    room.tierLocks.set(d.itemId, { tierId: target, until, dur: DECISION_LOCK_MS, reason: "decision" });
    d.result = { winner, outcome: "moved", toTier: target, lockUntil: until };
    pushMessage(
      room,
      message("system", `🏆 결정전 결과: '${itemName}' → ${tierMeta(room, target).label} 티어 (1시간 고정)`, "action"),
    );
  } else {
    room.decisionCooldown.set(d.itemId, Date.now() + DECISION_CON_COOLDOWN_MS);
    d.result = { winner, outcome: "kept", toTier: null };
    pushMessage(room, message("system", `🛡️ 결정전 방어 성공 — '${itemName}' 유지 (1분간 재신청 불가)`, "action"));
  }
  d.phase = "resolved";
  if (room.decisionTimer) clearTimeout(room.decisionTimer);
  room.decisionTimer = setTimeout(() => {
    clearDecision(room);
    broadcastDecision(io, room);
  }, DECISION_RESULT_HOLD_MS);
  broadcast(io, room);
  broadcastDecision(io, room);
}

/** Is `pk` an active matchup in the current decision duel? */
function decisionDuelHasPair(room: Room, pk: string): boolean {
  return !!room.decision?.duel?.pairs.some((p) => p.pk === pk);
}

/** A fighter left mid-duel: an engaged one forfeits their pair; a benched
 *  survivor just drops out. Either may end the match. */
function duelForfeit(io: Server, room: Room, userId: string) {
  const d = room.decision;
  if (!d?.duel || d.phase !== "duel") return;
  const du = d.duel;
  const inPro = du.proAlive.includes(userId);
  const inCon = du.conAlive.includes(userId);
  if (!inPro && !inCon) return;
  const pair = du.pairs.find((p) => p.proId === userId || p.conId === userId);
  if (pair) {
    onDuelHit(io, room, userId, pair.pk);
    return;
  }
  const alive = inPro ? du.proAlive : du.conAlive;
  const i = alive.indexOf(userId);
  if (i >= 0) alive.splice(i, 1);
  if (du.proAlive.length === 0 || du.conAlive.length === 0) {
    resolveDecision(io, room, du.conAlive.length === 0 ? "pro" : "con");
  } else {
    rematchDuel(io, room);
    broadcast(io, room);
    broadcastDecision(io, room);
  }
}

function findItem(state: TierListState, name: string): Item | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const items = Object.values(state.items);
  return (
    items.find((i) => i.name.trim().toLowerCase() === q) ??
    items.find((i) => i.name.trim().toLowerCase().includes(q)) ??
    null
  );
}

function findTier(state: TierListState, label: string): Tier | null {
  const q = label.trim().toLowerCase();
  if (!q) return null;
  return state.tiers.find((t) => t.label.trim().toLowerCase() === q) ?? null;
}

function newToken(userId: string): string {
  const token = randomBytes(24).toString("hex");
  createSession(token, userId);
  return token;
}

function registerUser(
  username: string,
  nickname: string,
  password: string,
): AuthResult {
  const u = username.trim();
  if (u.length < 2 || u.length > 24)
    return { ok: false, error: "아이디는 2~24자로 입력하세요." };
  if (!/^[a-zA-Z0-9_]+$/.test(u))
    return { ok: false, error: "아이디는 영문/숫자/밑줄만 사용할 수 있어요." };
  if (password.length < 4)
    return { ok: false, error: "비밀번호는 4자 이상이어야 해요." };
  if (getUserByUsername(u))
    return { ok: false, error: "이미 사용 중인 아이디예요." };
  const { salt, hash } = hashPassword(password);
  const nick = nickname.trim().slice(0, 24) || u;
  const id = randomUUID();
  const admin = isAdminUsername(u) ? 1 : 0;
  createUser({ id, username: u, nickname: nick, avatar: "", salt, hash, is_admin: admin, created_at: Date.now() });
  return { ok: true, token: newToken(id), user: toAuthUser(getUserById(id)!) };
}

function loginUser(username: string, password: string): AuthResult {
  const found = getUserByUsername(username.trim());
  if (!found || !verifyPassword(password, found.salt, found.hash))
    return { ok: false, error: "아이디 또는 비밀번호가 올바르지 않아요." };
  return { ok: true, token: newToken(found.id), user: toAuthUser(syncAdmin(found)) };
}

function resumeSession(token: string): AuthResult {
  const userId = token ? getSessionUserId(token) : null;
  const row = userId ? getUserById(userId) : null;
  if (!row) return { ok: false, error: "세션이 만료되었어요." };
  return { ok: true, token, user: toAuthUser(syncAdmin(row)) };
}

function redeemCode(userId: string, code: string): RedeemResult {
  const row = getUserById(userId);
  if (!row) return { ok: false, error: "사용자를 찾을 수 없어요." };
  const key = code.trim().toUpperCase();
  const entry = getCode(key);
  if (!entry) return { ok: false, error: "유효하지 않은 코드예요." };
  if (entry.single_use && entry.used_by)
    return { ok: false, error: "이미 사용된 코드예요." };
  let grant: string[];
  try {
    grant = JSON.parse(entry.perks) as string[];
  } catch {
    return { ok: false, error: "유효하지 않은 코드예요." };
  }
  const set = new Set(parseUnlocked(row.unlocked));
  const newly = grant.filter((p) => !set.has(p));
  for (const p of grant) set.add(p);
  updateUser(userId, { unlocked: JSON.stringify([...set]) });
  if (entry.single_use) markCodeUsed(key, userId);
  return { ok: true, user: toAuthUser(getUserById(userId)!), granted: newly };
}

function randomCodeSegment(): string {
  let s = "";
  const bytes = randomBytes(4);
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

/** Issue a fresh single-use code (admin only). Retries on the rare collision. */
function issueCode(perkIds: string[]): IssueCodeResult {
  const valid = perkIds.filter((id) => perkById(id));
  if (valid.length === 0)
    return { ok: false, error: "유효한 perk를 1개 이상 선택하세요." };
  let code = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `TIER-${randomCodeSegment()}-${randomCodeSegment()}`;
    if (!getCode(candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) return { ok: false, error: "코드 생성에 실패했어요. 다시 시도해주세요." };
  createCode(code, valid, true);
  return { ok: true, code: codeRowToInfo(getCode(code)!) };
}

function equipPerk(
  userId: string,
  patch: { frame?: string; scStyle?: string; specBuff?: string; combatBuff?: string },
): UpdateResult {
  const row = getUserById(userId);
  if (!row) return { ok: false, error: "사용자를 찾을 수 없어요." };
  const unlocked = new Set(parseUnlocked(row.unlocked));
  const fields: Partial<Pick<UserRow, "frame" | "sc_style" | "spec_buff" | "combat_buff">> = {};
  if (patch.frame !== undefined) {
    const f = patch.frame;
    if (f && (!unlocked.has(f) || perkById(f)?.type !== "frame"))
      return { ok: false, error: "사용할 수 없는 프레임이에요." };
    fields.frame = f;
  }
  if (patch.scStyle !== undefined) {
    const s = patch.scStyle;
    if (s && (!unlocked.has(s) || perkById(s)?.type !== "superchat"))
      return { ok: false, error: "사용할 수 없는 슈퍼챗 스타일이에요." };
    fields.sc_style = s;
  }
  if (patch.specBuff !== undefined) {
    // Free choice (not gated): must be a known buff id, or "" for none.
    const b = patch.specBuff;
    if (b && !isSpecBuff(b)) return { ok: false, error: "사용할 수 없는 관전 버프예요." };
    fields.spec_buff = b;
  }
  if (patch.combatBuff !== undefined) {
    const b = patch.combatBuff;
    if (b && !isCombatBuff(b)) return { ok: false, error: "사용할 수 없는 전투 버프예요." };
    fields.combat_buff = b;
  }
  updateUser(userId, fields);
  return { ok: true, user: toAuthUser(getUserById(userId)!) };
}

function codeRowToInfo(row: {
  code: string;
  perks: string;
  single_use: number;
  used_by: string | null;
  created_at: number;
}): CodeInfo {
  let ids: string[] = [];
  try {
    ids = JSON.parse(row.perks) as string[];
  } catch {
    ids = [];
  }
  return {
    code: row.code,
    perks: ids.map((id) => perkById(id)?.name ?? id),
    singleUse: row.single_use !== 0,
    usedBy: row.used_by ? getUserById(row.used_by)?.nickname ?? "알 수 없음" : null,
    createdAt: row.created_at,
  };
}

function codesList(): CodeInfo[] {
  return listCodes().map(codeRowToInfo);
}

/** Effective role of an account within a room. */
function memberRole(room: Room, userId: string, isAdmin: boolean): MemberRole {
  if (isAdmin) return "admin";
  if (room.ownerId === userId) return "owner";
  return "member";
}

function updateProfile(userId: string, patch: ProfileUpdate): UpdateResult {
  const row = getUserById(userId);
  if (!row) return { ok: false, error: "사용자를 찾을 수 없어요." };
  const fields: Partial<Pick<UserRow, "nickname" | "avatar" | "salt" | "hash">> = {};
  if (patch.nickname !== undefined)
    fields.nickname = patch.nickname.trim().slice(0, 24) || row.username;
  if (patch.avatar !== undefined)
    fields.avatar = patch.avatar.slice(0, MAX_AVATAR);
  if (patch.password) {
    if (!verifyPassword(patch.currentPassword ?? "", row.salt, row.hash))
      return { ok: false, error: "현재 비밀번호가 올바르지 않아요." };
    if (patch.password.length < 4)
      return { ok: false, error: "새 비밀번호는 4자 이상이어야 해요." };
    const next = hashPassword(patch.password);
    fields.salt = next.salt;
    fields.hash = next.hash;
  }
  updateUser(userId, fields);
  return { ok: true, user: toAuthUser(getUserById(userId)!) };
}

const HELP_TEXT = helpText();

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("tier-list realtime server");
});

const io = new Server(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket: Socket) => {
  let currentRoom: string | null = null;
  let name = "익명";
  let authedUser: AuthUser | null = null;

  const hint = (text: string) =>
    socket.emit("room:hint", { id: crypto.randomUUID(), text, ts: Date.now() });

  /** Join a room using the authenticated account's identity. Requires login. */
  function enter(roomId: string) {
    if (!authedUser) {
      socket.emit("room:error", "멀티플레이는 로그인이 필요합니다.");
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("room:error", "존재하지 않는 방 코드입니다.");
      return;
    }
    // Block the same account from being in the room via another live connection.
    // (Stale "ghost" members whose socket already disconnected are cleaned up.)
    for (const [sid, m] of room.members) {
      if (sid !== socket.id && m.userId === authedUser.id) {
        if (io.sockets.sockets.has(sid)) {
          socket.emit("room:error", "이미 다른 창/기기에서 이 방에 참여 중입니다.");
          return;
        }
        room.members.delete(sid);
      }
    }
    name = authedUser.nickname;
    socket.join(roomId);
    currentRoom = roomId;
    const rejoin = room.members.has(socket.id);
    room.members.set(socket.id, {
      userId: authedUser.id,
      name,
      avatar: (authedUser.avatar ?? "").slice(0, MAX_AVATAR),
      username: authedUser.username,
      isAdmin: authedUser.isAdmin,
      frame: authedUser.frame ?? "",
      specBuff: authedUser.specBuff ?? "",
      combatBuff: authedUser.combatBuff ?? "",
    });
    if (!rejoin) {
      pushMessage(room, message("system", `${name} 님이 입장했습니다.`, "system"));
    }
    broadcast(io, room);
    if (room.vote) broadcastVote(io, room); // surface an in-progress vote to the joiner
    if (room.decision) broadcastDecision(io, room); // …and any decision match
  }

  function leave() {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    // Leave the socket.io room *first* so this socket does not receive the
    // post-leave snapshot (which would re-populate the room and make the user
    // appear stuck in it — only their participant entry would disappear).
    socket.leave(currentRoom);
    currentRoom = null;
    if (room) {
      room.members.delete(socket.id);
      pushMessage(room, message("system", `${name} 님이 퇴장했습니다.`, "system"));
      if (room.members.size > 0) {
        // Decision match: a leaving champion forfeits the duel; a leaving signup
        // participant just drops out of the roster.
        const d = room.decision;
        if (d && authedUser) {
          if (d.phase === "duel") duelForfeit(io, room, authedUser.id);
          else if (d.phase === "signup" || d.phase === "balance") leaveDecision(io, room, authedUser.id);
        }
        // A pending vote may now have everyone (still present) voted → end it.
        if (room.vote && room.vote.phase === "voting" && expectedAllVoted(room)) {
          endVote(io, room);
        }
        broadcast(io, room);
      } else {
        // Last member left — keep the room (persisted), cancel any vote/decision.
        clearVote(room);
        clearDecision(room);
        saveRoom(room);
      }
    }
  }

  /** Apply a tier action from a command and post an "action" message describing it. */
  function applyCommand(room: Room, action: Action, description: string) {
    room.state = tierListReducer(room.state, action);
    pushMessage(room, message("system", `${name} 님: ${description}`, "action"));
    broadcast(io, room);
  }

  function runCommand(room: Room, raw: string) {
    const space = raw.indexOf(" ");
    const cmd = (space === -1 ? raw : raw.slice(0, space)).toLowerCase();
    const arg = (space === -1 ? "" : raw.slice(space + 1)).trim();

    switch (cmd) {
      case "/help": {
        hint(HELP_TEXT);
        return;
      }
      case "/add": {
        const names = arg.split(",").map((s) => s.trim()).filter(Boolean);
        if (names.length === 0) {
          hint("사용법: /add <이름>[, <이름>…]");
          return;
        }
        applyCommand(
          room,
          { type: "addItems", entries: names.map((n) => ({ name: n, imageUrl: null })), by: name },
          `'${names.join("', '")}' 추가`,
        );
        return;
      }
      case "/remove":
      case "/del": {
        const item = findItem(room.state, arg);
        if (!item) {
          hint(`'${arg}' 대상을 찾지 못했어요.`);
          return;
        }
        applyCommand(room, { type: "removeItem", id: item.id }, `'${item.name}' 삭제`);
        return;
      }
      case "/rename": {
        const [oldName, newName] = arg.split("|").map((s) => s.trim());
        if (!oldName || !newName) {
          hint("사용법: /rename <이름> | <새 이름>");
          return;
        }
        const item = findItem(room.state, oldName);
        if (!item) {
          hint(`'${oldName}' 대상을 찾지 못했어요.`);
          return;
        }
        applyCommand(
          room,
          { type: "updateItem", id: item.id, patch: { name: newName } },
          `'${item.name}' → '${newName}'`,
        );
        return;
      }
      case "/place":
      case "/move": {
        const [itemName, tierLabel] = arg.split("|").map((s) => s.trim());
        if (!itemName || !tierLabel) {
          hint("사용법: /place <이름> | <티어>");
          return;
        }
        const item = findItem(room.state, itemName);
        if (!item) {
          hint(`'${itemName}' 대상을 찾지 못했어요.`);
          return;
        }
        const tier = findTier(room.state, tierLabel);
        if (!tier) {
          hint(`'${tierLabel}' 티어를 찾지 못했어요.`);
          return;
        }
        const list = room.state.placement[tier.id] ?? [];
        applyCommand(
          room,
          { type: "moveItem", itemId: item.id, targetListId: tier.id, targetIndex: list.length, by: name, ts: Date.now() },
          `'${item.name}' → ${tier.label} 티어`,
        );
        return;
      }
      case "/tier": {
        const [sub, ...rest] = arg.split(/\s+/);
        if (sub === "add") {
          applyCommand(room, { type: "addTier" }, "티어 추가");
          return;
        }
        if (sub === "remove" || sub === "rm") {
          const label = rest.join(" ").trim();
          const tier = findTier(room.state, label);
          if (!tier) {
            hint(`'${label}' 티어를 찾지 못했어요.`);
            return;
          }
          applyCommand(room, { type: "removeTier", tierId: tier.id }, `${tier.label} 티어 삭제`);
          return;
        }
        hint("사용법: /tier add | /tier remove <티어>");
        return;
      }
      case "/announce":
      case "/공지":
      case "/highlight": {
        if (!arg) {
          hint("사용법: /announce <내용>");
          return;
        }
        pushMessage(room, message(name, arg, "announce", authedUser?.id));
        broadcast(io, room);
        return;
      }
      case "/super":
      case "/슈퍼":
      case "/sc": {
        if (!arg) {
          hint("사용법: /super <내용>");
          return;
        }
        const style = authedUser?.scStyle;
        if (!style || !authedUser?.unlocked.includes(style)) {
          hint("장착한 슈퍼챗 스타일이 없어요. 계정 관리에서 코드로 잠금 해제 후 장착하세요.");
          return;
        }
        const msg = message(name, arg, "super", authedUser.id);
        msg.style = style;
        msg.avatar = authedUser.avatar || undefined;
        msg.frame = authedUser.frame || undefined;
        pushMessage(room, msg);
        broadcast(io, room);
        return;
      }
      case "/vote":
      case "/투표": {
        const [namePart, reasonPart, secPart] = arg.split("|").map((s) => s.trim());
        const item = findItem(room.state, namePart);
        if (!item) {
          hint(`'${namePart}' 대상을 찾지 못했어요.`);
          return;
        }
        if (!reasonPart) {
          hint("사용법: /vote <이름> | <사유> [ | <초> ]");
          return;
        }
        const secs = secPart ? Number(secPart) : undefined;
        const err = startVote(io, room, item.id, name, reasonPart, secs);
        if (err) hint(err);
        return;
      }
      case "/clear":
      case "/reset": {
        applyCommand(room, { type: "reset" }, "보드 초기화");
        return;
      }
      default:
        hint(`알 수 없는 명령어: ${cmd} — /help 를 입력해 보세요.`);
    }
  }

  // --- Auth events ----------------------------------------------------------
  type Ack<T> = (result: T) => void;

  socket.on(
    "auth:register",
    (
      { username, nickname, password }: { username?: string; nickname?: string; password?: string },
      ack?: Ack<AuthResult>,
    ) => {
      const result = registerUser(String(username ?? ""), String(nickname ?? ""), String(password ?? ""));
      if (result.ok) authedUser = result.user;
      ack?.(result);
    },
  );

  socket.on(
    "auth:login",
    ({ username, password }: { username?: string; password?: string }, ack?: Ack<AuthResult>) => {
      const result = loginUser(String(username ?? ""), String(password ?? ""));
      if (result.ok) authedUser = result.user;
      ack?.(result);
    },
  );

  socket.on("auth:resume", ({ token }: { token?: string }, ack?: Ack<AuthResult>) => {
    const result = resumeSession(String(token ?? ""));
    if (result.ok) {
      authedUser = result.user;
      socket.data.userId = result.user.id;
    }
    ack?.(result);
  });

  socket.on("auth:logout", ({ token }: { token?: string }) => {
    if (token) deleteSession(String(token));
    authedUser = null;
    socket.data.userId = undefined;
  });

  socket.on("auth:update", (patch: ProfileUpdate, ack?: Ack<UpdateResult>) => {
    if (!authedUser) {
      ack?.({ ok: false, error: "로그인이 필요합니다." });
      return;
    }
    const result = updateProfile(authedUser.id, patch);
    if (result.ok) {
      authedUser = result.user;
      name = result.user.nickname;
      // Reflect the new nickname/avatar in the current room immediately.
      const room = currentRoom ? rooms.get(currentRoom) : null;
      if (room && room.members.has(socket.id)) {
        room.members.set(socket.id, {
          userId: result.user.id,
          name: result.user.nickname,
          avatar: (result.user.avatar ?? "").slice(0, MAX_AVATAR),
          username: result.user.username,
          isAdmin: result.user.isAdmin,
          frame: result.user.frame ?? "",
          specBuff: result.user.specBuff ?? "",
          combatBuff: result.user.combatBuff ?? "",
        });
        broadcast(io, room);
      }
    }
    ack?.(result);
  });

  socket.on("user:get", ({ id }: { id?: string }, ack?: Ack<PublicUser | null>) => {
    const row = getUserById(String(id ?? ""));
    ack?.(row ? toPublicUser(row) : null);
  });

  socket.on("perk:redeem", ({ code }: { code?: string }, ack?: Ack<RedeemResult>) => {
    if (!authedUser) {
      ack?.({ ok: false, error: "로그인이 필요합니다." });
      return;
    }
    const result = redeemCode(authedUser.id, String(code ?? ""));
    if (result.ok) authedUser = result.user;
    ack?.(result);
  });

  socket.on(
    "perk:equip",
    (patch: { frame?: string; scStyle?: string; specBuff?: string; combatBuff?: string }, ack?: Ack<UpdateResult>) => {
      if (!authedUser) {
        ack?.({ ok: false, error: "로그인이 필요합니다." });
        return;
      }
      const result = equipPerk(authedUser.id, patch);
      if (result.ok) {
        authedUser = result.user;
        // Reflect the equipped frame / spectator buff on the member in the room.
        const room = currentRoom ? rooms.get(currentRoom) : null;
        if (room && room.members.has(socket.id)) {
          const m = room.members.get(socket.id)!;
          m.frame = result.user.frame ?? "";
          m.specBuff = result.user.specBuff ?? "";
          m.combatBuff = result.user.combatBuff ?? "";
          broadcast(io, room);
          // Refresh the buff preview if this member is in a forming decision match.
          if (room.decision && room.decision.phase !== "duel") broadcastDecision(io, room);
        }
      }
      ack?.(result);
    },
  );

  socket.on("codes:list", (_: unknown, ack?: Ack<CodeInfo[]>) => {
    if (!authedUser?.isAdmin) {
      ack?.([]);
      return;
    }
    ack?.(codesList());
  });

  socket.on(
    "codes:issue",
    (payload: IssueCodePayload, ack?: Ack<IssueCodeResult>) => {
      if (!authedUser?.isAdmin) {
        ack?.({ ok: false, error: "관리자만 코드를 발급할 수 있어요." });
        return;
      }
      ack?.(issueCode(Array.isArray(payload?.perks) ? payload.perks : []));
    },
  );

  // Parry: reflect the attack back to the attacker. Difficulty is per-person —
  // an inner-zone parry (escalate) raises only the *attacker's* difficulty; an
  // outer parry returns it at the attacker's current difficulty.
  socket.on("attack:parry", ({ attackerId, escalate }: { attackerId?: string; escalate?: boolean }) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const aid = String(attackerId ?? "");
    if (!aid || aid === authedUser.id) return;
    const attacker = [...room.members.values()].find((m) => m.userId === aid);
    if (!attacker) return; // attacker left — nothing to reflect to
    const pk = pairKey(authedUser.id, aid);
    const qKey = `${room.id}:${pk}:${aid}`;
    const cur = parryLevel.get(qKey) ?? 0;
    let nextLevel = cur;
    if (escalate) {
      const d = room.decision;
      const du = d?.duel;
      const side = du ? duelSideOf(d!, aid) : null;
      let delta = 1; // base +1 difficulty rise
      if (side && du) {
        const g = du.buffs[side].gamble;
        // 도박: each gambler flips ±1 on the rise (can shrink it or blow it up).
        for (let i = 0; i < g; i++) delta += Math.random() < 0.5 ? 1 : -1;
        // 방어: a charge absorbs a net rise entirely (level holds).
        const event =
          delta > 0 && du.bulwarkLeft[side] > 0
            ? ("absorb" as const)
            : g > 0
              ? ("gamble" as const)
              : null;
        if (event === "absorb") {
          du.bulwarkLeft[side] -= 1;
          du.feed.push({ kind: "absorb", side, name: attacker.name, amount: delta, ts: Date.now() });
          delta = 0;
        } else if (event === "gamble") {
          du.feed.push({ kind: "gamble", side, name: attacker.name, amount: delta, ts: Date.now() });
        }
        if (du.feed.length > 8) du.feed.shift();
      }
      nextLevel = Math.max(0, Math.min(MAX_PARRY_LEVEL, cur + delta));
    }
    parryLevel.set(qKey, nextLevel);
    for (const [sid, m] of room.members) {
      if (m.userId === aid)
        io.to(sid).emit("room:attacked", {
          by: name,
          byUserId: authedUser.id,
          parryable: true, // the rally continues — they can parry back
          level: nextLevel,
        });
    }
    // Decision duels show progress in the DecisionCard, not a chat rally card.
    if (decisionDuelHasPair(room, pk)) {
      broadcastDecision(io, room);
      broadcast(io, room);
      return;
    }
    // Update the rally card (count++ , new attacker = the parrier) — no new line.
    const mid = room.rallies.get(pk);
    const existing = mid ? room.messages.find((m) => m.id === mid) : undefined;
    if (existing?.rally) {
      existing.rally = buildRally(room, pk, existing.rally.count + 1);
    } else {
      const m2 = message(name, "", "action");
      m2.rally = buildRally(room, pk, 1);
      pushMessage(room, m2);
      room.rallies.set(pk, m2.id);
    }
    broadcast(io, room);
  });

  // A player got hit (parry missed) → finalize the rally card: winner = attacker.
  socket.on("attack:hit", ({ attackerId }: { attackerId?: string }) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const aid = String(attackerId ?? "");
    if (!aid) return;
    const pk = pairKey(authedUser.id, aid);
    // Decision duel: the misser is eliminated; the engine handles transfer/rematch.
    if (decisionDuelHasPair(room, pk)) {
      onDuelHit(io, room, authedUser.id, pk);
      return;
    }
    const winner = [...room.members.values()].find((m) => m.userId === aid);
    const mid = room.rallies.get(pk);
    const existing = mid ? room.messages.find((m) => m.id === mid) : undefined;
    if (existing?.rally && !existing.rally.ended) {
      existing.rally = { ...existing.rally, ended: true, winner: winner?.name ?? "?" };
    }
    room.rallies.delete(pk);
    parryLevel.delete(`${room.id}:${pk}:${authedUser.id}`);
    parryLevel.delete(`${room.id}:${pk}:${aid}`);
    attackCooldownPair.delete(`${room.id}:${aid}:${authedUser.id}`); // let a rematch start at once
    broadcast(io, room);
  });

  socket.on(
    "vote:start",
    ({ itemId, reason, seconds }: { itemId?: string; reason?: string; seconds?: number }) => {
      if (!currentRoom || !authedUser) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      const err = startVote(io, room, String(itemId ?? ""), name, String(reason ?? ""), seconds);
      if (err) hint(err);
    },
  );

  socket.on("vote:cast", ({ tierId }: { tierId?: string }) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    castVote(io, room, authedUser.id, String(tierId ?? ""));
  });

  socket.on("vote:optout", ({ enabled }: { enabled?: boolean }) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    if (enabled) {
      room.voteOptOut.add(authedUser.id);
      // Opting out of an open vote retracts any vote already cast — the toggle is
      // your live participation status.
      if (room.vote && room.vote.phase === "voting") {
        room.vote.votes.delete(authedUser.id);
        room.vote.abstained.delete(authedUser.id);
      }
    } else {
      room.voteOptOut.delete(authedUser.id);
    }
    // If a vote is open, refresh counts and maybe end early now that the set of
    // expected voters changed.
    if (room.vote && room.vote.phase === "voting") {
      broadcastVote(io, room);
      if (expectedAllVoted(room)) endVote(io, room);
    }
  });

  // --- 티어 결정전 ---------------------------------------------------------
  socket.on("decision:propose", ({ itemId, tierId }: { itemId?: string; tierId?: string }) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const err = proposeDecision(io, room, String(itemId ?? ""), String(tierId ?? ""), authedUser.id, name);
    if (err) hint(err);
  });

  socket.on("decision:join", ({ side, role }: { side?: string; role?: string }) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const s: DecisionSide = side === "con" ? "con" : "pro";
    const r: DecisionRole = role === "spectator" ? "spectator" : "fighter";
    if (r === "fighter") {
      const until = room.duelBans.get(authedUser.id);
      if (until && until > Date.now()) {
        hint(`결투가 금지되어 있어요. 관전은 가능해요. (${leftLabel(until)} 남음)`);
        return;
      }
    }
    joinDecision(io, room, authedUser.id, s, r);
  });

  socket.on("decision:leave", () => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    leaveDecision(io, room, authedUser.id);
  });

  // Owner/admin manually pins a placed item to its current tier for a chosen time.
  socket.on("tier:lock", ({ itemId, seconds }: { itemId?: string; seconds?: number }) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    if (memberRole(room, authedUser.id, authedUser.isAdmin) === "member") {
      hint("고정은 방장 또는 관리자만 가능해요.");
      return;
    }
    const id = String(itemId ?? "");
    const item = room.state.items[id];
    if (!item) return;
    const tierId = tierOfItem(room.state, id);
    if (!tierId) {
      hint("티어에 배치된 아이템만 고정할 수 있어요.");
      return;
    }
    const secs = Math.max(10, Math.min(7 * 24 * 3600, Math.floor(Number(seconds))));
    if (!Number.isFinite(secs)) return;
    room.tierLocks.set(id, { tierId, until: Date.now() + secs * 1000, dur: secs * 1000, reason: "admin" });
    const dur = secs >= 3600 ? `${Math.round(secs / 3600)}시간` : secs >= 60 ? `${Math.round(secs / 60)}분` : `${secs}초`;
    pushMessage(
      room,
      message("system", `${name} 님이 '${item.name}'을(를) ${tierMeta(room, tierId).label} 티어로 ${dur} 고정했습니다.`, "action"),
    );
    broadcast(io, room);
  });

  // Owner/admin lifts a decision-match tier lock early.
  socket.on("decision:unlock", ({ itemId }: { itemId?: string }) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    if (memberRole(room, authedUser.id, authedUser.isAdmin) === "member") {
      hint("고정 해제는 방장 또는 관리자만 가능해요.");
      return;
    }
    const id = String(itemId ?? "");
    if (!room.tierLocks.has(id)) return;
    room.tierLocks.delete(id);
    const itemName = room.state.items[id]?.name ?? "아이템";
    pushMessage(room, message("system", `🔓 ${name} 님이 '${itemName}' 고정을 해제했습니다.`, "action"));
    broadcast(io, room);
  });

  // Admins promote/demote other accounts. Env admins are locked (cannot be
  // demoted); you cannot change your own admin status.
  socket.on(
    "admin:grant",
    ({ targetUserId, makeAdmin }: { targetUserId?: string; makeAdmin?: boolean }) => {
      if (!authedUser?.isAdmin) {
        hint("관리자만 사용할 수 있어요.");
        return;
      }
      const targetId = String(targetUserId ?? "");
      const row = targetId ? getUserById(targetId) : null;
      if (!row) return;
      if (targetId === authedUser.id) {
        hint("자기 자신의 관리자 권한은 변경할 수 없어요.");
        return;
      }
      if (isAdminUsername(row.username)) {
        hint("환경설정으로 지정된 관리자는 해제할 수 없어요.");
        return;
      }
      const next = makeAdmin ? 1 : 0;
      updateUser(targetId, { is_admin: next });

      // Reflect the change live: update each room's badge + tell the target's
      // sockets (identified by the member map) to re-fetch their own account.
      for (const room of rooms.values()) {
        let changed = false;
        for (const [sid, m] of room.members) {
          if (m.userId === targetId) {
            m.isAdmin = next === 1;
            changed = true;
            io.to(sid).emit("auth:refresh");
          }
        }
        if (changed) broadcast(io, room);
      }
    },
  );

  socket.on(
    "room:create",
    ({ title, isPublic, image }: { title?: string; isPublic?: boolean; image?: string }) => {
      if (!authedUser) {
        socket.emit("room:error", "멀티플레이는 로그인이 필요합니다.");
        return;
      }
      const id = makeRoomCode();
      const cleanTitle =
        (title ?? "").trim().slice(0, 40) || `${authedUser.nickname}의 방`;
      const room: Room = {
        id,
        title: cleanTitle,
        ownerId: authedUser.id,
        createdAt: Date.now(),
        isPublic: isPublic !== false, // default public
        image: typeof image === "string" ? image.slice(0, 600_000) : "",
        state: createInitialState(),
        messages: [],
        history: [],
        members: new Map(),
        mutes: new Map(),
        placeBans: new Map(),
        voteBans: new Map(),
        duelBans: new Map(),
        muteDur: new Map(),
        placeBanDur: new Map(),
        voteBanDur: new Map(),
        duelBanDur: new Map(),
        vote: null,
        voteTimer: null,
        voteOptOut: new Set(),
        rallies: new Map(),
        decision: null,
        decisionTimer: null,
        tierLocks: new Map(),
        decisionCooldown: new Map(),
      };
      rooms.set(id, room);
      saveRoom(room); // persist immediately so the visibility flag survives
      enter(id);
      broadcastRoomList(io);
    },
  );

  socket.on("room:join", ({ roomId }: { roomId?: string }) => {
    const id = String(roomId ?? "").toUpperCase().trim();
    if (!rooms.has(id)) {
      socket.emit("room:error", "존재하지 않는 방 코드입니다.");
      return;
    }
    enter(id);
  });

  socket.on("rooms:list", () => {
    socket.emit("rooms:list", roomList());
  });

  socket.on("room:rename", ({ roomId, title }: { roomId?: string; title?: string }) => {
    const room = rooms.get(String(roomId ?? "").toUpperCase().trim());
    if (!room) return;
    if (!authedUser || (room.ownerId !== authedUser.id && !authedUser.isAdmin)) {
      socket.emit("room:error", "내가 만든 방만 관리할 수 있어요.");
      return;
    }
    room.title = (title ?? "").trim().slice(0, 40) || room.title;
    saveRoom(room);
    if (room.members.size > 0) io.to(room.id).emit("room:state", snapshot(room));
    broadcastRoomList(io);
  });

  socket.on("room:setImage", ({ roomId, image }: { roomId?: string; image?: string }) => {
    const room = rooms.get(String(roomId ?? "").toUpperCase().trim());
    if (!room) return;
    if (!authedUser || (room.ownerId !== authedUser.id && !authedUser.isAdmin)) {
      socket.emit("room:error", "내가 만든 방만 관리할 수 있어요.");
      return;
    }
    room.image = typeof image === "string" ? image.slice(0, 600_000) : "";
    saveRoom(room);
    broadcastRoomList(io);
  });

  socket.on("room:delete", ({ roomId }: { roomId?: string }) => {
    const id = String(roomId ?? "").toUpperCase().trim();
    const room = rooms.get(id);
    if (!room) return;
    // Owners can delete their own rooms; admins can delete any room.
    if (!authedUser || (room.ownerId !== authedUser.id && !authedUser.isAdmin)) {
      socket.emit("room:error", "이 방을 삭제할 권한이 없어요.");
      return;
    }
    io.to(id).emit("room:closed", id);
    io.in(id).socketsLeave(id);
    if (room.voteTimer) clearTimeout(room.voteTimer);
    clearDecision(room);
    rooms.delete(id);
    deleteRoom(id);
    broadcastRoomList(io);
  });

  socket.on("room:moderate", (payload: ModeratePayload) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const actorRole = memberRole(room, authedUser.id, authedUser.isAdmin);
    const { action, targetUserId, seconds } = payload;

    // Attack: owner/admin OR anyone who unlocked the "attack" perk (a harmless
    // 3s visual gag), on anyone but themselves.
    if (action === "attack") {
      const canAttack = actorRole !== "member" || authedUser.unlocked.includes("attack");
      if (!canAttack) {
        hint("연습 결투 권한이 없어요. 계정 관리에서 코드로 잠금 해제하세요.");
        return;
      }
      const tid = String(targetUserId ?? "");
      if (!tid || tid === authedUser.id) {
        hint("자기 자신과는 연습할 수 없어요.");
        return;
      }
      const duelBanUntil = room.duelBans.get(authedUser.id);
      if (duelBanUntil && duelBanUntil > Date.now()) {
        hint(`결투가 금지되어 있어요. (${leftLabel(duelBanUntil)} 남음)`);
        return;
      }
      const tgt = [...room.members.values()].find((m) => m.userId === tid);
      const now = Date.now();
      // Cooldown is per (attacker → this target): you can't re-hit the same
      // person for 10s, but you can attack someone else.
      const cdKey = `${room.id}:${authedUser.id}:${tid}`;
      const cdLeft = ATTACK_COOLDOWN_MS - (now - (attackCooldownPair.get(cdKey) ?? 0));
      if (cdLeft > 0) {
        hint(`${tgt?.name ?? "참가자"}와의 연습 쿨타임 ${Math.ceil(cdLeft / 1000)}초 남았어요.`);
        return;
      }
      attackCooldownPair.set(cdKey, now);
      // Fresh attack → reset both players' per-person difficulty for this rally.
      const pk = pairKey(authedUser.id, tid);
      parryLevel.set(`${room.id}:${pk}:${authedUser.id}`, 0);
      parryLevel.set(`${room.id}:${pk}:${tid}`, 0);
      for (const [sid, m] of room.members) {
        if (m.userId === tid)
          io.to(sid).emit("room:attacked", {
            by: name,
            byUserId: authedUser.id,
            parryable: true,
            level: 0,
          });
      }
      // Start a fresh rally card for this pair (updates in place from here on).
      const rallyMsg = message(name, "", "action");
      rallyMsg.rally = buildRally(room, pk, 1);
      pushMessage(room, rallyMsg);
      room.rallies.set(pk, rallyMsg.id);
      broadcast(io, room);
      return;
    }

    // The rest (clearChat / kick / mute / banPlace / banVote) is owner/admin only.
    if (actorRole === "member") {
      hint("권한이 없어요. (방장 또는 관리자만 가능)");
      return;
    }

    if (action === "clearChat") {
      room.messages = [];
      pushMessage(room, message("system", `${name} 님이 채팅을 정리했습니다.`, "system"));
      broadcast(io, room);
      return;
    }

    // Participant-targeted actions require outranking the target.
    const target = [...room.members.values()].find((m) => m.userId === targetUserId);
    if (!targetUserId) return;
    const targetIsAdmin = target
      ? target.isAdmin
      : getUserById(targetUserId)?.is_admin === 1;
    const targetRole = memberRole(room, targetUserId, targetIsAdmin ?? false);
    if (
      targetUserId === authedUser.id ||
      rolePriority(actorRole) <= rolePriority(targetRole)
    ) {
      hint("이 참가자에게는 권한을 사용할 수 없어요.");
      return;
    }
    const targetName = target?.name ?? "참가자";
    // Duration in seconds (0 lifts). Capped at 12h. Supports sub-minute bans.
    const secs = Math.max(0, Math.min(720 * 60, Math.floor(Number(seconds ?? 0))));
    const durationMs = secs * 1000;
    const durationLabel = secs % 60 === 0 ? `${secs / 60}분` : `${secs}초`;

    // Announce an applied timed ban to everyone as a center-top game effect.
    const announceBan = (banAction: "mute" | "banPlace" | "banVote" | "banDuel") => {
      if (secs <= 0) return;
      io.to(room.id).emit("room:moderation", {
        action: banAction,
        targetName,
        by: name,
        durationLabel,
      });
    };

    if (action === "kick") {
      for (const [sid, m] of room.members) {
        if (m.userId === targetUserId) {
          io.to(sid).emit("room:kicked", room.id);
          io.sockets.sockets.get(sid)?.leave(room.id);
          room.members.delete(sid);
        }
      }
      pushMessage(room, message("system", `${targetName} 님을 내보냈습니다.`, "system"));
      broadcast(io, room);
      return;
    }

    if (action === "mute") {
      if (secs === 0) {
        room.mutes.delete(targetUserId);
        room.muteDur.delete(targetUserId);
        pushMessage(room, message("system", `${targetName} 님의 채팅 금지를 해제했습니다.`, "system"));
      } else {
        room.mutes.set(targetUserId, Date.now() + durationMs);
        room.muteDur.set(targetUserId, durationMs);
        pushMessage(room, message("system", `${targetName} 님을 ${durationLabel}간 채팅 금지했습니다.`, "system"));
        announceBan("mute");
      }
      broadcast(io, room);
      return;
    }

    if (action === "banPlace") {
      if (secs === 0) {
        room.placeBans.delete(targetUserId);
        room.placeBanDur.delete(targetUserId);
        pushMessage(room, message("system", `${targetName} 님의 배치 금지를 해제했습니다.`, "system"));
      } else {
        room.placeBans.set(targetUserId, Date.now() + durationMs);
        room.placeBanDur.set(targetUserId, durationMs);
        pushMessage(room, message("system", `${targetName} 님을 ${durationLabel}간 배치 금지했습니다.`, "system"));
        announceBan("banPlace");
      }
      broadcast(io, room);
      return;
    }

    if (action === "banVote") {
      if (secs === 0) {
        room.voteBans.delete(targetUserId);
        room.voteBanDur.delete(targetUserId);
        pushMessage(room, message("system", `${targetName} 님의 투표 금지를 해제했습니다.`, "system"));
      } else {
        room.voteBans.set(targetUserId, Date.now() + durationMs);
        room.voteBanDur.set(targetUserId, durationMs);
        pushMessage(room, message("system", `${targetName} 님을 ${durationLabel}간 투표 금지했습니다.`, "system"));
        announceBan("banVote");
      }
      broadcast(io, room);
      return;
    }

    if (action === "banDuel") {
      if (secs === 0) {
        room.duelBans.delete(targetUserId);
        room.duelBanDur.delete(targetUserId);
        pushMessage(room, message("system", `${targetName} 님의 결투 금지를 해제했습니다.`, "system"));
      } else {
        room.duelBans.set(targetUserId, Date.now() + durationMs);
        room.duelBanDur.set(targetUserId, durationMs);
        pushMessage(room, message("system", `${targetName} 님을 ${durationLabel}간 결투 금지했습니다.`, "system"));
        announceBan("banDuel");
      }
      broadcast(io, room);
      return;
    }
  });

  socket.on("tier:action", (action: Action) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const bannedUntil = room.placeBans.get(authedUser.id);
    if (bannedUntil && bannedUntil > Date.now()) {
      hint(`배치가 금지되어 있어요. (${leftLabel(bannedUntil)} 남음)`);
      socket.emit("room:state", snapshot(room)); // revert optimistic change
      return;
    }
    // A decision-locked item is pinned to its tier — block moves away from it.
    if (action.type === "moveItem" || action.type === "removeItem") {
      const lockedId = action.type === "moveItem" ? action.itemId : action.id;
      const lock = itemLock(room, lockedId);
      if (lock && !(action.type === "moveItem" && action.targetListId === lock.tierId)) {
        hint(`고정된 아이템이에요. (${leftLabel(lock.until)} 남음)`);
        socket.emit("room:state", snapshot(room)); // revert optimistic change
        return;
      }
    }
    // Capture the source tier *before* the move so history shows from → to.
    const moveFrom = action.type === "moveItem" ? tierOfItem(room.state, action.itemId) : null;
    // Stamp the actor on add / move actions (the client can't be trusted to).
    const stamped =
      action.type === "addItem" || action.type === "addItems"
        ? { ...action, by: name }
        : action.type === "moveItem"
          ? { ...action, by: name, ts: Date.now() }
          : action;
    room.state = tierListReducer(room.state, stamped);
    // Record tier moves (into a real tier, not the pool) for the 변경 이력 panel.
    if (action.type === "moveItem") {
      recordHistory(room, action.itemId, moveFrom, action.targetListId, name, authedUser.id);
    }
    broadcast(io, room);
  });

  socket.on("chat:send", ({ text }: { text?: string }) => {
    if (!currentRoom || !authedUser) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const mutedUntil = room.mutes.get(authedUser.id);
    if (mutedUntil && mutedUntil > Date.now()) {
      hint(`채팅이 금지되어 있어요. (${leftLabel(mutedUntil)} 남음)`);
      return;
    }
    const trimmed = String(text ?? "").slice(0, 500).trim();
    if (!trimmed) return;
    if (trimmed.startsWith("/")) {
      runCommand(room, trimmed);
      return;
    }
    pushMessage(room, message(name, trimmed, "user", authedUser.id));
    broadcast(io, room);
  });

  socket.on("room:leave", leave);
  socket.on("disconnect", leave);
});

const PORT = Number(process.env.PORT ?? 5811);
httpServer.listen(PORT, () => {
  console.log(`tier-list realtime server listening on http://localhost:${PORT}`);
});
