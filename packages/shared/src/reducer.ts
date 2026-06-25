import {
  DEFAULT_TIER_COUNT,
  epithetForIndex,
  POOL_ID,
  TIER_COLORS,
  TIER_SEQUENCE,
} from "./constants";
import type { Item, TierChange, TierListState } from "./types";

export type Action =
  | { type: "addItem"; name: string; imageUrl: string | null; by?: string }
  | { type: "addItems"; entries: { name: string; imageUrl: string | null }[]; by?: string }
  | { type: "updateItem"; id: string; patch: Partial<Pick<Item, "name" | "imageUrl">> }
  | { type: "removeItem"; id: string }
  | {
      type: "moveItem";
      itemId: string;
      targetListId: string;
      targetIndex: number;
      /** Who moved it + when (for tier-change history). */
      by?: string;
      ts?: number;
    }
  | { type: "addTier" }
  | { type: "removeTier"; tierId: string }
  | {
      type: "updateTier";
      tierId: string;
      patch: Partial<{ label: string; color: string; epithet: string }>;
    }
  | { type: "reset" };

function uid(): string {
  // crypto.randomUUID() exists in Node and in *secure* browser contexts
  // (https / localhost) but NOT over plain http on a LAN IP. Fall back to
  // getRandomValues (available in non-secure contexts) to build a UUIDv4.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
    return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function colorForIndex(index: number): string {
  return TIER_COLORS[index % TIER_COLORS.length];
}

export function createInitialState(): TierListState {
  const tiers = Array.from({ length: DEFAULT_TIER_COUNT }, (_, i) => ({
    id: uid(),
    label: TIER_SEQUENCE[i] ?? `T${i + 1}`,
    color: colorForIndex(i),
    epithet: epithetForIndex(i),
  }));
  const placement: TierListState["placement"] = { [POOL_ID]: [] };
  for (const tier of tiers) placement[tier.id] = [];
  return { tiers, items: {}, placement };
}

function findListOf(
  placement: TierListState["placement"],
  itemId: string,
): string | null {
  for (const [listId, ids] of Object.entries(placement)) {
    if (ids.includes(itemId)) return listId;
  }
  return null;
}

/** Pure state transition shared by the single-player client and the room server. */
export function tierListReducer(
  state: TierListState,
  action: Action,
): TierListState {
  switch (action.type) {
    case "addItem": {
      const name = action.name.trim();
      if (!name) return state;
      const item: Item = { id: uid(), name, imageUrl: action.imageUrl, addedBy: action.by };
      return {
        ...state,
        items: { ...state.items, [item.id]: item },
        placement: {
          ...state.placement,
          [POOL_ID]: [...state.placement[POOL_ID], item.id],
        },
      };
    }

    case "addItems": {
      const clean = action.entries
        .map((e) => ({ name: e.name.trim(), imageUrl: e.imageUrl }))
        .filter((e) => e.name);
      if (clean.length === 0) return state;
      const items = { ...state.items };
      const ids: string[] = [];
      for (const entry of clean) {
        const id = uid();
        items[id] = { id, name: entry.name, imageUrl: entry.imageUrl, addedBy: action.by };
        ids.push(id);
      }
      return {
        ...state,
        items,
        placement: {
          ...state.placement,
          [POOL_ID]: [...state.placement[POOL_ID], ...ids],
        },
      };
    }

    case "updateItem": {
      const existing = state.items[action.id];
      if (!existing) return state;
      return {
        ...state,
        items: { ...state.items, [action.id]: { ...existing, ...action.patch } },
      };
    }

    case "removeItem": {
      const items = { ...state.items };
      delete items[action.id];
      const placement: TierListState["placement"] = {};
      for (const [listId, ids] of Object.entries(state.placement)) {
        placement[listId] = ids.filter((x) => x !== action.id);
      }
      return { ...state, items, placement };
    }

    case "moveItem": {
      const sourceListId = findListOf(state.placement, action.itemId);
      if (!sourceListId || !(action.targetListId in state.placement)) return state;

      const placement: TierListState["placement"] = {};
      for (const [listId, ids] of Object.entries(state.placement)) {
        placement[listId] = [...ids];
      }

      const fromIdx = placement[sourceListId].indexOf(action.itemId);
      placement[sourceListId].splice(fromIdx, 1);

      let insertIdx = action.targetIndex;
      if (sourceListId === action.targetListId && fromIdx < action.targetIndex) {
        insertIdx = action.targetIndex - 1;
      }
      insertIdx = Math.max(0, Math.min(insertIdx, placement[action.targetListId].length));
      placement[action.targetListId].splice(insertIdx, 0, action.itemId);

      // Record tier-change history when the item lands in a *different* tier
      // (not on reorder within the same list, and not when moving to the pool).
      const targetTier = state.tiers.find((t) => t.id === action.targetListId);
      if (targetTier && sourceListId !== action.targetListId) {
        const existing = state.items[action.itemId];
        if (existing) {
          const entry: TierChange = {
            tier: targetTier.label,
            by: action.by ?? "",
            ts: action.ts ?? Date.now(),
          };
          const history = [...(existing.history ?? []), entry].slice(-10);
          return {
            ...state,
            placement,
            items: { ...state.items, [action.itemId]: { ...existing, history } },
          };
        }
      }

      return { ...state, placement };
    }

    case "addTier": {
      const index = state.tiers.length;
      const label = TIER_SEQUENCE[index] ?? `T${index + 1}`;
      const tier = {
        id: uid(),
        label,
        color: colorForIndex(index),
        epithet: epithetForIndex(index),
      };
      return {
        ...state,
        tiers: [...state.tiers, tier],
        placement: { ...state.placement, [tier.id]: [] },
      };
    }

    case "removeTier": {
      const tier = state.tiers.find((t) => t.id === action.tierId);
      if (!tier) return state;
      const placement = { ...state.placement };
      const displaced = placement[action.tierId] ?? [];
      delete placement[action.tierId];
      placement[POOL_ID] = [...placement[POOL_ID], ...displaced];
      return {
        ...state,
        tiers: state.tiers.filter((t) => t.id !== action.tierId),
        placement,
      };
    }

    case "updateTier": {
      return {
        ...state,
        tiers: state.tiers.map((t) =>
          t.id === action.tierId ? { ...t, ...action.patch } : t,
        ),
      };
    }

    case "reset":
      return createInitialState();

    default:
      return state;
  }
}
