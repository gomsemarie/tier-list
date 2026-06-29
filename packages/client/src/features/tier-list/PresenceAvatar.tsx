import { useEffect, useState } from "react";
import { Ban, ListX, MessageSquareOff, Swords, type LucideIcon } from "lucide-react";

import type { Member } from "@tier-list/shared";
import { Avatar } from "./Avatar";

type Debuff = { key: string; until?: number; dur?: number; color: string; Icon: LucideIcon; label: string };

const R = 8;
const C = 2 * Math.PI * R;

/** Avatar + game-style debuff badges (chat/place/vote ban) with a depleting ring. */
export function PresenceAvatar({
  member,
  size = 36,
  onClick,
}: {
  member: Member;
  size?: number;
  onClick?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  const debuffs: Debuff[] = [
    { key: "mute", until: member.mutedUntil, dur: member.mutedFor, color: "#FB7185", Icon: MessageSquareOff, label: "채팅금지" },
    { key: "place", until: member.placeBannedUntil, dur: member.placeBannedFor, color: "#FB923C", Icon: Ban, label: "배치금지" },
    { key: "vote", until: member.voteBannedUntil, dur: member.voteBannedFor, color: "#A78BFA", Icon: ListX, label: "투표금지" },
    { key: "duel", until: member.duelBannedUntil, dur: member.duelBannedFor, color: "#F87171", Icon: Swords, label: "결투금지" },
  ];
  const active = debuffs.filter((d) => d.until && d.until > now);

  useEffect(() => {
    if (active.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active.length]);

  const inner = (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <Avatar name={member.name} src={member.avatar} frame={member.frame} size={size} />
      {active.length > 0 && (
        <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5">
          {active.map((d) => {
            const left = Math.max(0, (d.until ?? 0) - now);
            const frac = d.dur && d.dur > 0 ? Math.max(0, Math.min(1, left / d.dur)) : 1;
            const secs = Math.ceil(left / 1000);
            return (
              <span
                key={d.key}
                title={`${d.label} ${secs}초`}
                className="relative grid size-[18px] place-items-center rounded-full"
                style={{ background: "#0B0D11", boxShadow: "0 0 0 1px #0B0D11" }}
              >
                <svg viewBox="0 0 18 18" className="absolute inset-0 size-full -rotate-90">
                  <circle cx="9" cy="9" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2.5" />
                  <circle
                    cx="9"
                    cy="9"
                    r={R}
                    fill="none"
                    stroke={d.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - frac)}
                  />
                </svg>
                <d.Icon className="size-[9px]" style={{ color: d.color }} />
              </span>
            );
          })}
        </span>
      )}
    </span>
  );

  if (!onClick) return inner;
  return (
    <button type="button" onClick={onClick} title={member.name} className="transition-transform hover:-translate-y-0.5">
      {inner}
    </button>
  );
}
