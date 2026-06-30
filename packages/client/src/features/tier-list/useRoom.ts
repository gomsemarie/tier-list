import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type { TierListController } from "./controller";
import type { Action } from "@tier-list/shared";
import type {
  AuthResult,
  AuthUser,
  CodeInfo,
  Hint,
  IssueCodeResult,
  ModerateActionType,
  ModerationEffect,
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
} from "@tier-list/shared";

// By default we connect to the *same origin* the page was served from and let
// Vite proxy /socket.io → the realtime server. So only the web port (5810) has
// to be reachable (LAN IP, a single port-forward, or one tunnel) — no separate
// 5811. Set VITE_SERVER_URL to point the socket at a different origin instead.
const SERVER_URL = import.meta.env.VITE_SERVER_URL as string | undefined;

const TOKEN_KEY = "tier-list:token";
const USER_KEY = "tier-list:auth-user";
const VOTE_OPTOUT_KEY = "tier-list:vote-optout";

function loadOptOut(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(VOTE_OPTOUT_KEY) === "1";
}

function loadToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
function loadUser(): AuthUser | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}
function saveAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export type ServerStatus = "connecting" | "online" | "offline";

export type RoomConnection = {
  status: ServerStatus;
  room: RoomSnapshot | null;
  roomList: RoomSummary[];
  authUser: AuthUser | null;
  activeVote: VoteSnapshot | null;
  /** In-progress tier decision match (signup → duel → result), or null. */
  activeDecision: DecisionSnapshot | null;
  proposeDecision: (itemId: string, tierId: string) => void;
  joinDecision: (side: DecisionSide, role: DecisionRole) => void;
  leaveDecision: () => void;
  /** Owner/admin pins a placed item to its tier for `seconds`. */
  lockTier: (itemId: string, seconds: number) => void;
  /** Owner/admin lifts a tier lock early. */
  unlockTier: (itemId: string) => void;
  /** Set briefly when this client is attacked by an admin (drives the hit effect). */
  attack: { by: string; byUserId?: string; parryable: boolean; level?: number; at: number } | null;
  clearAttack: () => void;
  /** The attacked user reflects the attack back to its sender. */
  parryAttack: (attackerId: string, escalate: boolean) => void;
  /** Report that this player got hit (parry missed) — finalizes the rally. */
  rallyHit: (attackerId: string) => void;
  /** Set briefly when anyone is timed-banned (drives the center-top game effect). */
  moderation: (ModerationEffect & { at: number }) | null;
  clearModeration: () => void;
  /** When true, vote overlays are suppressed and this user is excluded from votes. */
  voteOptOut: boolean;
  setVoteOptOut: (enabled: boolean) => void;
  hints: Hint[];
  error: string | null;
  login: (username: string, password: string) => Promise<AuthResult>;
  register: (
    username: string,
    nickname: string,
    password: string,
  ) => Promise<AuthResult>;
  logout: () => void;
  updateProfile: (patch: ProfileUpdate) => Promise<UpdateResult>;
  fetchUser: (id: string) => Promise<PublicUser | null>;
  redeemCode: (code: string) => Promise<RedeemResult>;
  equipPerk: (patch: { frame?: string; scStyle?: string; specBuff?: string; combatBuff?: string }) => Promise<UpdateResult>;
  fetchCodes: () => Promise<CodeInfo[]>;
  issueCode: (perks: string[]) => Promise<IssueCodeResult>;
  createRoom: (title: string, isPublic?: boolean, image?: string, coupang?: boolean) => void;
  setRoomImage: (roomId: string, image: string) => void;
  setRoomCoupang: (roomId: string, enabled: boolean) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  listRooms: () => void;
  renameRoom: (roomId: string, title: string) => void;
  deleteRoom: (roomId: string) => void;
  sendChat: (text: string) => void;
  startVote: (itemId: string, reason: string, seconds: number) => void;
  castVote: (tierId: string) => void;
  moderate: (
    action: ModerateActionType,
    targetUserId?: string,
    seconds?: number,
  ) => void;
  grantAdmin: (targetUserId: string, makeAdmin: boolean) => void;
  clearError: () => void;
  /** Controller bound to the room (dispatches over the socket). Null when not in a room. */
  controller: TierListController | null;
};

/** Emit an event and await its ack, resolving to `fallback` if the server is silent. */
function emitAck<T>(
  socket: Socket | null,
  event: string,
  payload: unknown,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve(fallback);
      return;
    }
    let done = false;
    const finish = (value: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), 5000);
    socket.emit(event, payload, (res: T) => finish(res));
  });
}

/**
 * Connects to the optional realtime server. When the server is unreachable,
 * status becomes "offline" and multiplayer is simply unavailable (single-player
 * still works). Multiplayer requires a logged-in account; joining a room exposes
 * a controller that syncs over the socket. Survives transient disconnects by
 * re-authenticating and re-joining the room on reconnect.
 */
export function useRoom(): RoomConnection {
  const socketRef = useRef<Socket | null>(null);
  // Remembers the room to re-join after a reconnect; null when not in a room.
  const joinedRef = useRef<{ id: string } | null>(null);
  // True once the server confirmed we're in the room (room:state received).
  const joinedConfirmedRef = useRef(false);

  const [status, setStatus] = useState<ServerStatus>("connecting");
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [roomList, setRoomList] = useState<RoomSummary[]>([]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(loadUser);
  const [activeVote, setActiveVote] = useState<VoteSnapshot | null>(null);
  const [activeDecision, setActiveDecision] = useState<DecisionSnapshot | null>(null);
  const [attack, setAttack] = useState<
    { by: string; byUserId?: string; parryable: boolean; level?: number; at: number } | null
  >(null);
  const [moderation, setModeration] = useState<
    (ModerationEffect & { at: number }) | null
  >(null);
  const [voteOptOut, setVoteOptOutState] = useState<boolean>(loadOptOut);
  const optOutRef = useRef(voteOptOut);
  const [hints, setHints] = useState<Hint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const opts = {
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      timeout: 4000,
    };
    // No URL → same origin (Vite proxies /socket.io to the realtime server).
    const socket = SERVER_URL ? io(SERVER_URL, opts) : io(opts);
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("online");
      const token = loadToken();
      if (token) {
        // Re-establish this socket's authentication, then re-join the room.
        socket.emit("auth:resume", { token }, (res: AuthResult) => {
          if (res.ok) {
            saveAuth(res.token, res.user);
            setAuthUser(res.user);
            const joined = joinedRef.current;
            if (joined) {
              socket.emit("room:join", { roomId: joined.id });
              if (optOutRef.current) socket.emit("vote:optout", { enabled: true });
            }
          } else {
            clearAuth();
            setAuthUser(null);
          }
        });
      }
      socket.emit("rooms:list");
    });
    socket.on("connect_error", () => {
      setStatus(joinedRef.current ? "connecting" : "offline");
    });
    socket.on("disconnect", () => {
      setStatus(joinedRef.current ? "connecting" : "offline");
    });
    socket.io.on("reconnect_failed", () => {
      setStatus("offline");
      joinedRef.current = null;
      joinedConfirmedRef.current = false;
      setRoom(null);
    });

    socket.on("room:state", (snapshot: RoomSnapshot) => {
      setRoom(snapshot);
      joinedRef.current = { id: snapshot.id };
      joinedConfirmedRef.current = true;
    });
    socket.on("rooms:list", (list: RoomSummary[]) => setRoomList(list));
    socket.on("room:closed", (roomId: string) => {
      if (joinedRef.current?.id === roomId) {
        joinedRef.current = null;
        joinedConfirmedRef.current = false;
        setRoom(null);
        setActiveVote(null);
        setActiveDecision(null);
        setError("방이 삭제되었습니다.");
      }
    });
    socket.on("room:kicked", (roomId: string) => {
      if (joinedRef.current?.id === roomId) {
        joinedRef.current = null;
        joinedConfirmedRef.current = false;
        setRoom(null);
        setActiveVote(null);
        setActiveDecision(null);
        setHints([]);
        setError("방에서 내보내졌습니다.");
      }
    });
    socket.on("room:vote", (snap: VoteSnapshot | null) => {
      setActiveVote(snap);
    });
    socket.on("room:decision", (snap: DecisionSnapshot | null) => {
      setActiveDecision(snap);
    });
    socket.on(
      "room:attacked",
      (
        payload:
          | string
          | { by?: string; byUserId?: string; parryable?: boolean; level?: number },
      ) => {
        if (typeof payload === "string") {
          setAttack({ by: payload || "누군가", parryable: false, at: Date.now() });
        } else {
          setAttack({
            by: String(payload?.by || "누군가"),
            byUserId: payload?.byUserId,
            parryable: !!payload?.parryable,
            level: payload?.level ?? 0,
            at: Date.now(),
          });
        }
      },
    );
    socket.on("room:moderation", (e: ModerationEffect) => {
      setModeration({ ...e, at: Date.now() });
    });
    socket.on("room:hint", (hint: Hint) => {
      setHints((prev) => [...prev, hint].slice(-30));
    });
    // Our account's admin status changed (granted/revoked) — re-fetch it.
    socket.on("auth:refresh", () => {
      const token = loadToken();
      if (!token) return;
      socket.emit("auth:resume", { token }, (res: AuthResult) => {
        if (res.ok) {
          saveAuth(res.token, res.user);
          setAuthUser(res.user);
        }
      });
    });
    socket.on("room:error", (message: string) => {
      setError(message);
      // A join that was never confirmed (e.g. duplicate entry rejected) should
      // not leave a stale rejoin target that keeps retrying on reconnect.
      if (!joinedConfirmedRef.current) joinedRef.current = null;
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    const res = await emitAck<AuthResult>(
      socketRef.current,
      "auth:login",
      { username, password },
      { ok: false, error: "서버에 연결할 수 없어요." },
    );
    if (res.ok) {
      saveAuth(res.token, res.user);
      setAuthUser(res.user);
    }
    return res;
  }, []);

  const register = useCallback(
    async (username: string, nickname: string, password: string) => {
      setError(null);
      const res = await emitAck<AuthResult>(
        socketRef.current,
        "auth:register",
        { username, nickname, password },
        { ok: false, error: "서버에 연결할 수 없어요." },
      );
      if (res.ok) {
        saveAuth(res.token, res.user);
        setAuthUser(res.user);
      }
      return res;
    },
    [],
  );

  const logout = useCallback(() => {
    const token = loadToken();
    socketRef.current?.emit("auth:logout", { token });
    clearAuth();
    setAuthUser(null);
    joinedRef.current = null;
    socketRef.current?.emit("room:leave");
    setRoom(null);
    setHints([]);
  }, []);

  const updateProfile = useCallback(async (patch: ProfileUpdate) => {
    const res = await emitAck<UpdateResult>(
      socketRef.current,
      "auth:update",
      patch,
      { ok: false, error: "서버에 연결할 수 없어요." },
    );
    if (res.ok) {
      const token = loadToken();
      if (token) saveAuth(token, res.user);
      setAuthUser(res.user);
    }
    return res;
  }, []);

  const fetchUser = useCallback(
    (id: string) =>
      emitAck<PublicUser | null>(socketRef.current, "user:get", { id }, null),
    [],
  );

  const redeemCode = useCallback(async (code: string) => {
    const res = await emitAck<RedeemResult>(
      socketRef.current,
      "perk:redeem",
      { code },
      { ok: false, error: "서버에 연결할 수 없어요." },
    );
    if (res.ok) {
      const token = loadToken();
      if (token) saveAuth(token, res.user);
      setAuthUser(res.user);
    }
    return res;
  }, []);

  const equipPerk = useCallback(
    async (patch: { frame?: string; scStyle?: string; specBuff?: string; combatBuff?: string }) => {
      const res = await emitAck<UpdateResult>(
        socketRef.current,
        "perk:equip",
        patch,
        { ok: false, error: "서버에 연결할 수 없어요." },
      );
      if (res.ok) {
        const token = loadToken();
        if (token) saveAuth(token, res.user);
        setAuthUser(res.user);
      }
      return res;
    },
    [],
  );

  const fetchCodes = useCallback(
    () => emitAck<CodeInfo[]>(socketRef.current, "codes:list", {}, []),
    [],
  );

  const issueCode = useCallback(
    (perks: string[]) =>
      emitAck<IssueCodeResult>(socketRef.current, "codes:issue", { perks }, {
        ok: false,
        error: "서버에 연결할 수 없어요.",
      }),
    [],
  );

  const createRoom = useCallback((title: string, isPublic = true, image = "", coupang = false) => {
    setError(null);
    socketRef.current?.emit("room:create", { title, isPublic, image, coupang });
    if (optOutRef.current) socketRef.current?.emit("vote:optout", { enabled: true });
  }, []);

  const setRoomImage = useCallback((roomId: string, image: string) => {
    socketRef.current?.emit("room:setImage", { roomId, image });
  }, []);

  const setRoomCoupang = useCallback((roomId: string, enabled: boolean) => {
    socketRef.current?.emit("room:setCoupang", { roomId, enabled });
  }, []);

  const joinRoom = useCallback((roomId: string) => {
    setError(null);
    joinedRef.current = { id: roomId.toUpperCase() };
    socketRef.current?.emit("room:join", { roomId });
    if (optOutRef.current) socketRef.current?.emit("vote:optout", { enabled: true });
  }, []);

  const setVoteOptOut = useCallback((enabled: boolean) => {
    optOutRef.current = enabled;
    setVoteOptOutState(enabled);
    if (typeof localStorage !== "undefined")
      localStorage.setItem(VOTE_OPTOUT_KEY, enabled ? "1" : "0");
    socketRef.current?.emit("vote:optout", { enabled });
  }, []);

  const leaveRoom = useCallback(() => {
    joinedRef.current = null;
    joinedConfirmedRef.current = false;
    socketRef.current?.emit("room:leave");
    setRoom(null);
    setActiveVote(null);
    setActiveDecision(null);
    setHints([]);
  }, []);

  const listRooms = useCallback(() => {
    socketRef.current?.emit("rooms:list");
  }, []);

  const renameRoom = useCallback((roomId: string, title: string) => {
    socketRef.current?.emit("room:rename", { roomId, title });
  }, []);

  const deleteRoom = useCallback((roomId: string) => {
    socketRef.current?.emit("room:delete", { roomId });
  }, []);

  const sendChat = useCallback((text: string) => {
    socketRef.current?.emit("chat:send", { text });
  }, []);

  const clearAttack = useCallback(() => setAttack(null), []);
  const parryAttack = useCallback((attackerId: string, escalate: boolean) => {
    socketRef.current?.emit("attack:parry", { attackerId, escalate });
  }, []);
  const rallyHit = useCallback((attackerId: string) => {
    socketRef.current?.emit("attack:hit", { attackerId });
  }, []);
  const clearModeration = useCallback(() => setModeration(null), []);

  const startVote = useCallback(
    (itemId: string, reason: string, seconds: number) => {
      socketRef.current?.emit("vote:start", { itemId, reason, seconds });
    },
    [],
  );

  const castVote = useCallback((tierId: string) => {
    socketRef.current?.emit("vote:cast", { tierId });
  }, []);

  const proposeDecision = useCallback((itemId: string, tierId: string) => {
    socketRef.current?.emit("decision:propose", { itemId, tierId });
  }, []);
  const joinDecision = useCallback((side: DecisionSide, role: DecisionRole) => {
    socketRef.current?.emit("decision:join", { side, role });
  }, []);
  const leaveDecision = useCallback(() => {
    socketRef.current?.emit("decision:leave");
  }, []);
  const lockTier = useCallback((itemId: string, seconds: number) => {
    socketRef.current?.emit("tier:lock", { itemId, seconds });
  }, []);
  const unlockTier = useCallback((itemId: string) => {
    socketRef.current?.emit("decision:unlock", { itemId });
  }, []);

  const moderate = useCallback(
    (action: ModerateActionType, targetUserId?: string, seconds?: number) => {
      socketRef.current?.emit("room:moderate", { action, targetUserId, seconds });
    },
    [],
  );

  const grantAdmin = useCallback((targetUserId: string, makeAdmin: boolean) => {
    socketRef.current?.emit("admin:grant", { targetUserId, makeAdmin });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const controller = useMemo<TierListController | null>(() => {
    if (!room) return null;
    const emit = (action: Action) => socketRef.current?.emit("tier:action", action);
    return {
      state: room.state,
      addItem: (name, imageUrl) => emit({ type: "addItem", name, imageUrl }),
      addItems: (entries) => emit({ type: "addItems", entries }),
      updateItem: (id, patch) => emit({ type: "updateItem", id, patch }),
      removeItem: (id) => emit({ type: "removeItem", id }),
      moveItem: (itemId, targetListId, targetIndex) =>
        emit({ type: "moveItem", itemId, targetListId, targetIndex }),
      addTier: () => emit({ type: "addTier" }),
      removeTier: (tierId) => emit({ type: "removeTier", tierId }),
      updateTier: (tierId, patch) => emit({ type: "updateTier", tierId, patch }),
      reset: () => emit({ type: "reset" }),
    };
  }, [room]);

  return {
    status,
    room,
    roomList,
    authUser,
    activeVote,
    activeDecision,
    proposeDecision,
    joinDecision,
    leaveDecision,
    lockTier,
    unlockTier,
    attack,
    clearAttack,
    parryAttack,
    rallyHit,
    moderation,
    clearModeration,
    voteOptOut,
    setVoteOptOut,
    hints,
    error,
    login,
    register,
    logout,
    updateProfile,
    fetchUser,
    redeemCode,
    equipPerk,
    fetchCodes,
    issueCode,
    createRoom,
    setRoomImage,
    setRoomCoupang,
    joinRoom,
    leaveRoom,
    listRooms,
    renameRoom,
    deleteRoom,
    sendChat,
    startVote,
    castVote,
    moderate,
    grantAdmin,
    clearError,
    controller,
  };
}
