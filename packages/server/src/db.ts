import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

import type { ChatMessage, TierListState } from "@tier-list/shared";

export type PersistedRoom = {
  id: string;
  title: string;
  ownerId: string;
  state: TierListState;
  messages: ChatMessage[];
  createdAt: number;
  isPublic: boolean;
  /** Optional room cover image (data URL); "" when unset. */
  image: string;
};

const DB_PATH = process.env.DB_PATH ?? "data/rooms.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT '',
    owner_id   TEXT NOT NULL DEFAULT '',
    state      TEXT NOT NULL,
    messages   TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )
`);

// Migrate older databases (pre title/owner/created_at columns).
const existing = new Set(
  (db.prepare("PRAGMA table_info(rooms)").all() as { name: string }[]).map(
    (c) => c.name,
  ),
);
if (!existing.has("title"))
  db.exec("ALTER TABLE rooms ADD COLUMN title TEXT NOT NULL DEFAULT ''");
if (!existing.has("owner_id"))
  db.exec("ALTER TABLE rooms ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''");
if (!existing.has("created_at"))
  db.exec("ALTER TABLE rooms ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0");
// Existing rooms default to public (preserves the pre-feature lobby behaviour).
if (!existing.has("is_public"))
  db.exec("ALTER TABLE rooms ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1");
if (!existing.has("image"))
  db.exec("ALTER TABLE rooms ADD COLUMN image TEXT NOT NULL DEFAULT ''");

const upsert = db.prepare(`
  INSERT INTO rooms (id, title, owner_id, state, messages, created_at, updated_at, is_public, image)
  VALUES (@id, @title, @owner_id, @state, @messages, @created_at, @updated_at, @is_public, @image)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    owner_id = excluded.owner_id,
    state = excluded.state,
    messages = excluded.messages,
    updated_at = excluded.updated_at,
    is_public = excluded.is_public,
    image = excluded.image
`);

export function saveRoom(room: PersistedRoom): void {
  upsert.run({
    id: room.id,
    title: room.title,
    owner_id: room.ownerId,
    state: JSON.stringify(room.state),
    messages: JSON.stringify(room.messages),
    created_at: room.createdAt,
    updated_at: Date.now(),
    is_public: room.isPublic ? 1 : 0,
    image: room.image ?? "",
  });
}

export function loadAllRooms(): PersistedRoom[] {
  const rows = db
    .prepare(
      "SELECT id, title, owner_id, state, messages, created_at, is_public, image FROM rooms",
    )
    .all() as {
    id: string;
    title: string;
    owner_id: string;
    state: string;
    messages: string;
    created_at: number;
    is_public: number;
    image: string | null;
  }[];
  return rows.flatMap((r) => {
    try {
      return [
        {
          id: r.id,
          title: r.title,
          ownerId: r.owner_id,
          state: JSON.parse(r.state) as TierListState,
          messages: JSON.parse(r.messages) as ChatMessage[],
          createdAt: r.created_at,
          isPublic: r.is_public !== 0,
          image: r.image ?? "",
        },
      ];
    } catch {
      return [];
    }
  });
}

export function deleteRoom(id: string): void {
  db.prepare("DELETE FROM rooms WHERE id = ?").run(id);
}

// --- Accounts (username + password) -----------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    username   TEXT NOT NULL UNIQUE,
    nickname   TEXT NOT NULL DEFAULT '',
    avatar     TEXT NOT NULL DEFAULT '',
    salt       TEXT NOT NULL,
    hash       TEXT NOT NULL,
    is_admin   INTEGER NOT NULL DEFAULT 0,
    unlocked   TEXT NOT NULL DEFAULT '[]',
    frame      TEXT NOT NULL DEFAULT '',
    sc_style   TEXT NOT NULL DEFAULT '',
    spec_buff  TEXT NOT NULL DEFAULT '',
    combat_buff TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )
`);

// Migrate older user tables (additive columns).
const userCols = new Set(
  (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map(
    (c) => c.name,
  ),
);
if (userCols.size > 0 && !userCols.has("is_admin"))
  db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
if (userCols.size > 0 && !userCols.has("unlocked"))
  db.exec("ALTER TABLE users ADD COLUMN unlocked TEXT NOT NULL DEFAULT '[]'");
if (userCols.size > 0 && !userCols.has("frame"))
  db.exec("ALTER TABLE users ADD COLUMN frame TEXT NOT NULL DEFAULT ''");
if (userCols.size > 0 && !userCols.has("sc_style"))
  db.exec("ALTER TABLE users ADD COLUMN sc_style TEXT NOT NULL DEFAULT ''");
if (userCols.size > 0 && !userCols.has("spec_buff"))
  db.exec("ALTER TABLE users ADD COLUMN spec_buff TEXT NOT NULL DEFAULT ''");
if (userCols.size > 0 && !userCols.has("combat_buff"))
  db.exec("ALTER TABLE users ADD COLUMN combat_buff TEXT NOT NULL DEFAULT ''");
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

export type UserRow = {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  salt: string;
  hash: string;
  is_admin: number;
  unlocked: string;
  frame: string;
  sc_style: string;
  spec_buff: string;
  combat_buff: string;
  created_at: number;
};

export function createUser(
  row: Omit<UserRow, "unlocked" | "frame" | "sc_style" | "spec_buff" | "combat_buff"> &
    Partial<Pick<UserRow, "unlocked" | "frame" | "sc_style" | "spec_buff" | "combat_buff">>,
): void {
  db.prepare(
    `INSERT INTO users (id, username, nickname, avatar, salt, hash, is_admin, unlocked, frame, sc_style, spec_buff, combat_buff, created_at)
     VALUES (@id, @username, @nickname, @avatar, @salt, @hash, @is_admin, @unlocked, @frame, @sc_style, @spec_buff, @combat_buff, @created_at)`,
  ).run({ unlocked: "[]", frame: "", sc_style: "", spec_buff: "", combat_buff: "", ...row });
}

/** Look up by the case-insensitive login id. */
export function getUserByUsername(username: string): UserRow | null {
  return (
    (db
      .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
      .get(username) as UserRow | undefined) ?? null
  );
}

export function getUserById(id: string): UserRow | null {
  return (
    (db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
      | UserRow
      | undefined) ?? null
  );
}

export function updateUser(
  id: string,
  patch: Partial<
    Pick<
      UserRow,
      "nickname" | "avatar" | "salt" | "hash" | "is_admin" | "unlocked" | "frame" | "sc_style" | "spec_buff" | "combat_buff"
    >
  >,
): void {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;
  const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`).run({ id, ...patch });
}

export function createSession(token: string, userId: string): void {
  db.prepare(
    "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
  ).run(token, userId, Date.now());
}

export function getSessionUserId(token: string): string | null {
  const row = db
    .prepare("SELECT user_id FROM sessions WHERE token = ?")
    .get(token) as { user_id: string } | undefined;
  return row?.user_id ?? null;
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// --- Redeem codes (seeded legacy + admin-issued, with usage tracking) --------

db.exec(`
  CREATE TABLE IF NOT EXISTS codes (
    code        TEXT PRIMARY KEY,
    perks       TEXT NOT NULL,
    single_use  INTEGER NOT NULL DEFAULT 1,
    used_by     TEXT,
    used_at     INTEGER,
    created_at  INTEGER NOT NULL
  )
`);

export type CodeRow = {
  code: string;
  perks: string; // JSON string[] of perk ids
  single_use: number;
  used_by: string | null;
  used_at: number | null;
  created_at: number;
};

/** Insert a code if it doesn't already exist (used to seed legacy codes). */
export function seedCode(
  code: string,
  perkIds: string[],
  singleUse: boolean,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO codes (code, perks, single_use, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(code, JSON.stringify(perkIds), singleUse ? 1 : 0, Date.now());
}

export function createCode(
  code: string,
  perkIds: string[],
  singleUse: boolean,
): void {
  db.prepare(
    `INSERT INTO codes (code, perks, single_use, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(code, JSON.stringify(perkIds), singleUse ? 1 : 0, Date.now());
}

export function getCode(code: string): CodeRow | null {
  return (
    (db.prepare("SELECT * FROM codes WHERE code = ?").get(code) as
      | CodeRow
      | undefined) ?? null
  );
}

export function markCodeUsed(code: string, userId: string): void {
  db.prepare(
    "UPDATE codes SET used_by = ?, used_at = ? WHERE code = ?",
  ).run(userId, Date.now(), code);
}

export function listCodes(): CodeRow[] {
  return db
    .prepare("SELECT * FROM codes ORDER BY created_at DESC")
    .all() as CodeRow[];
}
