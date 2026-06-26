import { useEffect, useState } from "react";

import type { VoteSnapshot } from "@tier-list/shared";

type QuickVoteBarProps = {
  vote: VoteSnapshot;
  myUserId?: string;
  onCast: (tierId: string) => void;
};

function chipFont(label: string): number {
  const n = [...label].length;
  return n <= 1 ? 15 : n === 2 ? 12 : n === 3 ? 10 : 8;
}

/**
 * Top-center live vote status for "투표 간소화" members. Shows the running tally
 * and lets you opt in by clicking a tier — your vote then joins this round.
 */
export function QuickVoteBar({ vote, myUserId, onCast }: QuickVoteBarProps) {
  const [now, setNow] = useState(() => vote.endsAt - vote.durationMs);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // Result is shown to everyone via the full-screen effect / mini result.
  if (vote.phase === "result") return null;

  const secondsLeft = Math.max(0, Math.ceil((vote.endsAt - now) / 1000));
  const timerColor = secondsLeft <= 5 ? "#FF4C3A" : "#A5B4FC";
  const countOf = (tierId: string) => vote.tally.find((t) => t.tierId === tierId)?.voters.length ?? 0;
  const mineIn = (tierId: string) =>
    !!myUserId && (vote.tally.find((t) => t.tierId === tierId)?.voters.some((v) => v.userId === myUserId) ?? false);
  const total = vote.tally.reduce((n, t) => n + t.voters.length, 0);
  const max = Math.max(1, ...vote.options.map((o) => countOf(o.tierId)));
  const voted = vote.options.some((o) => mineIn(o.tierId));

  return (
    <div
      className="fixed top-3.5 left-1/2 z-[52] w-[360px] max-w-[92vw] -translate-x-1/2 rounded-[2px] bg-[#0E1117]"
      style={{ border: "2px solid #2A3142", boxShadow: "4px 4px 0 rgba(0,0,0,.6)", animation: "rise .3s both" }}
    >
      <div className="flex items-center gap-[7px] border-b-2 border-[#1B1F27] bg-[#11141B] px-[11px] py-[7px]">
        <span className="size-[7px] rounded-[1px] bg-[#F5B942]" style={{ animation: "blink 1s steps(1) infinite" }} />
        <span className="font-pixel text-[12px] font-bold text-[#F5B942]">투표 현황 · 간소화</span>
        <div className="flex-1" />
        <span className="font-arcade text-[11px] text-[#A5B4FC]">{total}표</span>
        <span className="font-arcade text-[12px]" style={{ color: timerColor }}>
          {secondsLeft}
        </span>
      </div>
      <div className="px-[11px] py-2">
        <div className="font-pixel mb-1.5 truncate text-[13px] font-bold text-[#EDEAE2]">
          {vote.itemName} <span className="font-normal text-[#7A808E]">— {voted ? "다시 누르면 변경" : "한 표 던지기"}</span>
        </div>
        <div className="flex flex-col gap-[5px]">
          {vote.options.map((o) => {
            const c = countOf(o.tierId);
            const mine = mineIn(o.tierId);
            return (
              <button
                key={o.tierId}
                type="button"
                onClick={() => onCast(o.tierId)}
                className="flex items-center gap-2 rounded-[2px] border-2 p-[3px] pr-2"
                style={{ borderColor: mine ? "#fff" : "#1B1F27", background: "#0B0E13" }}
              >
                <span
                  className="font-display grid h-6 min-w-[26px] place-items-center overflow-hidden rounded-[1px] px-1 leading-none whitespace-nowrap text-white"
                  style={{ background: o.color, fontSize: chipFont(o.label) }}
                >
                  {o.label}
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-[1px] bg-[#171B22]">
                  <span
                    className="block h-full rounded-[1px] transition-[width] duration-300"
                    style={{ width: `${(c / max) * 100}%`, background: o.color }}
                  />
                </span>
                <span className="font-arcade min-w-[18px] text-right text-[11px] text-[#EDEAE2]">{c}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
