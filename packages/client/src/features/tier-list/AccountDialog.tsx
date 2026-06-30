import { useEffect, useRef, useState } from "react";
import { Ban, Camera, Dices, Heart, Shield, ShieldHalf, Swords, X, Zap, type LucideIcon } from "lucide-react";

import { COMBAT_BUFFS, FRAMES, PERKS, RARITY_META, SC_STYLES, SPEC_BUFFS } from "@tier-list/shared";

/** Lucide icon per buff id (and "" → none). */
const BUFF_ICON: Record<string, LucideIcon> = {
  "": Ban,
  bulwark: Shield,
  surge: Zap,
  gamble: Dices,
  life: Heart,
  double: Swords,
  half: ShieldHalf,
};
import type { AuthUser, CodeInfo, IssueCodeResult, RedeemResult, UpdateResult } from "@tier-list/shared";
import { Avatar } from "./Avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type AccountDialogProps = {
  user: AuthUser;
  onUpdateProfile: (patch: { nickname?: string; avatar?: string }) => Promise<UpdateResult>;
  onEquip: (patch: { frame?: string; scStyle?: string; specBuff?: string; combatBuff?: string }) => Promise<UpdateResult>;
  onRedeem: (code: string) => Promise<RedeemResult>;
  onIssueCode: (perks: string[]) => Promise<IssueCodeResult>;
  onFetchCodes: () => Promise<CodeInfo[]>;
  onLogout: () => void;
  onClose: () => void;
};

/** 계정 관리: nickname, equipped frame / superchat style, code redemption. */
export function AccountDialog({
  user,
  onUpdateProfile,
  onEquip,
  onRedeem,
  onIssueCode,
  onFetchCodes,
  onLogout,
  onClose,
}: AccountDialogProps) {
  const [nickname, setNickname] = useState(user.nickname);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [issuePerks, setIssuePerks] = useState<Set<string>>(new Set());
  const [issued, setIssued] = useState<string | null>(null);
  const [codes, setCodes] = useState<CodeInfo[]>([]);
  const avatarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user.isAdmin) void onFetchCodes().then(setCodes);
  }, [user.isAdmin, onFetchCodes]);

  // Downscale the picked image to a 128px square (under the server's size cap).
  function pickAvatar(file?: File) {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const S = 128;
      const canvas = document.createElement("canvas");
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
        void onUpdateProfile({ avatar: canvas.toDataURL("image/jpeg", 0.85) });
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  async function issue() {
    if (issuePerks.size === 0) return;
    setBusy(true);
    const res = await onIssueCode([...issuePerks]);
    setBusy(false);
    if (res.ok) {
      setIssued(res.code.code);
      setIssuePerks(new Set());
      void onFetchCodes().then(setCodes);
    } else {
      setMsg({ ok: false, text: res.error ?? "코드 발급 실패" });
    }
  }

  const ownedFrames = Object.keys(FRAMES).filter((id) => user.unlocked.includes(id));

  async function save() {
    const n = nickname.trim();
    if (!n) return;
    setBusy(true);
    const res = await onUpdateProfile({ nickname: n });
    setBusy(false);
    if (res.ok) onClose();
    else setMsg({ ok: false, text: res.error ?? "저장 실패" });
  }

  async function redeem() {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    const res = await onRedeem(c);
    setBusy(false);
    if (res.ok) {
      setCode("");
      setMsg({ ok: true, text: "코드를 적용했습니다." });
    } else {
      setMsg({ ok: false, text: res.error ?? "코드가 올바르지 않습니다." });
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/60" />
      <div
        className="fixed top-1/2 left-1/2 z-[61] max-h-[90vh] w-[720px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[10px] border border-[#242a3a] bg-[#13161D]"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,.6)", animation: "popIn .16s ease both" }}
      >
        <div className="flex items-center gap-2 border-b border-[#1B1F27] px-[18px] py-3.5">
          <span className="text-[15px] font-extrabold text-[#EDEAE2]">내 계정</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid size-[26px] place-items-center rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[#8A8F9C]"
          >
            <X className="size-3" strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-[18px]">
          <div className="mb-[18px] flex items-center gap-3.5">
            <div className="relative shrink-0">
              <Avatar name={user.nickname} src={user.avatar} frame={user.frame} size={60} />
              <button
                type="button"
                onClick={() => avatarRef.current?.click()}
                title="프로필 이미지 변경"
                className="absolute -right-1 -bottom-1 grid size-[22px] place-items-center rounded-full border border-[#2A303C] bg-[#161B22] text-[#A5B4FC]"
              >
                <Camera className="size-3" />
              </button>
              <input
                ref={avatarRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  pickAvatar(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">닉네임</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="h-[38px] w-full rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-3 text-[13px] text-[#EDEAE2] outline-none focus:border-[#6366F1]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-5">
           <div>
          <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">장착 — 아바타 프레임</label>
          <div className="mb-4 flex flex-wrap gap-2.5">
            <FrameOption selected={!user.frame} label="없음" onClick={() => onEquip({ frame: "" })}>
              <Avatar name={user.nickname} src={user.avatar} size={44} />
            </FrameOption>
            {ownedFrames.map((id) => (
              <FrameOption key={id} selected={user.frame === id} label={FRAMES[id].name} onClick={() => onEquip({ frame: id })}>
                <Avatar name={user.nickname} src={user.avatar} frame={id} size={44} />
              </FrameOption>
            ))}
            {ownedFrames.length === 0 && (
              <span className="self-center text-[11px] text-[#6A707E]">보유한 프레임이 없습니다.</span>
            )}
          </div>

          <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">장착 — 슈퍼챗 스타일</label>
          <div className="mb-4 flex flex-col gap-2">
            {Object.entries(SC_STYLES).map(([id, sc]) => {
              const owned = id === "base" || user.unlocked.includes(id);
              const equipped = (user.scStyle ?? "") === id;
              const rm = RARITY_META[sc.rarity];
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!owned}
                  onClick={() => owned && onEquip({ scStyle: id })}
                  className={
                    owned
                      ? `flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 ${sc.gradient} ${sc.effect ?? ""}`
                      : "flex items-center gap-2.5 rounded-[6px] border border-dashed border-[#2A3142] bg-[#0E1117] px-2.5 py-2 opacity-60"
                  }
                  style={equipped ? { boxShadow: "0 0 0 2px #6366F1" } : undefined}
                >
                  <span
                    className={`rounded-[5px] px-2 py-[3px] text-[11px] font-bold ${owned ? "bg-white/85 text-black" : rm.className}`}
                  >
                    {rm.label}
                  </span>
                  <span className={`flex-1 text-left text-[13px] font-bold ${owned ? (sc.text ?? "text-white") : "text-[#6B7280]"}`}>
                    {sc.name}
                  </span>
                  {equipped ? (
                    <span className="rounded-[5px] bg-[#6366F1] px-2 py-[3px] text-[11px] font-bold text-white">장착중</span>
                  ) : owned ? (
                    <span className="text-[11px] font-semibold text-white/80">보유</span>
                  ) : (
                    <span className="text-[11px] text-[#5A6070]">미보유 · 코드 필요</span>
                  )}
                </button>
              );
            })}
          </div>

          <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">장착 — 관전 버프 (결정전)</label>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {[{ id: "", name: "없음", desc: "관전 시 팀에 버프를 주지 않습니다" }, ...SPEC_BUFFS].map((b) => {
              const equipped = (user.specBuff ?? "") === b.id;
              const Icon = BUFF_ICON[b.id] ?? Ban;
              return (
                <Tooltip key={b.id || "none"}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onEquip({ specBuff: b.id })}
                      className="flex min-w-[58px] flex-1 flex-col items-center gap-1 rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-1 py-2"
                      style={equipped ? { boxShadow: "0 0 0 2px #6366F1" } : undefined}
                    >
                      <Icon className="size-[18px] text-[#A9AEF5]" />
                      <span className="w-full truncate text-center text-[11px] font-bold text-white">{b.name}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="font-bold text-white">{b.name}</div>
                    <div className="text-[#9AA0AD]">{b.desc}</div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">장착 — 전투 버프 (결정전 결투)</label>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {[
              { id: "", name: "없음", desc: "결투 시 팀에 버프를 주지 않습니다" },
              ...COMBAT_BUFFS.filter((b) => !b.admin || user.isAdmin),
            ].map((b) => {
              const equipped = (user.combatBuff ?? "") === b.id;
              const Icon = BUFF_ICON[b.id] ?? Ban;
              return (
                <Tooltip key={b.id || "none"}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onEquip({ combatBuff: b.id })}
                      className="flex min-w-[58px] flex-1 flex-col items-center gap-1 rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-1 py-2"
                      style={equipped ? { boxShadow: "0 0 0 2px #6366F1" } : undefined}
                    >
                      <Icon className="size-[18px] text-[#F5B942]" />
                      <span className="w-full truncate text-center text-[11px] font-bold text-white">{b.name}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="font-bold text-white">{b.name}</div>
                    <div className="text-[#9AA0AD]">{b.desc}</div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
           </div>

           <div>
          <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">코드 입력 (스킨·perk 상환)</label>
          <div className="mb-4 flex gap-2">
            <input
              value={code}
              placeholder="예: TIER-XXXX-XXXX"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && redeem()}
              className="h-[38px] flex-1 rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-3 font-mono text-[13px] tracking-[1px] text-[#EDEAE2] outline-none focus:border-[#6366F1]"
            />
            <button
              type="button"
              disabled={busy || !code.trim()}
              onClick={redeem}
              className="h-[38px] shrink-0 rounded-[6px] border border-[#2A303C] bg-[#171B22] px-4 text-[13px] font-semibold text-[#C4C8D2] disabled:opacity-40"
            >
              확인
            </button>
          </div>

          {msg && (
            <div className={`mb-3 text-[12px] ${msg.ok ? "text-[#5BD3A0]" : "text-[#F87171]"}`}>{msg.text}</div>
          )}

          {user.isAdmin && (
            <div className="mb-4 rounded-[8px] border border-[rgba(245,158,11,.35)] bg-[rgba(245,158,11,.06)] p-3">
              <div className="mb-2 text-[11px] font-bold text-[#F5B942]">관리자 — 코드 발급</div>
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {PERKS.map((p) => {
                  const on = issuePerks.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setIssuePerks((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        })
                      }
                      className="rounded-[5px] border px-2 py-1 text-[11px] font-semibold"
                      style={
                        on
                          ? { borderColor: "#6366F1", background: "rgba(99,102,241,.16)", color: "#A5B4FC" }
                          : { borderColor: "#2A303C", background: "#0E1117", color: "#8A8F9C" }
                      }
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={busy || issuePerks.size === 0}
                onClick={issue}
                className="h-9 w-full rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[12px] font-bold text-[#C4C8D2] disabled:opacity-40"
              >
                코드 발급 ({issuePerks.size})
              </button>
              {issued && (
                <div className="mt-2 rounded-[6px] border border-[#2A303C] bg-[#0E1117] px-3 py-2 text-center font-mono text-[14px] font-bold tracking-[2px] text-[#EDEAE2] select-all">
                  {issued}
                </div>
              )}

              {codes.length > 0 && (
                <div className="mt-3 flex max-h-[160px] flex-col gap-1.5 overflow-y-auto">
                  {codes.map((c) => (
                    <div
                      key={c.code}
                      className="flex items-center gap-2 rounded-[6px] border border-[#232934] bg-[#0E1117] px-2.5 py-1.5"
                    >
                      <span className="font-mono text-[12px] font-bold tracking-[1px] text-[#EDEAE2] select-all">{c.code}</span>
                      <span className="flex-1 truncate text-[10px] text-[#8A8F9C]" title={c.perks.join(", ")}>
                        {c.perks.join(", ")}
                      </span>
                      <span
                        className="shrink-0 rounded-[4px] px-1.5 py-px text-[10px] font-bold"
                        style={
                          c.usedBy
                            ? { background: "rgba(239,68,68,.12)", color: "#F87171" }
                            : !c.singleUse
                              ? { background: "rgba(99,102,241,.14)", color: "#A5B4FC" }
                              : { background: "rgba(91,211,160,.12)", color: "#5BD3A0" }
                        }
                      >
                        {c.usedBy ? `사용됨 · ${c.usedBy}` : c.singleUse ? "미사용" : "재사용"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
           </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="h-10 flex-1 rounded-[6px] bg-[#6366F1] text-[13px] font-bold text-white disabled:opacity-50"
            >
              저장
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="h-10 rounded-[6px] border border-[rgba(239,68,68,.45)] bg-transparent px-4 text-[13px] font-bold text-[#F87171]"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function FrameOption({
  selected,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" title={label} onClick={onClick} className="flex flex-col items-center gap-1">
      <span
        className="grid size-[58px] place-items-center rounded-[8px] border"
        style={{ borderColor: selected ? "#6366F1" : "#242a3a", background: selected ? "rgba(99,102,241,.12)" : "#0E1117" }}
      >
        {children}
      </span>
      <span
        className="max-w-[58px] truncate text-[9px] font-semibold"
        style={{ color: selected ? "#A5B4FC" : "#6A707E" }}
      >
        {label}
      </span>
    </button>
  );
}
