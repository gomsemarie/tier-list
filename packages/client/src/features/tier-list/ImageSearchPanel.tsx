import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchImageCandidates, type ImageCandidate } from "@/lib/imageSearch";

type ImageSearchPanelProps = {
  /** Prefilled query (usually the item name); auto-searched on mount. */
  initialQuery: string;
  onSelect: (url: string) => void;
  onBack: () => void;
};

/**
 * Shared image-search view: search a term and pick a result. Rendered inline
 * inside a dialog (not its own modal), so it composes safely with the parent
 * dialog. Mounted only while searching.
 */
export function ImageSearchPanel({
  initialQuery,
  onSelect,
  onBack,
}: ImageSearchPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<ImageCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (term: string) => {
    const q = term.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const list = await searchImageCandidates(q);
      setCandidates(list);
      if (list.length === 0) setError("이미지를 찾지 못했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery.trim()) void run(initialQuery);
  }, [initialQuery, run]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="뒤로"
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <Input
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
        />
        <Button
          type="button"
          variant="outline"
          disabled={loading || !query.trim()}
          onClick={() => void run(query)}
        >
          {loading ? <Loader2 className="animate-spin" /> : <Search />}
          검색
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {loading && candidates.length === 0 && (
          <div className="col-span-full flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
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
            <span className="block overflow-hidden rounded-lg border-2 border-transparent transition-colors group-hover:border-foreground">
              <img
                src={c.thumbnail}
                alt={c.title}
                className="aspect-square w-full object-cover"
              />
            </span>
            <span className="mt-1 block truncate text-xs">{c.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
