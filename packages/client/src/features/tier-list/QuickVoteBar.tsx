import { useEffect, useState } from "react";

import type { VoteSnapshot } from "@tier-list/shared";

type QuickVoteBarProps = {
  vote: VoteSnapshot;
  onCast: (tierId: string) => void;
};

/**
 * Top-center overlay for opt-out ("미참여") members: cast one quick vote while
 * voting, or see a compact slam result when the round resolves into a move.
 */
export function QuickVoteBar({ vote, onCast }: QuickVoteBarProps) {
  const [now, setNow] = useState(() => vote.endsAt - vote.durationMs);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  if (vote.phase === "result") {
    const r = vote.result;
    if (!r || r.outcome !== "moved") return null;
    return (
      <div
        className="fixed top-4 left-1/2 z-[58] flex -translate-x-1/2 items-center gap-2.5 rounded-[2px] bg-[#11141B] py-2 pr-3.5 pl-2"
        style={{ border: "2px solid #000", boxShadow: "4px 4px 0 rgba(0,0,0,.6)", animation: "slam .45s steps(4) both" }}
      >
        <span
          className="font-arcade grid size-9 place-items-center border-2 border-black text-[15px] text-white"
          style={{ background: r.toColor, textShadow: "2px 2px 0 #000" }}
        >
          {r.toLabel}
        </span>
        <div>
          <div className="font-pixel text-[13px] font-bold text-white">
            {vote.itemName} <span className="text-[#FDE047]">▲ {r.toLabel} 승급!</span>
          </div>
          <div className="font-pixel text-[10px] text-[#8A8F9C]">미참여 중 · 결과만 표시</div>
        </div>
        <span
          className="ml-1 size-1 rounded-[1px] bg-[#FDE047]"
          style={{ boxShadow: "0 0 6px #FDE047", animation: "twinkle .9s steps(2) infinite" }}
        />
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil((vote.endsAt - now) / 1000));
  const timerColor = secondsLeft <= 5 ? "#FF4C3A" : "#A5B4FC";

  return (
    <div
      className="fixed top-3.5 left-1/2 z-[52] w-[380px] max-w-[92vw] -translate-x-1/2 rounded-[2px] bg-[#0E1117]"
      style={{ border: "2px solid #2A3142", boxShadow: "4px 4px 0 rgba(0,0,0,.6)", animation: "rise .3s both" }}
    >
      <div className="flex items-center gap-[7px] border-b-2 border-[#1B1F27] bg-[#11141B] px-[11px] py-[7px]">
        <span className="size-[7px] rounded-[1px] bg-[#F5B942]" style={{ animation: "blink 1s steps(1) infinite" }} />
        <span className="font-pixel text-[12px] font-bold text-[#F5B942]">빠른 투표 · 미참여 중</span>
        <div className="flex-1" />
        <span className="font-arcade text-[12px]" style={{ color: timerColor }}>
          {secondsLeft}
        </span>
      </div>
      <div className="px-[11px] py-2.5">
        <div className="font-pixel mb-2 text-[13px] font-bold text-[#EDEAE2]">
          {vote.itemName} <span className="font-normal text-[#7A808E]">— 어느 티어?</span>
        </div>
        <div className="flex gap-[5px]">
          {vote.options.map((o) => (
            <button
              key={o.tierId}
              type="button"
              onClick={() => onCast(o.tierId)}
              className="font-display h-9 flex-1 overflow-hidden rounded-[2px] border-2 border-black px-1 text-[16px] whitespace-nowrap text-white"
              style={{ background: o.color, boxShadow: "2px 2px 0 #000" }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
