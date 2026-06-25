import { Ban, Gavel, MessageSquareOff, ShieldCheck, Swords, UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MemberRole, ModerateActionType } from "@tier-list/shared";
import { Avatar } from "./Avatar";
import { RoleBadge } from "./RoleBadge";

export type ProfileView = {
  userId?: string;
  nickname: string;
  avatar?: string;
  username?: string;
  frame?: string;
  role?: MemberRole;
  mutedUntil?: number;
  placeBannedUntil?: number;
  voteBannedUntil?: number;
};

/** Ban durations, in seconds. 0 (the 해제 button) lifts the ban. */
const DURATIONS = [
  { label: "5초", seconds: 5 },
  { label: "10초", seconds: 10 },
  { label: "30초", seconds: 30 },
  { label: "5분", seconds: 300 },
  { label: "10분", seconds: 600 },
  { label: "30분", seconds: 1800 },
];

type UserProfileOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileView | null;
  /** Viewer outranks the target and may moderate them. */
  canModerate?: boolean;
  /** `seconds` is the ban duration (0 lifts it); omitted for kick/attack. */
  onModerate?: (action: ModerateActionType, seconds?: number) => void;
  /** Viewer is an admin and may promote/demote this account. */
  canGrantAdmin?: boolean;
  onGrantAdmin?: (makeAdmin: boolean) => void;
  /** Viewer can attack this target (owner/admin or unlocked attack perk). */
  canAttack?: boolean;
};

function leftMinutes(until?: number): number {
  if (!until || until <= Date.now()) return 0;
  return Math.ceil((until - Date.now()) / 60_000);
}

/** Profile overlay shown when a participant is clicked; adds moderation
 *  controls when the viewer is an owner/admin who outranks the target. */
export function UserProfileOverlay({
  open,
  onOpenChange,
  profile,
  canModerate,
  onModerate,
  canGrantAdmin,
  onGrantAdmin,
  canAttack,
}: UserProfileOverlayProps) {
  const mutedFor = leftMinutes(profile?.mutedUntil);
  const bannedFor = leftMinutes(profile?.placeBannedUntil);
  const voteBannedFor = leftMinutes(profile?.voteBannedUntil);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader className="sr-only">
          <DialogTitle>사용자 프로필</DialogTitle>
          <DialogDescription>참가자 프로필 및 관리</DialogDescription>
        </DialogHeader>
        {profile && (
          <div className="flex flex-col items-center gap-3 py-1 text-center">
            <Avatar
              name={profile.nickname}
              src={profile.avatar ?? null}
              frame={profile.frame}
              size={96}
            />
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1.5">
                <p className="text-lg font-bold">{profile.nickname}</p>
                <RoleBadge role={profile.role} withLabel />
              </div>
              {profile.username && (
                <p className="text-sm text-muted-foreground">@{profile.username}</p>
              )}
            </div>

            {(mutedFor > 0 || bannedFor > 0 || voteBannedFor > 0) && (
              <div className="flex flex-wrap justify-center gap-1.5 text-xs">
                {mutedFor > 0 && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                    채팅 금지 {mutedFor}분
                  </span>
                )}
                {bannedFor > 0 && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                    배치 금지 {bannedFor}분
                  </span>
                )}
                {voteBannedFor > 0 && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                    투표 금지 {voteBannedFor}분
                  </span>
                )}
              </div>
            )}

            {(canModerate || canGrantAdmin || (canAttack && onModerate)) && (
              <div className="mt-1 grid w-full gap-2.5 border-t border-border pt-3 text-left">
                <p className="label-caps text-muted-foreground">관리</p>

                {canGrantAdmin && onGrantAdmin && (
                  <Button
                    variant="outline"
                    className={
                      profile.role === "admin"
                        ? ""
                        : "border-amber/50 text-amber-fg hover:bg-amber/15 hover:text-amber-fg"
                    }
                    onClick={() => onGrantAdmin(profile.role !== "admin")}
                  >
                    <ShieldCheck />
                    {profile.role === "admin" ? "관리자 해제" : "관리자 지정"}
                  </Button>
                )}

                {canModerate && onModerate && (
                  <>
                    {(
                      [
                        { action: "mute", Icon: MessageSquareOff, label: "채팅", activeFor: mutedFor },
                        { action: "banPlace", Icon: Ban, label: "배치", activeFor: bannedFor },
                        { action: "banVote", Icon: Gavel, label: "투표", activeFor: voteBannedFor },
                      ] as const
                    ).map(({ action, Icon, label, activeFor }) => (
                      <div key={action} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-semibold">
                            <Icon className="size-3.5" /> {label} 금지
                          </span>
                          {activeFor > 0 && (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-destructive hover:underline"
                              onClick={() => onModerate(action, 0)}
                            >
                              해제
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {DURATIONS.map((d) => (
                            <Button
                              key={d.seconds}
                              variant="outline"
                              size="sm"
                              className="h-8 px-0 text-xs"
                              onClick={() => onModerate(action, d.seconds)}
                            >
                              {d.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}

                {/* Kick */}
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive hover:text-white"
                  onClick={() => {
                    if (window.confirm(`${profile.nickname} 님을 내보낼까요?`)) {
                      onModerate("kick");
                      onOpenChange(false);
                    }
                  }}
                >
                  <UserX /> 강퇴
                </Button>
                  </>
                )}

                {/* Attack — available to owner/admin OR attack-perk holders */}
                {canAttack && onModerate && (
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-600 hover:text-white"
                    onClick={() => onModerate("attack")}
                  >
                    <Swords /> 공격
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
