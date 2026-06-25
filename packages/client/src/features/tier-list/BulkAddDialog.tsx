import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { searchImageCandidates, type ImageCandidate } from "@/lib/imageSearch";
import { findSimilarItems } from "@/lib/similarity";
import { cn } from "@/lib/utils";
import { ImageSearchPanel } from "./ImageSearchPanel";
import type { Item } from "@tier-list/shared";

type Draft = {
  key: string;
  name: string;
  candidates: ImageCandidate[];
  selected: string | null;
  loading: boolean;
};

type Step = "input" | "confirm" | "loading" | "review";

type BulkAddDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (entries: { name: string; imageUrl: string | null }[]) => void;
  /** Existing items, for duplicate warnings on the confirm step. */
  existingItems?: Item[];
};

const MAX_ITEMS = 10;

const STEPS: { id: Step; label: string }[] = [
  { id: "input", label: "입력" },
  { id: "confirm", label: "확인" },
  { id: "loading", label: "불러오기" },
  { id: "review", label: "조율" },
];

/** Split on commas or newlines, trim, drop blanks, de-duplicate (case-insensitive). */
function parseNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function BulkAddDialog({
  open,
  onOpenChange,
  onAdd,
  existingItems = [],
}: BulkAddDialogProps) {
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [confirmNames, setConfirmNames] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("input");
      setText("");
      setConfirmNames([]);
      setDrafts([]);
      setEditingKey(null);
    }
  }, [open]);

  // Advance to review once every image has finished loading.
  useEffect(() => {
    if (step === "loading" && drafts.length > 0 && drafts.every((d) => !d.loading)) {
      setStep("review");
    }
  }, [step, drafts]);

  const names = parseNames(text);

  function goToConfirm() {
    if (names.length === 0) return;
    setConfirmNames(names);
    setStep("confirm");
  }

  function removeConfirm(name: string) {
    setConfirmNames((prev) => prev.filter((n) => n !== name));
  }

  async function startFetch(chosen: string[]) {
    const list: Draft[] = chosen.map((name, i) => ({
      key: `${i}-${name}`,
      name,
      candidates: [],
      selected: null,
      loading: true,
    }));
    setDrafts(list);
    setStep("loading");

    // Throttle: a few workers pull from the queue with a small gap between
    // requests so we don't flood the image API (avoids HTTP 429).
    const CONCURRENCY = 3;
    const GAP_MS = 250;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const fetchOne = async (d: Draft) => {
      try {
        const c = await searchImageCandidates(d.name);
        setDrafts((prev) =>
          prev.map((x) =>
            x.key === d.key
              ? { ...x, candidates: c, selected: c[0]?.thumbnail ?? null, loading: false }
              : x,
          ),
        );
      } catch {
        setDrafts((prev) =>
          prev.map((x) => (x.key === d.key ? { ...x, loading: false } : x)),
        );
      }
    };

    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const d = list[cursor++];
        await fetchOne(d);
        if (cursor < list.length) await sleep(GAP_MS);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker),
    );
  }

  function selectImage(key: string, url: string) {
    setDrafts((prev) => prev.map((x) => (x.key === key ? { ...x, selected: url } : x)));
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((x) => x.key !== key));
  }

  // Result picked from the full-search panel for one item.
  function applySearchResult(url: string) {
    if (!editingKey) return;
    setDrafts((prev) =>
      prev.map((x) => {
        if (x.key !== editingKey) return x;
        const candidates = x.candidates.some((c) => c.thumbnail === url)
          ? x.candidates
          : [{ title: x.name, thumbnail: url }, ...x.candidates];
        return { ...x, candidates, selected: url };
      }),
    );
    setEditingKey(null);
  }

  function handleApply() {
    if (drafts.length === 0) return;
    onAdd(drafts.map((d) => ({ name: d.name, imageUrl: d.selected })));
    onOpenChange(false);
  }

  const doneCount = drafts.filter((d) => !d.loading).length;
  const editingDraft = drafts.find((d) => d.key === editingKey) ?? null;
  const activeStep: Step = editingDraft ? "review" : step;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <p className="label-caps text-muted-foreground">Bulk add</p>
          <DialogTitle className="text-xl">대상 일괄 추가</DialogTitle>
          <DialogDescription>
            {editingDraft
              ? "검색어로 이미지를 찾아 원하는 것을 클릭해 선택하세요."
              : step === "input"
                ? "추가할 대상의 명칭을 쉼표(,)나 줄바꿈으로 구분해 입력하세요."
                : step === "confirm"
                  ? `추가할 대상을 확인하세요. ✕로 뺄 수 있고, 한 번에 최대 ${MAX_ITEMS}개까지 추가됩니다.`
                  : step === "loading"
                    ? "각 대상의 이미지를 불러오는 중입니다."
                    : "각 대상의 이미지를 확인하고, 바꿀 것만 다른 후보로 선택하세요. (기본값: 첫 번째 이미지)"}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <ol className="flex items-center gap-2 text-xs">
          {STEPS.map((s, i) => {
            const idx = STEPS.findIndex((x) => x.id === activeStep);
            const state = i < idx ? "done" : i === idx ? "active" : "todo";
            return (
              <li key={s.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
                    state === "active" && "bg-foreground text-background",
                    state === "done" && "text-foreground",
                    state === "todo" && "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 place-items-center rounded-full text-[10px]",
                      state === "active"
                        ? "bg-background text-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="h-px w-4 bg-border" aria-hidden />
                )}
              </li>
            );
          })}
        </ol>

        {editingDraft ? (
          <ImageSearchPanel
            initialQuery={editingDraft.name}
            onSelect={applySearchResult}
            onBack={() => setEditingKey(null)}
          />
        ) : step === "input" ? (
          <>
            <p className="-mt-1 text-[12px] text-[#8A8F9C]">
              한 줄(또는 쉼표)에 하나씩 이름을 입력하세요.
            </p>
            <textarea
              value={text}
              autoFocus
              placeholder={"신라면\n진라면\n너구리\n짜파게티"}
              onChange={(e) => setText(e.target.value)}
              className="w-full resize-none rounded-md border px-3 py-2.5 text-[13px] leading-relaxed text-[#EDEAE2] outline-none"
              style={{ height: 120, background: "#0E1117", borderColor: "#242a3a" }}
            />
            {names.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[#8A8F9C]">미리보기 {names.length}개:</span>
                {names.slice(0, 12).map((n, i) => (
                  <span
                    key={`${n}-${i}`}
                    className="rounded-[4px] px-2 py-[3px] text-[11px] font-bold"
                    style={{ background: "#1B1F27", color: "#C4C8D2" }}
                  >
                    {n}
                  </span>
                ))}
                {names.length > 12 && (
                  <span className="text-[11px] text-[#6A707E]">+{names.length - 12}</span>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-[38px] rounded-md border px-4 text-[13px] font-semibold text-[#C4C8D2]"
                style={{ background: "#171B22", borderColor: "#2A303C" }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={goToConfirm}
                disabled={names.length === 0}
                className="h-10 rounded-md px-5 text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: "#6366F1" }}
              >
                {names.length > 0 ? `${names.length}개 추가` : "추가"}
              </button>
            </div>
          </>
        ) : step === "confirm" ? (
          (() => {
            const enabledCount = Math.min(confirmNames.length, MAX_ITEMS);
            const over = confirmNames.length > MAX_ITEMS;
            // Best similar existing item per name (within the first MAX_ITEMS).
            const dupByName = new Map<string, string>();
            confirmNames.slice(0, MAX_ITEMS).forEach((n) => {
              const best = findSimilarItems(n, existingItems)[0];
              if (best) dupByName.set(n, best.item.name);
            });
            return (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {enabledCount}
                    <span className="text-muted-foreground"> / {MAX_ITEMS}</span>
                  </span>
                  {over && (
                    <span className="text-xs text-destructive">
                      {MAX_ITEMS}개 초과 — 회색 항목은 제외됩니다
                    </span>
                  )}
                </div>
                {dupByName.size > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber/30 bg-amber/10 p-2.5 text-xs text-amber-fg">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-fg" />
                    <span>
                      <b>{dupByName.size}개</b>가 기존 항목과 비슷해요 (아래 ⚠️ 표시).
                      중복이면 ✕로 제외하세요.
                    </span>
                  </div>
                )}
                <div className="flex max-h-[45vh] flex-wrap content-start gap-2 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3">
                  {confirmNames.length === 0 ? (
                    <p className="m-auto text-sm text-muted-foreground">
                      모두 제거되었습니다. 다시 입력해 주세요.
                    </p>
                  ) : (
                    confirmNames.map((name, i) => {
                      const disabled = i >= MAX_ITEMS;
                      const dup = !disabled ? dupByName.get(name) : undefined;
                      return (
                        <span
                          key={`${name}-${i}`}
                          title={
                            disabled
                              ? `${MAX_ITEMS}개 초과 — 추가되지 않음`
                              : dup
                                ? `기존 '${dup}' 와(과) 비슷함`
                                : name
                          }
                          className={cn(
                            "flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm transition-colors",
                            disabled
                              ? "border-dashed border-border text-muted-foreground line-through opacity-50"
                              : dup
                                ? "border-amber/40 bg-amber/15 text-amber-fg"
                                : "border-border bg-card",
                          )}
                        >
                          {dup && <AlertTriangle className="size-3.5 text-amber-fg" />}
                          {name}
                          <button
                            type="button"
                            aria-label={`${name} 제거`}
                            onClick={() => removeConfirm(name)}
                            className="grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
                <DialogFooter className="sm:justify-between">
                  <Button variant="ghost" onClick={() => setStep("input")}>
                    ← 다시 입력
                  </Button>
                  <Button
                    onClick={() => startFetch(confirmNames.slice(0, MAX_ITEMS))}
                    disabled={enabledCount === 0}
                  >
                    <Search />
                    {enabledCount}개 이미지 불러오기
                  </Button>
                </DialogFooter>
              </>
            );
          })()
        ) : step === "loading" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              이미지 불러오는 중… {doneCount}/{drafts.length}
            </p>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-foreground transition-all duration-300"
                style={{
                  width: `${drafts.length ? (doneCount / drafts.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
              {drafts.map((d) => (
                <div
                  key={d.key}
                  className="flex items-center gap-3 rounded-lg border border-border p-2"
                >
                  <span className="w-16 shrink-0 truncate text-sm font-medium sm:w-24">
                    {d.name}
                  </span>

                  {d.candidates.length > 0 ? (
                    <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5">
                      {d.candidates.map((c) => (
                        <button
                          key={c.thumbnail}
                          type="button"
                          onClick={() => selectImage(d.key, c.thumbnail)}
                          title={c.title}
                          className={cn(
                            "size-12 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                            d.selected === c.thumbnail
                              ? "border-foreground"
                              : "border-transparent hover:border-border",
                          )}
                        >
                          <img
                            src={c.thumbnail}
                            alt={c.title}
                            className="size-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="flex-1 text-xs text-muted-foreground">
                      이미지 없음 — 돋보기로 검색
                    </span>
                  )}

                  <button
                    type="button"
                    title="다른 검색어로 검색"
                    onClick={() => setEditingKey(d.key)}
                    className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Search className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="제거"
                    onClick={() => removeDraft(d.key)}
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={() => setStep("input")}>
                ← 다시 입력
              </Button>
              <Button onClick={handleApply} disabled={drafts.length === 0}>
                {drafts.length}개 추가
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
