import type { Item } from "@tier-list/shared";

/** Strip spaces, lowercase, and drop trailing generic snack words ("…과자"). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(과자|스낵|봉지|오리지널|기획|증량)$/u, "");
}

/** Classic Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0–1 similarity: 1 = identical normalized, 0.9 = one contains the other. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const d = levenshtein(na, nb);
  return 1 - d / Math.max(na.length, nb.length);
}

export type SimilarItem = { item: Item; score: number };

/** Existing items likely to be the same as `name`, best match first. */
export function findSimilarItems(
  name: string,
  items: Item[],
  threshold = 0.6,
): SimilarItem[] {
  return items
    .map((item) => ({ item, score: similarity(name, item.name) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
