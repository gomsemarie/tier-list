import { useEffect, useMemo, useReducer } from "react";

import { STORAGE_KEY } from "@tier-list/shared";
import type { TierListController } from "./controller";
import { createInitialState, tierListReducer } from "@tier-list/shared";
import type { TierListState } from "@tier-list/shared";

function loadState(): TierListState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as TierListState;
    if (!parsed.tiers || !parsed.items || !parsed.placement) {
      return createInitialState();
    }
    return parsed;
  } catch {
    return createInitialState();
  }
}

/** Single-player controller: local reducer + localStorage persistence. */
export function useLocalTierList(): TierListController {
  const [state, dispatch] = useReducer(tierListReducer, undefined, loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return useMemo(
    () => ({
      state,
      addItem: (name, imageUrl) => dispatch({ type: "addItem", name, imageUrl }),
      addItems: (entries) => dispatch({ type: "addItems", entries }),
      updateItem: (id, patch) => dispatch({ type: "updateItem", id, patch }),
      removeItem: (id) => dispatch({ type: "removeItem", id }),
      moveItem: (itemId, targetListId, targetIndex) =>
        dispatch({ type: "moveItem", itemId, targetListId, targetIndex, by: "나", ts: Date.now() }),
      addTier: () => dispatch({ type: "addTier" }),
      removeTier: (tierId) => dispatch({ type: "removeTier", tierId }),
      updateTier: (tierId, patch) => dispatch({ type: "updateTier", tierId, patch }),
      reset: () => dispatch({ type: "reset" }),
    }),
    [state],
  );
}
