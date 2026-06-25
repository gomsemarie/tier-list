import { Users } from "lucide-react";

import type { Member } from "@tier-list/shared";
import { Avatar } from "./Avatar";
import { RoleBadge } from "./RoleBadge";

type ParticipantBarProps = {
  members: Member[];
  onSelect: (memberId: string) => void;
};

/** Top-of-content strip of room participants with large, clickable avatars. */
export function ParticipantBar({ members, onSelect }: ParticipantBarProps) {
  return (
    <section className="animate-rise rounded-xl border border-border bg-muted/30 p-4">
      <h2 className="label-caps mb-3 flex items-center gap-1.5 text-muted-foreground">
        <Users className="size-3.5" /> 참가자 {members.length}
      </h2>
      <div className="flex flex-wrap gap-4">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            title={m.name}
            className="group flex w-16 flex-col items-center gap-1.5"
          >
            <div className="relative transition-transform group-hover:-translate-y-0.5">
              <Avatar
                name={m.name}
                src={m.avatar}
                frame={m.frame}
                size={56}
                className="transition"
              />
              {(m.role === "admin" || m.role === "owner") && (
                <span className="absolute -right-1 -bottom-1">
                  <RoleBadge role={m.role} />
                </span>
              )}
            </div>
            <span className="w-full truncate text-center text-xs font-medium">
              {m.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
