import { useLayoutEffect, useRef, useState } from "react";
import { Landmark, Link2, Lock, Pencil, Plus, ShoppingCart, Swords, Trash2, Unlock, X } from "lucide-react";

import type { ChangeEntry, Item, Member, Tier } from "@tier-list/shared";
import { useOg } from "@/lib/queries";

function swatch(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360},40%,46%)`;
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간`;
  return `${Math.floor(s / 86400)}일`;
}

const W = 264;

const LOCK_DURATIONS = [
  { label: "1분", s: 60 },
  { label: "10분", s: 600 },
  { label: "1시간", s: 3600 },
  { label: "6시간", s: 21600 },
  { label: "24시간", s: 86400 },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** One related link rendered as an OpenGraph card (thumbnail + title + domain). */
function LinkCard({ url, onRemove }: { url: string; onRemove?: () => void }) {
  const { data: og } = useOg(url);
  const host = hostOf(url);
  return (
    <div className="group/lc relative flex overflow-hidden rounded-[6px] border border-[#2A303C] bg-[#171B22]">
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex min-w-0 flex-1 gap-2 transition-colors hover:bg-[#1C212B]"
      >
        {og?.image ? (
          <img src={og.image} alt="" className="size-[52px] shrink-0 object-cover" />
        ) : (
          <div className="grid size-[52px] shrink-0 place-items-center bg-[#0E1117] text-[#5A6070]">
            <Link2 className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1 py-1.5 pr-2">
          <div className="truncate text-[11px] font-bold text-[#E6E9EF]">{og?.title ?? host}</div>
          {og?.description && (
            <div className="truncate text-[10px] text-[#8A8F9C]">{og.description}</div>
          )}
          <div className="truncate text-[9px] text-[#5A6070]">{og?.siteName ?? host}</div>
        </div>
      </a>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="링크 삭제"
          className="absolute top-1 right-1 hidden size-5 place-items-center rounded bg-black/60 text-[#C4C8D2] group-hover/lc:grid hover:text-white"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/** Tier labels can be up to 4 chars — shrink the font so they fit one line. */
function labelFont(label: string): number {
  const n = [...label].length;
  return n <= 1 ? 17 : n === 2 ? 14 : n === 3 ? 11 : 9;
}

type TierPopoverProps = {
  item: Item;
  anchor: DOMRect;
  tiers: Tier[];
  currentTierId: string | null;
  /** Recent tier moves for this item (most recent first); shows up to 5. */
  history?: ChangeEntry[];
  /** Room members, to resolve a mover's current nickname by id. */
  members?: Member[];
  onMove: (tierId: string) => void;
  onPool: () => void;
  onStartVote?: () => void;
  /** Open a tier decision match to move the item into `tierId` (room only). */
  onProposeDecision?: (tierId: string) => void;
  /** Room has Coupang shortcut enabled → show a top-left Coupang search button. */
  coupang?: boolean;
  /** Active tier lock on this item — shows a 🔒 banner. */
  lock?: { tierLabel: string; until: number; reason: "decision" | "vote" | "admin" };
  /** Owner/admin: pin the item for `seconds` (top-right lock button). */
  onLock?: (seconds: number) => void;
  /** Owner/admin: lift the lock early (shown only when `lock` is present). */
  onUnlock?: () => void;
  onEdit: () => void;
  onRemove: () => void;
  /** Persist the item's related-link list (undefined → read-only / no editing). */
  onSetLinks?: (links: string[]) => void;
  onClose: () => void;
};

/** Item → tier picker popover: large preview, tier buttons, and recent history. */
export function TierPopover({
  item,
  anchor,
  tiers,
  currentTierId,
  history = [],
  members = [],
  onMove,
  onPool,
  onStartVote,
  onProposeDecision,
  coupang,
  lock,
  onLock,
  onUnlock,
  onEdit,
  onRemove,
  onSetLinks,
  onClose,
}: TierPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [duelMode, setDuelMode] = useState(false);
  const [lockMenu, setLockMenu] = useState(false);
  const links = item.links ?? [];

  const addLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSetLinks) return;
    let url = linkDraft.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setLinkDraft("");
    if (links.includes(url)) return;
    onSetLinks([...links, url]);
  };
  const [pos, setPos] = useState(() => ({
    left: Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8)),
    top: anchor.bottom + 8,
  }));

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 320;
    let top = anchor.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setPos({ left: Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8)), top });
  }, [anchor]);

  const curLabel = currentTierId
    ? `${tiers.find((t) => t.id === currentTierId)?.label ?? ""} 티어`
    : "미배치";
  const recent = history.slice(0, 5);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-50" />
      <div
        ref={ref}
        className="fixed z-[51] flex max-h-[88vh] flex-col overflow-hidden rounded-[8px] border"
        style={{
          left: pos.left,
          top: pos.top,
          width: W,
          background: "#13161D",
          borderColor: "#2A303C",
          boxShadow: "0 16px 48px rgba(0,0,0,.6)",
          animation: "popIn .16s ease both",
        }}
      >
        {onLock && (
          <div className="absolute top-2 right-2 z-[53]">
            <button
              type="button"
              onClick={() => setLockMenu((v) => !v)}
              title="아이템 고정"
              className="grid size-8 place-items-center rounded-[7px] bg-black/55 text-white hover:bg-black/75"
            >
              <Lock className="size-4" />
            </button>
            {lockMenu && (
              <div className="absolute right-0 mt-1 w-[122px] overflow-hidden rounded-[8px] border border-[#2A303C] bg-[#13161D] py-1 shadow-[0_14px_36px_rgba(0,0,0,.6)]">
                <div className="px-3 pb-1 text-[9px] font-bold tracking-wide text-[#6A707E]">고정 시간 선택</div>
                {LOCK_DURATIONS.map((d) => (
                  <button
                    key={d.s}
                    type="button"
                    onClick={() => {
                      onLock(d.s);
                      setLockMenu(false);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-[12px] font-semibold text-[#C4C8D2] hover:bg-[#1C212B]"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Large preview */}
        <div className="relative h-[132px] w-full shrink-0 overflow-hidden bg-[#0E1117]">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
          ) : (
            <div
              className="grid size-full place-items-center text-[34px] font-extrabold text-white"
              style={{ background: swatch(item.name) }}
            >
              {item.name.slice(0, 2)}
            </div>
          )}
          {coupang && (
            <a
              href={`https://www.coupang.com/np/search?q=${encodeURIComponent(item.name)}`}
              target="_blank"
              rel="noreferrer noopener"
              title={`쿠팡에서 '${item.name}' 검색`}
              className="absolute top-2 left-2 z-[53] flex items-center gap-1 rounded-[7px] bg-[#C81E2D] px-2 py-1.5 text-[11px] font-bold text-white hover:bg-[#E0212F]"
            >
              <ShoppingCart className="size-3.5" strokeWidth={2.5} /> 쿠팡
            </a>
          )}
          <div
            className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-3 pt-9 pb-2"
            style={{ background: "linear-gradient(transparent,rgba(7,8,12,.95))" }}
          >
            <span className="truncate text-[14px] font-extrabold text-white">{item.name}</span>
            <span className="shrink-0 text-[10px] font-semibold text-[#C4C8D2]">{curLabel}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {lock && (
            <div className="mx-3 mt-2.5 flex items-center gap-2 rounded-[6px] border border-[rgba(129,140,248,.4)] bg-[rgba(99,102,241,.1)] px-2.5 py-2">
              <Lock className="size-3.5 shrink-0 text-[#818CF8]" />
              <span className="min-w-0 flex-1 text-[11px] font-semibold text-[#C7CBF5]">
                {lock.reason === "vote" ? "투표로" : lock.reason === "admin" ? "관리자가" : "결정전으로"} <b className="text-white">{lock.tierLabel}</b> 티어 고정 · 약 {Math.max(1, Math.ceil((lock.until - Date.now()) / 60000))}분
              </span>
              {onUnlock && (
                <button
                  type="button"
                  onClick={onUnlock}
                  className="flex h-6 shrink-0 items-center gap-1 rounded-[5px] bg-[#6366F1] px-2 text-[11px] font-bold text-white"
                >
                  <Unlock className="size-3" /> 해제
                </button>
              )}
            </div>
          )}
          <div className="px-3 pt-[9px] pb-1.5">
            <div
              className="mb-1.5 flex items-center gap-1 text-[10px] font-bold tracking-wide"
              style={{ color: duelMode ? "#818CF8" : "#6A707E" }}
            >
              {duelMode ? (
                <>
                  <Swords className="size-3" /> 결정전 — 목표 티어 선택
                </>
              ) : (
                "티어로 보내기"
              )}
            </div>
            <div className="flex flex-wrap gap-[5px]">
              {tiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  onClick={() => (duelMode ? onProposeDecision?.(t.id) : onMove(t.id))}
                  className="font-display grid h-[38px] min-w-[36px] flex-1 place-items-center rounded-[5px] px-2 leading-[1.25] whitespace-nowrap text-white"
                  style={{
                    background: t.color,
                    fontSize: labelFont(t.label),
                    border: currentTierId === t.id ? "2px solid #fff" : "none",
                    boxShadow: duelMode ? "0 0 0 2px #818CF8" : undefined,
                    textShadow: "0 1px 2px rgba(0,0,0,.35)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {onProposeDecision && (
              <button
                type="button"
                onClick={() => setDuelMode((v) => !v)}
                className="mt-1.5 flex h-7 w-full items-center justify-center gap-1.5 rounded-[5px] text-[11px] font-bold transition-colors"
                style={
                  duelMode
                    ? { background: "#6366F1", color: "#fff" }
                    : { background: "#171B22", color: "#A9AEF5", border: "1px solid rgba(129,140,248,.4)" }
                }
              >
                <Swords className="size-3.5" /> {duelMode ? "결정전 취소" : "티어 결정전 신청"}
              </button>
            )}
          </div>

          <div className="my-1.5 h-px bg-[#20252F]" />

          <div className="flex gap-[5px] px-3 pb-[11px]">
            {onStartVote && (
              <button
                type="button"
                onClick={onStartVote}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[5px] text-[12px] font-bold text-white"
                style={{ background: "#6366F1" }}
              >
                <Landmark className="size-3.5" /> 투표 시작
              </button>
            )}
            <button
              type="button"
              onClick={onPool}
              className="h-8 rounded-[5px] border border-[#2A303C] bg-[#171B22] px-[11px] text-[12px] font-semibold text-[#C4C8D2]"
            >
              미배치
            </button>
            <button
              type="button"
              onClick={onEdit}
              title="이름 수정"
              className="grid size-8 place-items-center rounded-[5px] border border-[#2A303C] bg-[#171B22] text-[#C4C8D2]"
            >
              <Pencil className="size-[13px]" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              title="삭제"
              className="grid size-8 place-items-center rounded-[5px] border border-[#2A303C] bg-[#171B22] text-[#8A8F9C]"
            >
              <Trash2 className="size-[13px]" />
            </button>
          </div>

          {onSetLinks && (
            <div className="border-t border-[#20252F] px-3 py-2">
              <div className="mb-1.5 text-[10px] font-bold tracking-wide text-[#6A707E]">링크</div>
              {links.length > 0 && (
                <div className="mb-1.5 flex flex-col gap-1.5">
                  {links.map((url) => (
                    <LinkCard
                      key={url}
                      url={url}
                      onRemove={() => onSetLinks(links.filter((u) => u !== url))}
                    />
                  ))}
                </div>
              )}
              <form onSubmit={addLink} className="flex gap-1.5">
                <input
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  placeholder="URL 붙여넣기"
                  className="h-7 min-w-0 flex-1 rounded-[5px] border border-[#2A303C] bg-[#0E1117] px-2 text-[11px] text-white placeholder:text-[#5A6070] focus:border-[#6366F1] focus:outline-none"
                />
                <button
                  type="submit"
                  title="링크 추가"
                  className="grid size-7 shrink-0 place-items-center rounded-[5px] bg-[#6366F1] text-white"
                >
                  <Plus className="size-3.5" />
                </button>
              </form>
            </div>
          )}

          {recent.length > 0 && (
            <div className="border-t border-[#20252F] px-3 py-2">
              <div className="mb-1 text-[10px] font-bold tracking-wide text-[#6A707E]">최근 이력</div>
              {recent.map((h) => {
                const actor = (h.actorId && members.find((m) => m.userId === h.actorId)?.name) || h.actor;
                return (
                <div key={h.id} className="flex items-center gap-2 py-[3px] text-[11px]">
                  <span className="size-[5px] shrink-0 rounded-full" style={{ background: h.toColor }} />
                  <span className="flex-1 truncate text-[#C4C8D2]">
                    <b className="text-[#A4AAB6]">{actor}</b>{" "}
                    {h.fromLabel && <span className="text-[#6A707E]">{h.fromLabel} </span>}→{" "}
                    <span className="font-bold" style={{ color: h.toColor }}>
                      {h.toLabel}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-[#5A6070]">{relTime(h.ts)}</span>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
