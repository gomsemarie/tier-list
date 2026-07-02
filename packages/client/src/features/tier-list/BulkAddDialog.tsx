import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, ImageOff, Loader2, Plus, SkipForward } from "lucide-react";

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

type Entry = { name: string; kind: "ok" | "warn" | "block"; match?: Item; score: number };

function swatch(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360},40%,46%)`;
}

/** Small preview of an existing item a new name resembles. */
function MatchTile({ item, score }: { item: Item; score: number }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="size-9 shrink-0 overflow-hidden rounded-[4px] border border-[#2A303C]">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-[11px] font-extrabold text-white" style={{ background: swatch(item.name) }}>
            {item.name.slice(0, 2)}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-bold text-[#EDEAE2]">{item.name}</div>
        <div className="text-[10px] text-[#8A8F9C]">유사도 {Math.round(score * 100)}%</div>
      </div>
    </div>
  );
}

/** Paste names → resolve duplicates → optionally pick images → add them all. */
export function BulkAddDialog({ existing, onSubmit, onClose }: BulkAddDialogProps) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [step, setStep] = useState<"names" | "review" | "images">("names");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (step === "names") textRef.current?.focus();
  }, [step]);

  const names = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // --- duplicate review ---
  const [entries, setEntries] = useState<Entry[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [nextMode, setNextMode] = useState<"noimg" | "images">("images");

  // --- per-item image step (iterates the accepted `queue`) ---
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

  /** Classify each (unique) name against existing items + earlier batch names. */
  const analyze = (): Entry[] => {
    const pool: Item[] = [...existing];
    const out: Entry[] = [];
    for (const name of [...new Set(names)]) {
      const v = checkDuplicate(name, pool);
      out.push({ name, kind: v.kind, match: v.kind === "ok" ? undefined : v.match, score: v.kind === "ok" ? 0 : v.score });
      if (v.kind !== "block") pool.push({ id: `__new__${name}`, name } as Item); // catch in-batch dupes
    }
    return out;
  };

  const proceed = (accepted: string[], mode: "noimg" | "images") => {
    if (accepted.length === 0) return;
    if (mode === "noimg") {
      onSubmit(accepted.map((name) => ({ name, imageUrl: null })));
      return;
    }
    setQueue(accepted);
    picks.current = accepted.map(() => null);
    setIdx(0);
    setStep("images");
    void search(accepted[0]);
  };

  const start = (mode: "noimg" | "images") => {
    const es = analyze();
    if (es.some((e) => e.kind !== "ok")) {
      setEntries(es);
      setExcluded(new Set(es.filter((e) => e.kind === "block").map((e) => e.name))); // blocked start excluded
      setNextMode(mode);
      setStep("review");
    } else {
      proceed(es.map((e) => e.name), mode);
    }
  };

  const accepted = entries.filter((e) => e.kind === "ok" || (e.kind === "warn" && !excluded.has(e.name)));

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
                onClick={() => start("noimg")}
                className="h-10 flex-1 rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[13px] font-semibold text-[#C4C8D2] disabled:opacity-40"
              >
                이미지 없이 추가
              </button>
              <button
                type="button"
                disabled={names.length === 0}
                onClick={() => start("images")}
                className="h-10 flex-[1.4] rounded-[6px] bg-[#6366F1] text-[13px] font-bold text-white disabled:opacity-40"
              >
                이미지 선택하며 추가 →
              </button>
            </div>
          </>
        ) : step === "review" ? (
          <>
            <div className="mb-1 text-[16px] font-extrabold text-[#EDEAE2]">중복 확인</div>
            <div className="mb-3 text-[12px] text-[#8A8F9C]">겹치거나 비슷한 이름이 있어요. 추가할 항목을 정하세요.</div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {entries
                .filter((e) => e.kind !== "ok" && e.match)
                .map((e) => {
                  const blocked = e.kind === "block";
                  const on = !blocked && !excluded.has(e.name);
                  return (
                    <div
                      key={e.name}
                      className="flex items-center gap-2 rounded-[8px] border px-2.5 py-2"
                      style={blocked ? { borderColor: "rgba(248,113,113,.4)", background: "rgba(248,113,113,.06)" } : { borderColor: "rgba(245,158,11,.4)", background: "rgba(245,158,11,.06)" }}
                    >
                      <div className="w-[86px] shrink-0 truncate text-[13px] font-bold text-white">{e.name}</div>
                      <span className="shrink-0 text-[12px] text-[#6A707E]">≈</span>
                      <div className="min-w-0 flex-1">{e.match && <MatchTile item={e.match} score={e.score} />}</div>
                      {blocked ? (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-[#F87171]">
                          <Ban className="size-3.5" /> 중복
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setExcluded((s) => {
                              const n = new Set(s);
                              if (n.has(e.name)) n.delete(e.name);
                              else n.add(e.name);
                              return n;
                            })
                          }
                          className="shrink-0 rounded-[5px] border px-2.5 py-1 text-[11px] font-bold"
                          style={on ? { borderColor: "#6366F1", background: "#6366F1", color: "#fff" } : { borderColor: "#2A303C", background: "#0E1117", color: "#8A8F9C" }}
                        >
                          {on ? "추가함" : "제외됨"}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setStep("names")}
                className="h-10 rounded-[6px] border border-[#2A303C] bg-[#171B22] px-4 text-[13px] font-semibold text-[#C4C8D2]"
              >
                뒤로
              </button>
              <button
                type="button"
                disabled={accepted.length === 0}
                onClick={() => proceed(accepted.map((e) => e.name), nextMode)}
                className="h-10 flex-1 rounded-[6px] bg-[#6366F1] text-[13px] font-bold text-white disabled:opacity-40"
              >
                {accepted.length}개 추가 계속
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
