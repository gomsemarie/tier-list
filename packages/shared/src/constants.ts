/** Special list id for the unranked item pool. */
export const POOL_ID = "pool";

/** Tier label order: S first, then A..Z. */
export const TIER_SEQUENCE = [
  "S",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
];

/** Tierlab tier palette (design tokens), applied by row index (cycles if exceeded). */
export const TIER_COLORS = [
  "#F5B942", // S — 전설 (gold)
  "#FF5C7A", // A — 명작 (rose)
  "#FF9A4D", // B — 수작 (orange)
  "#FFD23F", // C — 평작 (yellow)
  "#3FC7B7", // D — 범작 (teal)
  "#7480A0", // F — 망작 (slate)
  "#A855F7", // + violet
  "#60A5FA", // + blue
  "#F472B6", // + pink
  "#94A3B8", // + gray
];

/** Default grade names (epithet) applied by row index; blank beyond the list. */
export const TIER_EPITHETS = [
  "전설",
  "명작",
  "수작",
  "평작",
  "범작",
  "망작",
  "졸작",
];

export function epithetForIndex(index: number): string {
  return TIER_EPITHETS[index] ?? "";
}

export const DEFAULT_TIER_COUNT = 5;

export const STORAGE_KEY = "tier-list:v2";
