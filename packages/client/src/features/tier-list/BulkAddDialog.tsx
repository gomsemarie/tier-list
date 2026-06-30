import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImageOff, Loader2, Plus, SkipForward } from "lucide-react";

import type { Item } from "@tier-list/shared";
import { type ImageCandidate } from "@/lib/imageSearch";
import { imageSearchAllQuery, imageSearchQuery } from "@/lib/queries";
import { checkDuplicate } from "@/lib/similarity";

type BulkAddDialogProps = {
  /** Current items — used to block/warn on duplicate names. */
  existing: Item[];
  onSubmit: (entries: { name: string; imageUrl: string | null }[]) => void;
  onClose: () => void;
};

/** Paste names → optionally search/verify/pick an image for each → add them all. */
export function BulkAddDialog({ existing, onSubmit, onClose }: BulkAddDialogProps) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [step, setStep] = useState<"names" | "images">("names");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (step === "names") textRef.current?.focus();
  }, [step]);

  const names = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // --- per-item image step (iterates the screened `queue`, not raw `names`) ---
  const [idx, setIdx] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);
  const picks = useRef<(string | null)[]>([]);
  const [cands, setCands] = useState<ImageCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setCands([]);
    try {
      setCands(await qc.fetchQuery(imageSearchQuery(q)));
    } catch {
      setCands([]);
    } finally {
      setLoading(false);
    }
  }, [qc]);

  /** Drop duplicate names (block) and confirm similar ones (warn), comparing
   *  against existing items AND names already accepted in this batch. Returns
   *  the names cleared to add, or null if the user canceled at the warning. */
  const screen = (list: string[]): string[] | null => {
    const pool: Item[] = [...existing];
    const accepted: string[] = [];
    const blocked: string[] = [];
    const warned: string[] = [];
    for (const name of list) {
      const v = checkDuplicate(name, pool);
      if (v.kind === "block") {
        blocked.push(`${name} ≈ ${v.match.name}`);
        continue;
      }
      if (v.kind === "warn") warned.push(`${name} ≈ ${v.match.name}`);
      accepted.push(name);
      pool.push({ id: `__new__${name}`, name } as Item); // catch in-batch dupes too
    }
    if (blocked.length) {
      window.alert(`이미 같거나 매우 비슷한 항목이 있어 제외했어요:\n\n${blocked.join("\n")}`);
    }
    if (warned.length && !window.confirm(`비슷한 항목이 있어요. 그래도 추가할까요?\n\n${warned.join("\n")}`)) {
      return null;
    }
    return accepted;
  };

  const goImages = () => {
    const q = screen(names);
    if (!q || q.length === 0) return;
    setQueue(q);
    picks.current = q.map(() => null);
    setIdx(0);
    setStep("images");
    void search(q[0]);
  };

  const goto = (next: number) => {
    setIdx(next);
    void search(queue[next]);
  };

  const choose = (url: string | null) => {
    picks.current[idx] = url;
    if (idx + 1 < queue.length) goto(idx + 1);
    else onSubmit(queue.map((name, i) => ({ name, imageUrl: picks.current[i] ?? null })));
  };

  const loadMore = async () => {
    setMore(true);
    try {
      const all = await qc.fetchQuery(imageSearchAllQuery(queue[idx]));
      setCands((cur) => {
        const seen = new Set(cur.map((c) => c.thumbnail));
        return [...cur, ...all.filter((c) => !seen.has(c.thumbnail))];
      });
    } finally {
      setMore(false);
    }
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/60" />
      <div
        className="fixed top-1/2 left-1/2 z-[61] flex max-h-[84vh] w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[10px] border border-[#242a3a] bg-[#13161D] p-5"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,.6)", animation: "popIn .16s ease both" }}
      >
        {step === "names" ? (
          <>
            <div className="mb-1 text-[16px] font-extrabold text-[#EDEAE2]">대상 일괄 추가</div>
            <div className="mb-3.5 text-[12px] text-[#8A8F9C]">한 줄에 하나씩 이름을 입력하세요.</div>

            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"신라면\n진라면\n너구리\n짜파게티"}
              className="h-[140px] w-full resize-none rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-3 py-2.5 text-[13px] leading-[1.6] text-[#EDEAE2] outline-none focus:border-[#6366F1]"
            />

            <div className="my-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[#8A8F9C]">미리보기 {names.length}개:</span>
              {names.slice(0, 8).map((n, i) => (
                <span key={`${n}-${i}`} className="rounded-[5px] bg-[#1B1F27] px-2 py-[3px] text-[11px] font-bold text-[#C4C8D2]">
                  {n}
                </span>
              ))}
              {names.length > 8 && <span className="text-[11px] text-[#8A8F9C]">+{names.length - 8}</span>}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={names.length === 0}
                onClick={() => {
                  const q = screen(names);
                  if (q && q.length) onSubmit(q.map((name) => ({ name, imageUrl: null })));
                }}
                className="h-10 flex-1 rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[13px] font-semibold text-[#C4C8D2] disabled:opacity-40"
              >
                이미지 없이 추가
              </button>
              <button
                type="button"
                disabled={names.length === 0}
                onClick={goImages}
                className="h-10 flex-[1.4] rounded-[6px] bg-[#6366F1] text-[13px] font-bold text-white disabled:opacity-40"
              >
                이미지 선택하며 추가 →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                aria-label="이전"
                disabled={idx === 0}
                onClick={() => goto(idx - 1)}
                className="grid size-8 shrink-0 place-items-center rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[#C4C8D2] disabled:opacity-30"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-[#8A8F9C]">
                  이미지 선택 {idx + 1} / {queue.length}
                </div>
                <div className="truncate text-[15px] font-extrabold text-[#EDEAE2]">{queue[idx]}</div>
              </div>
              <button
                type="button"
                onClick={() => choose(null)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border border-[#2A303C] bg-[#171B22] px-2.5 text-[12px] font-semibold text-[#C4C8D2]"
              >
                {idx + 1 < queue.length ? <SkipForward className="size-3.5" /> : <ImageOff className="size-3.5" />}
                {idx + 1 < queue.length ? "건너뛰기" : "이미지 없이 완료"}
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {loading && (
                <div className="col-span-full flex justify-center py-10">
                  <Loader2 className="size-6 animate-spin text-[#8A8F9C]" />
                </div>
              )}
              {!loading && cands.length === 0 && (
                <div className="col-span-full py-10 text-center text-[12px] text-[#8A8F9C]">
                  이미지를 찾지 못했습니다. 건너뛰거나 더보기를 눌러보세요.
                </div>
              )}
              {cands.map((c) => (
                <button
                  key={c.thumbnail}
                  type="button"
                  onClick={() => choose(c.thumbnail)}
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

            <button
              type="button"
              onClick={loadMore}
              disabled={more || loading}
              className="mt-2.5 flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[13px] font-semibold text-[#C4C8D2] disabled:opacity-50"
            >
              {more ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              더보기 (다른 소스)
            </button>
          </>
        )}
      </div>
    </>
  );
}
