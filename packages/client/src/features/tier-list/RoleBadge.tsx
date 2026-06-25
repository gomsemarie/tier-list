import { Crown, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MemberRole } from "@tier-list/shared";

/** Small role badge. Admin (gold shield) outranks owner (blue crown). */
export function RoleBadge({
  role,
  withLabel = false,
  className,
}: {
  role?: MemberRole;
  withLabel?: boolean;
  className?: string;
}) {
  if (role !== "admin" && role !== "owner") return null;
  const isAdmin = role === "admin";
  const Icon = isAdmin ? ShieldCheck : Crown;
  return (
    <span
      title={isAdmin ? "관리자" : "방장"}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[10px] font-bold leading-none",
        isAdmin
          ? "bg-amber/20 text-amber-fg"
          : "bg-indigo/20 text-indigo-fg",
        className,
      )}
    >
      <Icon className="size-3" />
      {withLabel && <span>{isAdmin ? "관리자" : "방장"}</span>}
    </span>
  );
}
