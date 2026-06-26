import { MessageSquareOff, Ban, ListX, ShieldCheck, Swords, UserX, Lock } from "lucide-react";

import type { ModerateActionType, Member } from "@tier-list/shared";
import { Avatar } from "./Avatar";

const DURATIONS = [
  { s: 5, label: "5초" },
  { s: 10, label: "10초" },
  { s: 30, label: "30초" },
  { s: 300, label: "5분" },
  { s: 600, label: "10분" },
  { s: 1800, label: "30분" },
];

type MemberOverlayProps = {
  member: Member;
  isSelf: boolean;
  canModerate: boolean;
  canGrantAdmin: boolean;
  canAttack: boolean;
  onModerate: (action: ModerateActionType, seconds?: number) => void;
  onGrantAdmin: (makeAdmin: boolean) => void;
  onClose: () => void;
};

function roleBadge(role?: Member["role"]) {
  if (role === "owner") return { label: "방장", bg: "#3B4B94", fg: "#fff" };
  if (role === "admin") return { label: "관리자", bg: "#7C3AED", fg: "#fff" };
  return { label: "멤버", bg: "#3B4B94", fg: "#fff" };
}

/** Member profile + (for privileged actors) moderation controls. */
export function MemberOverlay({
  member,
  isSelf,
  canModerate,
  canGrantAdmin,
  canAttack,
  onModerate,
  onGrantAdmin,
  onClose,
}: MemberOverlayProps) {
  const now = Date.now();
  const muted = (member.mutedUntil ?? 0) > now;
  const placeBanned = (member.placeBannedUntil ?? 0) > now;
  const voteBanned = (member.voteBannedUntil ?? 0) > now;
  const badge = roleBadge(member.role);
  const showControls = canModerate && !isSelf;
  const showAttackOnly = !showControls && canAttack && !isSelf;

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[64] bg-black/60" />
      <div
        className="fixed top-1/2 left-1/2 z-[65] max-h-[85vh] w-[360px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[10px] border border-[#242a3a] bg-[#13161D] p-5"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,.6)", animation: "popIn .16s ease both" }}
      >
        <div className="mb-3.5 flex flex-col items-center gap-2 text-center">
          <Avatar name={member.name} src={member.avatar} frame={member.frame} size={64} />
          <div className="flex items-center gap-1.5">
            <span className="text-[16px] font-extrabold text-[#EDEAE2]">{member.name}</span>
            <span className="rounded-[5px] px-1.5 py-0.5 text-[11px] font-bold" style={{ background: badge.bg, color: badge.fg }}>
              {badge.label}
            </span>
          </div>
          {member.username && <div className="text-[12px] text-[#8A8F9C]">@{member.username}</div>}
          {(muted || placeBanned || voteBanned) && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {muted && <BanChip>채팅 금지</BanChip>}
              {placeBanned && <BanChip>배치 금지</BanChip>}
              {voteBanned && <BanChip>투표 금지</BanChip>}
            </div>
          )}
        </div>

        {showControls ? (
          <div className="border-t border-[#232934] pt-3.5">
            <div className="mb-3 text-[10px] font-extrabold tracking-[1px] text-[#6A707E]">관리</div>
            <div className="flex flex-col gap-3.5">
              <BanSection
                icon={<MessageSquareOff className="size-3.5" />}
                label="채팅 금지"
                active={muted}
                onClear={() => onModerate("mute", 0)}
                onPick={(s) => onModerate("mute", s)}
              />
              <BanSection
                icon={<Ban className="size-3.5" />}
                label="배치 금지"
                active={placeBanned}
                onClear={() => onModerate("banPlace", 0)}
                onPick={(s) => onModerate("banPlace", s)}
              />
              <BanSection
                icon={<ListX className="size-3.5" />}
                label="투표 금지"
                active={voteBanned}
                onClear={() => onModerate("banVote", 0)}
                onPick={(s) => onModerate("banVote", s)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onModerate("kick")}
                  className="flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[rgba(239,68,68,.45)] text-[13px] font-bold text-[#F87171]"
                >
                  <UserX className="size-3.5" /> 강퇴
                </button>
                {canAttack && (
                  <button
                    type="button"
                    onClick={() => onModerate("attack")}
                    className="font-pixel flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[2px] text-[13px] font-bold text-white"
                    style={{ border: "2px solid #000", boxShadow: "2px 2px 0 #000", background: "#FF4C3A" }}
                  >
                    <Swords className="size-3.5" /> 공격
                  </button>
                )}
              </div>
              {canGrantAdmin && (
                <button
                  type="button"
                  onClick={() => onGrantAdmin(member.role !== "admin")}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-[6px] text-[12px] font-bold"
                  style={{ border: "1px solid rgba(245,158,11,.5)", background: "rgba(245,158,11,.12)", color: "#F5B942" }}
                >
                  <ShieldCheck className="size-3.5" />
                  {member.role === "admin" ? "관리자 해제" : "관리자 지정"}
                </button>
              )}
            </div>
          </div>
        ) : showAttackOnly ? (
          <div className="border-t border-[#232934] pt-3.5">
            <button
              type="button"
              onClick={() => onModerate("attack")}
              className="font-pixel flex h-[38px] w-full items-center justify-center gap-1.5 rounded-[2px] text-[13px] font-bold text-white"
              style={{ border: "2px solid #000", boxShadow: "2px 2px 0 #000", background: "#FF4C3A" }}
            >
              <Swords className="size-3.5" /> 공격
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 border-t border-[#232934] pt-3.5 text-[12px] text-[#6A707E]">
            <Lock className="size-3.5" />
            {isSelf ? "내 프로필" : "관리 권한이 없습니다"}
          </div>
        )}
      </div>
    </>
  );
}

function BanChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[5px] px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(239,68,68,.12)", color: "#F87171" }}>
      {children}
    </span>
  );
}

function BanSection({
  icon,
  label,
  active,
  onClear,
  onPick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClear: () => void;
  onPick: (seconds: number) => void;
}) {
  return (
    <div>
      <div className="mb-[7px] flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#C4C8D2]">
          {icon}
          {label}
        </span>
        {active && (
          <button type="button" onClick={onClear} className="text-[11px] font-bold text-[#F87171]">
            해제
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {DURATIONS.map((d) => (
          <button
            key={d.s}
            type="button"
            onClick={() => onPick(d.s)}
            className="h-[30px] rounded-[5px] border border-[#2A303C] bg-[#0E1117] text-[12px] font-semibold text-[#C4C8D2] hover:border-[#3A4150]"
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
