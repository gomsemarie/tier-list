/** One entry in an item's tier-change history. */
export type TierChange = {
  /** Tier label the item moved into. */
  tier: string;
  /** Who moved it. */
  by: string;
  /** Epoch ms. */
  ts: number;
};

export type Item = {
  id: string;
  name: string;
  imageUrl: string | null;
  /** Display name of whoever added the item (multiplayer); optional. */
  addedBy?: string;
  /** Most-recent tier changes (newest last, capped at 10). */
  history?: TierChange[];
};

export type Tier = {
  id: string;
  label: string;
  color: string;
  /** Short grade name shown under the label on the emblem (e.g. S → "전설"). */
  epithet?: string;
};

/** Maps a list id (tier id or POOL_ID) to an ordered list of item ids. */
export type Placement = Record<string, string[]>;

export type TierListState = {
  tiers: Tier[];
  items: Record<string, Item>;
  placement: Placement;
};
