import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Search } from "lucide-react";

import { type ImageCandidate } from "@/lib/imageSearch";
import { imageSearchAllQuery, imageSearchQuery } from "@/lib/queries";

type ImageSearchPanelProps = {
  /** Prefilled query (usually the item name); auto-searched on mount. */
  initialQuery: string;
  onSelect: (url: string) => void;
  onClose: () => void;
};

/** Search a term → pick an image. Modal styled to match the dark handoff. */
export function ImageSearchPanel({ initialQuery, onSelect, onClose }: ImageSearchPanelProps) {
  const qc = useQueryClient();
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<ImageCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setMore(true);
    try {
      const all = await qc.fetchQuery(imageSearchAllQuery(q));
      setCandidates((cur) => {
        const seen = new Set(cur.map((c) => c.thumbnail));
        return [...cur, ...all.filter((c) => !seen.has(c.thumbnail))];
      });
    } finally {
      setMore(false);
    }
  }, [query, qc]);

  const run = useCallback(async (term: string) => {
    const q = term.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const list = await qc.fetchQuery(imageSearchQuery(q));
      setCandidates(list);
      if (list.length === 0) setError("이미지를 찾지 못했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [qc]);

  useEffect(() => {
    if (initialQuery.trim()) void run(initialQuery);
  }, [initialQuery, run]);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[70] bg-black/60" />
      <div
        className="fixed top-1/2 left-1/2 z-[71] flex max-h-[80vh] w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[10px] border border-[#242a3a] bg-[#13161D] p-5"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,.6)", animation: "popIn .16s ease both" }}
      >
        <div className="mb-3.5 flex items-center gap-2">
          <button
            type="button"
            aria-label="뒤로"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[#C4C8D2]"
          >
            <ArrowLeft className="size-4" />
          </button>
          <input
            value={query}
            autoFocus
            placeholder="검색어"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void run(query);
              }
            }}
            className="h-[38px] flex-1 rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-3 text-[13px] text-[#EDEAE2] outline-none focus:border-[#6366F1]"
          />
          <button
            type="button"
            disabled={loading || !query.trim()}
            onClick={() => void run(query)}
            className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-[6px] border border-[#2A303C] bg-[#171B22] px-3 text-[13px] font-semibold text-[#C4C8D2] disabled:opacity-40"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            검색
          </button>
        </div>

        {error && <p className="mb-2 text-[12px] text-[#F87171]">{error}</p>}

        <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {loading && candidates.length === 0 && (
            <div className="col-span-full flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-[#8A8F9C]" />
            </div>
          )}
          {candidates.map((c) => (
            <button
              key={c.thumbnail}
              type="button"
              onClick={() => onSelect(c.thumbnail)}
              title={c.description ? `${c.title} — ${c.description}` : c.title}
              className="group text-left focus-visible:outline-none"
            >
              <span className="block overflow-hidden rounded-[6px] border-2 border-transparent transition-colors group-hover:border-[#6366F1]">
                <img src={c.thumbnail} alt={c.title} className="aspect-square w-full object-cover" />
              </span>
              <span className="mt-1 block truncate text-[11px] text-[#C4C8D2]">{c.title}</span>
            </button>
          ))}
        </div>

        {candidates.length > 0 && (
          <button
            type="button"
            onClick={loadMore}
            disabled={more}
            className="mt-2.5 flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[13px] font-semibold text-[#C4C8D2] disabled:opacity-50"
          >
            {more ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            더보기 (다른 소스)
          </button>
        )}
      </div>
    </>
  );
}
