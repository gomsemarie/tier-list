import type { TierListState } from "./types";

export type ChatKind = "user" | "system" | "action" | "announce" | "super";

export type ChatMessage = {
  id: string;
  author: string;
  /** Stable account id of the sender — lets the UI show the sender's *current*
   *  nickname/avatar/frame even after a rename. Absent on system messages. */
  authorId?: string;
  text: string;
  ts: number;
  kind: ChatKind;
  /** Superchat: equipped style id + author cosmetics, snapshotted at send time. */
  style?: string;
  avatar?: string;
  frame?: string;
  /** Attack/parry rally — one message that updates in place. aLevel/bLevel are
   *  each player's *own* difficulty (how many inner-reflects they're taking).
   *  When `ended`, `winner` is the survivor's name (the other got hit). */
  rally?: { a: string; b: string; aLevel: number; bLevel: number; count: number; ended?: boolean; winner?: string };
};

/** Effective role within a room. Admin outranks owner outranks member. */
export type MemberRole = "admin" | "owner" | "member";

export function rolePriority(role: MemberRole): number {
  return role === "admin" ? 2 : role === "owner" ? 1 : 0;
}

export type Member = {
  id: string;
  name: string;
  avatar?: string;
  /** Account login id of the member, for the profile overlay. */
  username?: string;
  /** Stable account id (used as the moderation target). */
  userId?: string;
  role?: MemberRole;
  /** Equipped avatar frame id (perk), shown on the member's avatar. */
  frame?: string;
  /** Epoch ms until which this member is chat-muted / placement-banned / vote-banned. */
  mutedUntil?: number;
  placeBannedUntil?: number;
  voteBannedUntil?: number;
  /** Original duration (ms) of each active ban, for the depleting timer ring. */
  mutedFor?: number;
  placeBannedFor?: number;
  voteBannedFor?: number;
};

export type ModerateActionType =
  | "kick"
  | "mute"
  | "banPlace"
  | "banVote"
  | "clearChat"
  | "attack";

/** Broadcast to every room member when a timed ban is applied — drives the
 *  center-top game effect (not a toast). */
export type ModerationEffect = {
  action: "mute" | "banPlace" | "banVote";
  targetName: string;
  by: string;
  /** Human-readable duration, formatted server-side (e.g. "30초", "10분"). */
  durationLabel: string;
};

/** A moderation request from an owner/admin. `seconds: 0` lifts a timed ban. */
export type ModeratePayload = {
  action: ModerateActionType;
  targetUserId?: string;
  seconds?: number;
};

/** A recent tier change for the live "변경 이력" panel (in-memory, not persisted). */
export type ChangeEntry = {
  id: string;
  actor: string;
  /** Stable account id of the mover — lets the UI show their *current* nickname. */
  actorId?: string;
  itemName: string;
  toLabel: string;
  toColor: string;
  ts: number;
};

/** Full room snapshot broadcast to every member on any change. */
export type RoomSnapshot = {
  id: string;
  title: string;
  ownerId: string;
  state: TierListState;
  messages: ChatMessage[];
  members: Member[];
  /** Recent tier moves (most recent first); optional for back-compat. */
  history?: ChangeEntry[];
  /** Items pinned to a tier by a won decision match (itemId → lock); drives the
   *  board's 🔒 highlight and blocks D&D/vote/re-propose until `until`. */
  locks?: Record<string, { tierId: string; label: string; color: string; until: number }>;
};

/** Lightweight room info for the lobby list. */
export type RoomSummary = {
  id: string;
  title: string;
  ownerId: string;
  ownerName?: string;
  itemCount: number;
  tierCount: number;
  memberCount: number;
  /** Public rooms appear in the lobby; private rooms are code-join only. */
  isPublic: boolean;
  /** Optional room cover image (data URL). */
  image?: string;
  createdAt: number;
  updatedAt: number;
};

/** Private, client-only feedback (help text, command errors) shown to the sender. */
export type Hint = {
  id: string;
  text: string;
  ts: number;
};

// --- 인정협회 티어 투표 (recognition-association vote) ----------------------

export type Voter = {
  userId: string;
  name: string;
  avatar?: string;
  frame?: string;
};

export type VoteOption = { tierId: string; label: string; color: string };
export type VoteTally = { tierId: string; voters: Voter[] };

/** Special "vote" value meaning abstain (무효표) — counts as voted, no tier. */
export const VOTE_ABSTAIN = "__abstain__";

export type VoteOutcome = "moved" | "revote" | "void" | "keep";

/** Result shown during the "result" phase. */
export type VoteResult = {
  outcome: VoteOutcome;
  /** For `moved`: the winning tier. */
  toLabel?: string;
  toColor?: string;
  /** Per-tier vote breakdown. */
  counts: { tierId: string; label: string; color: string; count: number }[];
  /** For `revote`: number of tiers in the next round. */
  nextCount?: number;
};

/** Live state of a tier vote, broadcast to every room member. */
export type VoteSnapshot = {
  id: string;
  itemId: string;
  itemName: string;
  itemImage?: string | null;
  /** Why the vote was opened. */
  reason: string;
  /** Who opened the vote. */
  starter: string;
  /** The item's tier when the vote started ("현재 티어"). */
  currentTier: { label: string; color: string } | null;
  options: VoteOption[];
  tally: VoteTally[];
  /** Members who abstained (무효표) — excluded from the expected-voter count. */
  abstainers: Voter[];
  /** Epoch ms when the round ends. */
  endsAt: number;
  /** Round length (ms) — for the progress bar. */
  durationMs: number;
  round: number;
  /** Number of members expected to vote (for the "all voted → end early"). */
  totalVoters: number;
  /** "voting" while open; "result" while showing the outcome / re-vote notice. */
  phase: "voting" | "result";
  result?: VoteResult;
};

// --- 티어 결정전 (skill-based tier decision match) ---------------------------

export type DecisionSide = "pro" | "con";
export type DecisionRole = "fighter" | "spectator";
export type DecisionPhase = "signup" | "duel" | "resolved" | "canceled";

export type DuelParticipant = { userId: string; name: string; avatar?: string; frame?: string };

/** One side's roster: 결투(fighters) + 관전(spectators). */
export type DecisionRoster = { fighters: DuelParticipant[]; spectators: DuelParticipant[] };

/** Live state of a decision match, broadcast to every room member (room:decision). */
export type DecisionSnapshot = {
  id: string;
  itemId: string;
  itemName: string;
  itemImage?: string | null;
  /** Tier the 찬성 side wants to move the item into. */
  targetTier: VoteOption;
  /** The item's tier when proposed (null = unplaced). */
  currentTier: { label: string; color: string } | null;
  proposer: string;
  phase: DecisionPhase;
  /** Signup deadline (signup phase). */
  endsAt: number;
  durationMs: number;
  /** 찬성 (move) / 반대 (keep) rosters. */
  pro: DecisionRoster;
  con: DecisionRoster;
  /** Quorum progress: unique participants vs members needed (⌈room/2⌉). */
  participants: number;
  needed: number;
  /** P1: 1:1 duel — the two champions actually fighting. */
  duel?: { pro: string; con: string };
  result?: {
    winner: DecisionSide;
    /** "moved" → locked into target tier; "kept" → defender held, re-propose banned briefly. */
    outcome: "moved" | "kept";
    toLabel?: string;
    toColor?: string;
    /** Lock expiry (moved) — board highlight countdown. */
    lockUntil?: number;
  };
};
