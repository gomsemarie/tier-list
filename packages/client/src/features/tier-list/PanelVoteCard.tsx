import { useEffect, useState } from "react";

import type { VoteSnapshot } from "@tier-list/shared";

type PanelVoteCardProps = {
  vote: VoteSnapshot;
  myUserId?: string;
  onCast: (tierId: string) => void;
  /** 무효표 — abstain (also bound to Esc). */
  onAbstain: () => void;
};

function swatchColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${((hash % 360) + 360) % 360},40%,46%)`;
}

/** Retro tier-vote card pinned in the live panel (participating mode). */
export function PanelVoteCard({ vote, myUserId, onCast, onAbstain }: PanelVoteCardProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onAbstain();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAbstain]);

  const remaining = Math.max(0, vote.endsAt - now);
  const pctTime = vote.durationMs ? remaining / vote.durationMs : 0;
  const secondsLeft = Math.ceil(remaining / 1000);
  const timerColor = pctTime > 0.5 ? "#5BD3A0" : pctTime > 0.2 ? "#F5B942" : "#FF4C3A";

  const countOf = (tierId: string) =>
    vote.tally.find((t) => t.tierId === tierId)?.voters.length ?? 0;
  const totalVotes = vote.tally.reduce((n, t) => n + t.voters.length, 0);
  const max = Math.max(0, ...vote.options.map((o) => countOf(o.tierId)));
  const myVote = vote.tally.find((t) => t.voters.some((v) => v.userId === myUserId))?.tierId;

  return (
    <div
      className="mx-3 mt-3 overflow-hidden rounded-[2px] border-2"
      style={{
        borderColor: "#2A3142",
        background: "#0E1117",
        boxShadow: "3px 3px 0 rgba(0,0,0,.5)",
        animation: "popIn .25s both",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-[7px] border-b-2 px-[11px] py-2"
        style={{ borderColor: "#1B1F27", background: "#11141B" }}
      >
        <span
          className="size-[7px] rounded-[1px] bg-[#FF4C3A]"
          style={{ animation: "blink 1s steps(1) infinite" }}
        />
        <span className="font-pixel text-[12px] font-bold tracking-[.3px] text-[#EDEAE2]">
          티어 배치 투표
        </span>
        <div className="flex-1" />
        <span className="font-arcade text-[13px]" style={{ color: timerColor }}>
          {secondsLeft}
        </span>
      </div>

      {/* Item */}
      <div className="flex items-center gap-[9px] px-[11px] pt-2.5 pb-1.5">
        <div className="relative size-[38px] shrink-0 overflow-hidden border-2 border-black">
          {vote.itemImage ? (
            <img src={vote.itemImage} alt={vote.itemName} className="size-full object-cover" />
          ) : (
            <div
              className="grid size-full place-items-center text-[14px] font-extrabold text-white"
              style={{ background: swatchColor(vote.itemName) }}
            >
              {vote.itemName.slice(0, 2)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-[14px] font-bold text-[#EDEAE2]">{vote.itemName}</div>
          {vote.reason && (
            <div className="truncate text-[11px] text-[#8A8F9C]">{vote.reason}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold text-[#6A707E]">투표</div>
          <div className="font-arcade text-[13px] text-[#A5B4FC]">{totalVotes}</div>
        </div>
      </div>

      {/* Options (pixel meters) */}
      <div className="flex flex-col gap-[5px] px-[11px] pt-1 pb-[9px]">
        {vote.options.map((o) => {
          const votes = countOf(o.tierId);
          const isLead = votes === max && votes > 0;
          const fill = totalVotes ? Math.round((votes / totalVotes) * 10) : 0;
          return (
            <button
              key={o.tierId}
              type="button"
              onClick={() => onCast(o.tierId)}
              className="flex items-center gap-2 rounded-[2px] border-2 px-[7px] py-[5px]"
              style={{
                background: "#0E1117",
                borderColor: isLead ? o.color : myVote === o.tierId ? "#A5B4FC" : "#232934",
                boxShadow: isLead ? `2px 2px 0 ${o.color}` : "none",
              }}
            >
              <span
                className="font-arcade grid size-[26px] place-items-center text-[12px] text-white"
                style={{
                  background: o.color,
                  border: "2px solid #000",
                  textShadow: "1px 1px 0 #000",
                }}
              >
                {o.label}
              </span>
              <div className="flex flex-1 gap-[2px]">
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className="h-[13px] w-[8px]"
                    style={{ background: i < fill ? o.color : "#1B1F27" }}
                  />
                ))}
              </div>
              <span className="font-arcade min-w-[18px] text-right text-[11px] text-[#EDEAE2]">
                {votes}
              </span>
            </button>
          );
        })}
      </div>

      {/* Abstain */}
      <div className="px-[11px] pb-[11px]">
        <button
          type="button"
          onClick={onAbstain}
          className="font-pixel h-8 w-full rounded-[2px] border-2 border-black text-[12px] font-bold text-[#C4C8D2]"
          style={{ background: "#171B22", boxShadow: "2px 2px 0 #000" }}
        >
          무효표 (Esc)
        </button>
      </div>
    </div>
  );
}
