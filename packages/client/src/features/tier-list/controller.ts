import type { Item, TierListState } from "@tier-list/shared";

/**
 * The mutation surface the board UI depends on. Implemented two ways:
 * locally (single-player, localStorage) or over a socket (multiplayer room).
 */
export type TierListController = {
  state: TierListState;
  addItem(name: string, imageUrl: string | null): void;
  addItems(entries: { name: string; imageUrl: string | null }[]): void;
  updateItem(id: string, patch: Partial<Pick<Item, "name" | "imageUrl">>): void;
  removeItem(id: string): void;
  moveItem(itemId: string, targetListId: string, targetIndex: number): void;
  addTier(): void;
  removeTier(tierId: string): void;
  updateTier(
    tierId: string,
    patch: Partial<{ label: string; color: string; epithet: string }>,
  ): void;
  reset(): void;
};
