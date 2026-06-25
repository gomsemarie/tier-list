import { useEffect, useState } from "react";
import { Ban, Check, Landmark, MinusCircle, Repeat2, Trophy, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VoteSnapshot } from "@tier-list/shared";
import { Avatar } from "./Avatar";

type VoteOverlayProps = {
  vote: VoteSnapshot;
  myUserId?: string;
  onCast: (tierId: string) => void;
  /** Cast 무효표 and close this overlay for me (also bound to Esc). */
  onAbstain: () => void;
};

/** Square colored tier badge (matches the board look). */
function TierChip({
  label,
  color,
  size = "md",
}: {
  label: string;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-grid place-items-center rounded-lg font-black text-white shadow-sm",
        size === "lg" ? "h-12 min-w-12 px-2 text-xl" : size === "md" ? "h-9 min-w-9 px-1.5 text-sm" : "h-6 min-w-6 px-1 text-xs",
      )}
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

/** Forced game-style overlay for a tier vote (Esc = 무효표). */
export function VoteOverlay({ vote, myUserId, onCast, onAbstain }: VoteOverlayProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  // Esc casts 무효표 (only while voting, not on the result screen).
  const voting = vote.phase === "voting";
  useEffect(() => {
    if (!voting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onAbstain();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voting, onAbstain]);

  const remaining = Math.max(0, vote.endsAt - now);
  const pct = Math.max(0, Math.min(100, (remaining / vote.durationMs) * 100));
  const secondsLeft = Math.ceil(remaining / 1000);
  const ringColor = pct > 50 ? "#22c55e" : pct > 20 ? "#f59e0b" : "#ef4444";

  const myVote = vote.tally.find((t) => t.voters.some((v) => v.userId === myUserId))?.tierId;
  const votedCount = vote.tally.reduce((n, t) => n + t.voters.length, 0);
  const maxVotes = Math.max(1, ...vote.tally.map((t) => t.voters.length));
  const isResult = vote.phase === "result";

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-zinc-900/55 p-4 backdrop-blur-md">
      <div className="animate-rise w-full max-w-md overflow-hidden rounded-[3px] border-2 border-line-strong bg-paper shadow-[4px_4px_0_rgba(0,0,0,0.55)]">
        {/* Header */}
        <div className="relative flex items-center gap-3 border-b-2 border-border bg-panel-head px-5 py-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-[3px] bg-indigo text-white">
            <Landmark className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
              인정협회 투표
            </p>
            <p className="font-pixel text-base leading-tight font-bold text-foreground">
              티어를 결정하세요
            </p>
          </div>
          {vote.round > 1 && (
            <span className="ml-auto rounded-sm bg-amber/20 px-2.5 py-1 text-xs font-bold text-amber-fg">
              마지막 라운드
            </span>
          )}
        </div>

        {/* Item + timer */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <span className="size-14 shrink-0 overflow-hidden rounded-xl border-2 border-border bg-muted shadow-sm">
            {vote.itemImage ? (
              <img src={vote.itemImage} alt={vote.itemName} className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-sm font-bold text-muted-foreground">
                {vote.itemName.slice(0, 2)}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-pixel truncate text-xl font-bold text-foreground">{vote.itemName}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              현재
              {vote.currentTier ? (
                <TierChip label={vote.currentTier.label} color={vote.currentTier.color} size="sm" />
              ) : (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">미배치</span>
              )}
              <span className="truncate">· {vote.starter}</span>
            </p>
          </div>
          {!isResult && (
            <div className="relative size-14 shrink-0">
              <div
                className="size-full rounded-full"
                style={{ background: `conic-gradient(${ringColor} ${pct * 3.6}deg, var(--track) 0deg)` }}
              />
              <div className="absolute inset-[3px] grid place-items-center rounded-full bg-paper">
                <span
                  className={cn(
                    "font-arcade text-base tabular-nums",
                    pct <= 20 && "animate-pulse text-red-500",
                  )}
                >
                  {secondsLeft}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Reason */}
        {vote.reason && (
          <div className="mx-4 mt-3 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-sm">
            <span className="font-bold text-amber-fg">📢 사유 </span>
            <span className="text-foreground/85">{vote.reason}</span>
          </div>
        )}

        {isResult ? (
          <ResultView vote={vote} />
        ) : (
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>어울리는 티어에 투표!</span>
              <span className="tabular-nums">
                {votedCount} / {vote.totalVoters}명 투표
              </span>
            </div>

            <div className="grid max-h-[42vh] gap-2 overflow-y-auto pr-0.5">
              {vote.options.map((o) => {
                const voters = vote.tally.find((t) => t.tierId === o.tierId)?.voters ?? [];
                const mine = myVote === o.tierId;
                return (
                  <button
                    key={o.tierId}
                    type="button"
                    onClick={() => onCast(o.tierId)}
                    className={cn(
                      "group flex items-center gap-3 rounded-md border-2 bg-card p-2.5 text-left transition-all active:scale-[0.99]",
                      mine
                        ? "border-indigo shadow-[2px_2px_0_rgba(0,0,0,0.4)]"
                        : "border-border hover:border-line-strong",
                    )}
                  >
                    <TierChip label={o.label} color={o.color} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-bold text-foreground">
                          {o.label}
                        </span>
                        {mine && (
                          <span className="flex items-center gap-0.5 rounded-full bg-indigo px-1.5 py-0.5 text-[10px] font-bold text-white">
                            <Check className="size-3" /> 내 표
                          </span>
                        )}
                        <span className="font-arcade text-sm tabular-nums text-foreground">
                          {voters.length}
                        </span>
                      </div>
                      {/* vote meter */}
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width] duration-300"
                          style={{ width: `${(voters.length / maxVotes) * 100}%`, backgroundColor: o.color }}
                        />
                      </div>
                      {voters.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {voters.map((v) => (
                            <span
                              key={v.userId}
                              title={v.name}
                              className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1.5 pl-0.5 text-[10px] font-medium"
                            >
                              <Avatar name={v.name} src={v.avatar} frame={v.frame} size={14} />
                              {v.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Abstainers */}
            {vote.abstainers.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/60 px-2.5 py-1.5 text-xs">
                <span className="font-bold text-muted-foreground">🚫 무효표</span>
                {vote.abstainers.map((v) => (
                  <span key={v.userId} className="flex items-center gap-1" title={v.name}>
                    <Avatar name={v.name} src={v.avatar} frame={v.frame} size={14} />
                    {v.name}
                  </span>
                ))}
              </div>
            )}

            {/* Abstain */}
            <button
              type="button"
              onClick={onAbstain}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-line-strong py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-line-strong hover:text-foreground"
            >
              <Ban className="size-4" /> 무효표 던지기
              <kbd className="ml-1 rounded border border-border bg-muted px-1.5 text-[10px] font-bold">
                Esc
              </kbd>
            </button>

            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              다수결로 이동 · 동점 시 1회 재투표 후 현상 유지 · 무효표는 즉시 닫힘
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultView({ vote }: { vote: VoteSnapshot }) {
  const r = vote.result;
  if (!r) return null;
  const total = r.counts.reduce((n, c) => n + c.count, 0);
  const max = Math.max(1, ...r.counts.map((c) => c.count));
  const sorted = [...r.counts].sort((a, b) => b.count - a.count);

  return (
    <div className="p-5 text-center">
      {r.outcome === "moved" && (
        <div className="flex flex-col items-center gap-2">
          <span className="attack-bounce grid size-16 place-items-center rounded-full bg-amber/15 ring-4 ring-amber/40">
            <Trophy className="size-8 text-amber-fg" />
          </span>
          <p className="text-xs font-bold text-muted-foreground">투표 종료!</p>
          <p className="flex items-center gap-2 text-lg font-black text-foreground">
            <span className="text-muted-foreground">{vote.itemName}</span>
            <span className="text-amber-500">→</span>
            {r.toLabel && r.toColor && <TierChip label={r.toLabel} color={r.toColor} size="lg" />}
          </p>
          <p className="text-xs text-muted-foreground">티어로 이동! (총 {total}표)</p>
        </div>
      )}
      {r.outcome === "revote" && (
        <div className="flex flex-col items-center gap-2">
          <span className="attack-bounce grid size-16 place-items-center rounded-full bg-violet-500/15 ring-4 ring-violet-500/40">
            <Repeat2 className="size-8 text-violet-400" />
          </span>
          <p className="text-2xl font-black text-foreground">동점!</p>
          <p className="text-sm text-muted-foreground">{r.nextCount}개 티어로 곧 재투표합니다…</p>
        </div>
      )}
      {r.outcome === "keep" && (
        <div className="flex flex-col items-center gap-2">
          <span className="grid size-16 place-items-center rounded-full bg-white/5 ring-4 ring-white/10">
            <MinusCircle className="size-8 text-muted-foreground" />
          </span>
          <p className="text-2xl font-black text-foreground">현상 유지</p>
          <p className="text-sm text-muted-foreground">
            재투표도 동점 — {vote.itemName}은(는) 그대로 둡니다.
          </p>
        </div>
      )}
      {r.outcome === "void" && (
        <div className="flex flex-col items-center gap-2">
          <span className="grid size-16 place-items-center rounded-full bg-muted ring-4 ring-border">
            <XCircle className="size-8 text-muted-foreground" />
          </span>
          <p className="text-xl font-black text-foreground">투표 무산</p>
          <p className="text-sm text-muted-foreground">표가 없어 이동하지 않았습니다.</p>
        </div>
      )}

      {total > 0 && (
        <div className="mt-4 grid gap-1.5 text-left">
          {sorted.map((c) => (
            <div key={c.tierId} className="flex items-center gap-2">
              <TierChip label={c.label} color={c.color} size="sm" />
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(c.count / max) * 100}%`, backgroundColor: c.color }}
                />
              </div>
              <span className="w-7 text-right text-sm font-black tabular-nums text-foreground">
                {c.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
