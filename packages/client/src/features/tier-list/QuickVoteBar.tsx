import { useEffect, useState } from "react";
import { Vote } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VoteSnapshot } from "@tier-list/shared";

type QuickVoteBarProps = {
  vote: VoteSnapshot;
  myUserId?: string;
  onCast: (tierId: string) => void;
};

/**
 * Compact in-banner vote card. Lets anyone — including opted-out members who
 * hide the full overlay — cast a quick rank vote. The majority math on the
 * server folds these votes into the expected set automatically.
 */
export function QuickVoteBar({ vote, myUserId, onCast }: QuickVoteBarProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (vote.phase !== "voting") return null;

  const secondsLeft = Math.max(0, Math.ceil((vote.endsAt - now) / 1000));
  const myVote = vote.tally.find((t) =>
    t.voters.some((v) => v.userId === myUserId),
  )?.tierId;

  return (
    <div className="animate-rise retro-border-sm flex min-w-0 items-center gap-2 rounded-[3px] border-line-strong bg-paper px-3 py-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-[3px] bg-amber text-[#1a1206]">
        <Vote className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="font-pixel flex items-center gap-1.5 text-[11px] font-bold text-amber-fg">
          진행중인 투표
          <span className="font-arcade rounded-sm bg-amber/20 px-1 text-[10px] tabular-nums text-amber-fg">
            {secondsLeft}s
          </span>
          {vote.round > 1 && (
            <span className="rounded-sm bg-white/10 px-1 text-white">{vote.round}R</span>
          )}
        </span>
        <span className="font-pixel max-w-[8rem] truncate text-xs font-bold text-foreground">
          {vote.itemName}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-1 pr-1">
        {vote.options.map((o) => {
          const count = vote.tally.find((t) => t.tierId === o.tierId)?.voters.length ?? 0;
          const mine = myVote === o.tierId;
          return (
            <button
              key={o.tierId}
              type="button"
              onClick={() => onCast(o.tierId)}
              title={`${o.label} 티어에 투표 (${count}표)`}
              className={cn(
                "relative grid h-8 min-w-8 place-items-center rounded-[3px] border-2 border-black px-2 text-sm font-black text-white transition-transform active:scale-95",
                mine
                  ? "ring-2 ring-white ring-offset-1 ring-offset-paper"
                  : "hover:brightness-110",
              )}
              style={{ backgroundColor: o.color }}
            >
              <span className="leading-none">{o.label}</span>
              {count > 0 && (
                <span className="font-arcade absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-black px-1 text-[9px] font-bold tabular-nums text-white ring-2 ring-paper">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
