import { useEffect, useState } from "react";
import { Ban, MessageSquareOff } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Member } from "@tier-list/shared";
import { Avatar } from "./Avatar";
import { RoleBadge } from "./RoleBadge";

type ParticipantPanelProps = {
  members: Member[];
  onSelect: (memberId: string) => void;
  className?: string;
};

function leftMin(until: number | undefined, now: number): number {
  if (!until || until <= now) return 0;
  return Math.ceil((until - now) / 60_000);
}

/**
 * Compact vertical participant list for the left floating panel (desktop).
 * No wrapping box — transparent column of per-user cards (avatar over name).
 * Shows active ban (chat/placement) badges right on each profile.
 */
export function ParticipantPanel({
  members,
  onSelect,
  className,
}: ParticipantPanelProps) {
  // Tick so ban timers count down / expire without a fresh snapshot.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={cn("flex flex-col gap-2 overflow-y-auto", className)}>
      <p className="label-caps px-1 text-center text-muted-foreground">
        참가자 {members.length}
      </p>
      {members.map((m) => {
        const muteMin = leftMin(m.mutedUntil, now);
        const banMin = leftMin(m.placeBannedUntil, now);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            title={m.name}
            className={cn(
              "shadow-soft flex flex-col items-center gap-1.5 rounded-xl border bg-card p-2 transition-colors hover:border-foreground/40",
              muteMin > 0 || banMin > 0 ? "border-red-400/70" : "border-border",
            )}
          >
            <div className="relative">
              <Avatar name={m.name} src={m.avatar} frame={m.frame} size={48} />
              {(m.role === "admin" || m.role === "owner") && (
                <span className="absolute -right-1 -bottom-1">
                  <RoleBadge role={m.role} />
                </span>
              )}
            </div>
            <span className="w-full truncate text-center text-[11px] leading-tight font-medium">
              {m.name}
            </span>
            {(muteMin > 0 || banMin > 0) && (
              <div className="flex flex-wrap justify-center gap-0.5">
                {muteMin > 0 && (
                  <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-600">
                    <MessageSquareOff className="size-2.5" />
                    {muteMin}m
                  </span>
                )}
                {banMin > 0 && (
                  <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-600">
                    <Ban className="size-2.5" />
                    {banMin}m
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
