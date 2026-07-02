/** A logged-in account as seen by its owner (includes the login id). */
export type AuthUser = {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
  /** Global moderator: can delete any room, clear chat, moderate anyone. */
  isAdmin: boolean;
  /** Unlocked perk ids (superchat styles, frames). */
  unlocked: string[];
  /** Equipped avatar frame id (perk). */
  frame?: string;
  /** Equipped superchat style id. */
  scStyle?: string;
  /** Spectator buff contributed to one's team in a 결정전 ("" = none). */
  specBuff?: string;
  /** Combat buff a fighter brings into a 결정전 ("" = none). */
  combatBuff?: string;
  /** Consumable Tetris item carried into a game, used once via hotkey ("" = none). */
  tetrisItem?: string;
};

/** Public-facing user info shown in the profile overlay (no private data). */
export type PublicUser = {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
  isAdmin?: boolean;
  frame?: string;
};

/** Ack for redeeming a code. */
export type RedeemResult =
  | { ok: true; user: AuthUser; granted: string[] }
  | { ok: false; error: string };

/** One redeemable code as shown to admins. */
export type CodeInfo = {
  code: string;
  /** Human-readable perk names granted by this code. */
  perks: string[];
  /** Single-use issued codes track their redeemer; reusable codes stay null. */
  singleUse: boolean;
  /** Nickname of who redeemed it (single-use only), else null. */
  usedBy: string | null;
  createdAt: number;
};

/** Admin request to issue a new single-use code granting the given perk ids. */
export type IssueCodePayload = { perks: string[] };
export type IssueCodeResult =
  | { ok: true; code: CodeInfo }
  | { ok: false; error: string };

/** Ack payload for login / register / resume. */
export type AuthResult =
  | { ok: true; token: string; user: AuthUser }
  | { ok: false; error: string };

/** Fields editable in account management (all optional). */
export type ProfileUpdate = {
  nickname?: string;
  avatar?: string;
  /** New password; requires `currentPassword` to be correct. */
  password?: string;
  currentPassword?: string;
};

export type UpdateResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };
