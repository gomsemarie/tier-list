import { useEffect, useState } from "react";

import { VOTE_ABSTAIN } from "@tier-list/shared";
import type { VoteSnapshot } from "@tier-list/shared";

function swatch(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360},40%,46%)`;
}

type PanelVoteCardProps = {
  vote: VoteSnapshot;
  onCast: (tierId: string) => void;
};

/** Retro vote card pinned in the live panel (participating mode). */
export function PanelVoteCard({ vote, onCast }: PanelVoteCardProps) {
  const [now, setNow] = useState(() => vote.endsAt - vote.durationMs);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((vote.endsAt - now) / 1000));
  const timerColor = secondsLeft <= 5 ? "#FF4C3A" : "#A5B4FC";
  const countOf = (tierId: string) => vote.tally.find((t) => t.tierId === tierId)?.voters.length ?? 0;
  const total = vote.tally.reduce((n, t) => n + t.voters.length, 0);
  const max = Math.max(1, ...vote.options.map((o) => countOf(o.tierId)));

  if (vote.phase === "result" && vote.result) {
    const r = vote.result;
    const text =
      r.outcome === "moved"
        ? `${r.toLabel} 티어로 이동`
        : r.outcome === "revote"
          ? `재투표 (${r.nextCount}개 티어)`
          : r.outcome === "void"
            ? "무효 — 유지"
            : "현재 티어 유지";
    return (
      <div
        className="mx-3 mt-3 overflow-hidden rounded-[2px] bg-[#0E1117]"
        style={{ border: "2px solid #2A3142", boxShadow: "3px 3px 0 rgba(0,0,0,.5)" }}
      >
        <div className="flex items-center gap-2 border-b-2 border-[#1B1F27] bg-[#11141B] px-[11px] py-2">
          <span className="font-arcade text-[10px] text-[#FF6B5A]">RESULT</span>
          <span className="font-pixel text-[12px] font-bold text-[#EDEAE2]">{vote.itemName}</span>
        </div>
        <div className="flex items-center gap-2.5 px-[11px] py-2.5">
          {vote.result.toColor && (
            <span
              className="font-display grid size-9 place-items-center rounded-[2px] border-2 border-black text-[18px] text-white"
              style={{ background: vote.result.toColor }}
            >
              {vote.result.toLabel}
            </span>
          )}
          <span className="font-pixel text-[13px] font-bold text-[#EDEAE2]">{text}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-3 mt-3 overflow-hidden rounded-[2px] bg-[#0E1117]"
      style={{ border: "2px solid #2A3142", boxShadow: "3px 3px 0 rgba(0,0,0,.5)" }}
    >
      <div className="flex items-center gap-[7px] border-b-2 border-[#1B1F27] bg-[#11141B] px-[11px] py-2">
        <span className="size-[7px] rounded-[1px] bg-[#FF4C3A]" style={{ animation: "blink 1s steps(1) infinite" }} />
        <span className="font-pixel text-[12px] font-bold tracking-[.3px] text-[#EDEAE2]">티어 배치 투표</span>
        <div className="flex-1" />
        <span className="font-arcade text-[13px]" style={{ color: timerColor }}>
          {secondsLeft}
        </span>
      </div>

      <div className="flex items-center gap-2.5 px-[11px] pt-2.5 pb-1.5">
        <div className="relative size-[38px] shrink-0 overflow-hidden border-2 border-black">
          {vote.itemImage ? (
            <img src={vote.itemImage} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div
              className="absolute inset-0 grid place-items-center text-[14px] font-extrabold text-white"
              style={{ background: swatch(vote.itemName) }}
            >
              {vote.itemName.slice(0, 2)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-pixel truncate text-[14px] font-bold text-[#EDEAE2]">{vote.itemName}</div>
          <div className="truncate text-[11px] text-[#8A8F9C]">{vote.reason || `${vote.starter} 개최`}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold text-[#6A707E]">투표</div>
          <div className="font-arcade text-[13px] text-[#A5B4FC]">{total}</div>
        </div>
      </div>

      <div className="flex flex-col gap-[5px] px-[11px] pt-1 pb-2.5">
        {vote.options.map((o) => {
          const c = countOf(o.tierId);
          return (
            <button
              key={o.tierId}
              type="button"
              onClick={() => onCast(o.tierId)}
              className="flex items-center gap-2 rounded-[2px] border-2 border-[#1B1F27] bg-[#0B0E13] p-[3px] pr-2 hover:border-[#2A3142]"
            >
              <span
                className="font-display grid h-6 min-w-[26px] place-items-center rounded-[1px] px-1 text-[13px] text-white"
                style={{ background: o.color }}
              >
                {o.label}
              </span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-[1px] bg-[#171B22]">
                <span className="block h-full rounded-[1px] transition-[width] duration-300" style={{ width: `${(c / max) * 100}%`, background: o.color }} />
              </span>
              <span className="font-arcade min-w-[18px] text-right text-[11px] text-[#EDEAE2]">{c}</span>
            </button>
          );
        })}
      </div>

      <div className="px-[11px] pb-[11px]">
        <button
          type="button"
          onClick={() => onCast(VOTE_ABSTAIN)}
          className="font-pixel h-8 w-full rounded-[2px] text-[12px] font-bold text-[#C4C8D2]"
          style={{ border: "2px solid #000", boxShadow: "2px 2px 0 #000", background: "#171B22" }}
        >
          무효표
        </button>
      </div>
    </div>
  );
}
