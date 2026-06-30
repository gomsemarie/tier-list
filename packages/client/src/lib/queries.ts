/**
 * TanStack Query bindings for the app's HTTP request/response calls.
 *
 * Only genuinely RESTful (fetch-once) data lives here — image search and
 * OpenGraph previews. Live room/board/chat/vote/decision state is realtime
 * (Socket.IO) and intentionally NOT modelled as queries: a query cache can't
 * represent server-pushed, bidirectional multiplayer state.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";

import {
  searchAllImageCandidates,
  searchImageCandidates,
  type ImageCandidate,
} from "./imageSearch";
import { fetchOg, type OgCard } from "./og";

const FRESH = 5 * 60_000; // image results don't change minute-to-minute

/** First-source-wins image candidates for a name (imperative: fetchQuery). */
export const imageSearchQuery = (query: string) =>
  queryOptions({
    queryKey: ["imageSearch", "first", query.trim()] as const,
    queryFn: (): Promise<ImageCandidate[]> => searchImageCandidates(query),
    staleTime: FRESH,
  });

/** "더보기" — every source in parallel, combined + deduped. */
export const imageSearchAllQuery = (query: string) =>
  queryOptions({
    queryKey: ["imageSearch", "all", query.trim()] as const,
    queryFn: (): Promise<ImageCandidate[]> => searchAllImageCandidates(query),
    staleTime: FRESH,
  });

/** OpenGraph card for a related link (declarative; never rejects). */
export function useOg(url: string) {
  return useQuery({
    queryKey: ["og", url] as const,
    queryFn: (): Promise<OgCard> => fetchOg(url),
    staleTime: Infinity, // a page's OG tags are effectively immutable per session
  });
}
