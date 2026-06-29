import { useEffect, useState } from "react";
import { Swords, Eye, Shield, X } from "lucide-react";

import type { DecisionSnapshot, DecisionSide, DecisionRole, DuelParticipant } from "@tier-list/shared";

type Props = {
  decision: DecisionSnapshot;
  myUserId?: string;
  onJoin: (side: DecisionSide, role: DecisionRole) => void;
  onLeave: () => void;
};

type Mine = { side: DecisionSide; role: DecisionRole } | null;

function findMine(d: DecisionSnapshot, uid?: string): Mine {
  if (!uid) return null;
  const has = (list: DuelParticipant[]) => list.some((p) => p.userId === uid);
  if (has(d.pro.fighters)) return { side: "pro", role: "fighter" };
  if (has(d.pro.spectators)) return { side: "pro", role: "spectator" };
  if (has(d.con.fighters)) return { side: "con", role: "fighter" };
  if (has(d.con.spectators)) return { side: "con", role: "spectator" };
  return null;
}

function TierChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="font-display inline-flex h-[18px] items-center rounded-[3px] px-1.5 text-[11px] font-bold text-white"
      style={{ background: color, textShadow: "0 1px 1px rgba(0,0,0,.4)" }}
    >
      {label}
    </span>
  );
}

/** Compact roster line: ⚔ fighters · 👁 spectators, with names. */
function Roster({ roster }: { roster: DecisionSnapshot["pro"] }) {
  const names = (list: DuelParticipant[]) => list.map((p) => p.name).join(", ");
  return (
    <div className="space-y-1 text-[11px]">
      <div className="flex items-start gap-1 text-[#E6E9EF]">
        <Swords className="mt-px size-3 shrink-0 text-[#FF6B5A]" />
        <span className="min-w-0 flex-1">
          <b>{roster.fighters.length}</b>
          {roster.fighters.length > 0 && <span className="text-[#8A8F9C]"> · {names(roster.fighters)}</span>}
        </span>
      </div>
      <div className="flex items-start gap-1 text-[#A4AAB6]">
        <Eye className="mt-px size-3 shrink-0 text-[#67E8F9]" />
        <span className="min-w-0 flex-1">
          <b>{roster.spectators.length}</b>
          {roster.spectators.length > 0 && <span className="text-[#6A707E]"> · {names(roster.spectators)}</span>}
        </span>
      </div>
    </div>
  );
}

export function DecisionCard({ decision: d, myUserId, onJoin, onLeave }: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const mine = findMine(d, myUserId);
  const left = Math.max(0, Math.ceil((d.endsAt - Date.now()) / 1000));
  const quorumPct = Math.min(100, (d.participants / Math.max(1, d.needed)) * 100);
  const quorumMet = d.participants >= d.needed;

  const joinBtn = (side: DecisionSide, role: DecisionRole, label: string, icon: React.ReactNode) => {
    const active = mine?.side === side && mine?.role === role;
    const accent = side === "pro" ? "#22C55E" : "#EF4444";
    return (
      <button
        type="button"
        onClick={() => onJoin(side, role)}
        className="flex h-7 flex-1 items-center justify-center gap-1 rounded-[5px] text-[11px] font-bold transition-colors"
        style={
          active
            ? { background: accent, color: "#fff" }
            : { background: "#171B22", color: "#C4C8D2", border: "1px solid #2A303C" }
        }
      >
        {icon} {label}
      </button>
    );
  };

  const side = (s: DecisionSide) => {
    const isPro = s === "pro";
    const roster = isPro ? d.pro : d.con;
    return (
      <div
        className="flex-1 rounded-[6px] border p-2"
        style={{ borderColor: isPro ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)", background: "#0E1117" }}
      >
        <div className="mb-1.5 flex items-center gap-1 text-[11px] font-bold" style={{ color: isPro ? "#4ADE80" : "#F87171" }}>
          {isPro ? <Swords className="size-3" /> : <Shield className="size-3" />}
          {isPro ? "찬성 · 이동" : "반대 · 유지"}
        </div>
        <Roster roster={roster} />
        {d.phase === "signup" && (
          <div className="mt-2 flex gap-1">
            {joinBtn(s, "fighter", "결투", <Swords className="size-3" />)}
            {joinBtn(s, "spectator", "관전", <Eye className="size-3" />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed top-3 left-1/2 z-40 w-[340px] max-w-[92vw] -translate-x-1/2 overflow-hidden rounded-[10px] border"
      style={{ background: "#13161D", borderColor: "#2A303C", boxShadow: "0 16px 48px rgba(0,0,0,.6)", animation: "popIn .18s ease both" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ background: "linear-gradient(90deg,rgba(99,102,241,.18),transparent)" }}>
        <div className="flex items-center gap-1.5 text-[12px] font-extrabold text-white">
          <Swords className="size-3.5 text-[#818CF8]" /> 티어 결정전
        </div>
        {d.phase === "signup" && (
          <span className="font-mono text-[12px] font-bold tabular-nums text-[#FDE047]">{left}s</span>
        )}
        {d.phase === "duel" && <span className="text-[11px] font-bold text-[#FF6B5A]">⚔️ 결투 중</span>}
      </div>

      <div className="px-3 pb-3">
        {/* Proposal line */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] text-[#C4C8D2]">
          <span className="font-bold text-white">{d.itemName}</span>
          {d.currentTier ? <TierChip label={d.currentTier.label} color={d.currentTier.color} /> : <span className="text-[10px] text-[#6A707E]">미배치</span>}
          <span className="text-[#6A707E]">→</span>
          <TierChip label={d.targetTier.label} color={d.targetTier.color} />
        </div>

        {d.phase === "resolved" && d.result ? (
          <ResultBlock d={d} />
        ) : d.phase === "canceled" ? (
          <div className="rounded-[6px] border border-[#2A303C] bg-[#0E1117] py-3 text-center text-[12px] font-bold text-[#8A8F9C]">
            결정전 무산
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              {side("pro")}
              {side("con")}
            </div>

            {d.phase === "duel" && d.duel && (
              <div className="mt-2 rounded-[6px] bg-[#0E1117] py-2 text-center text-[12px] text-[#C4C8D2]">
                <b className="text-[#4ADE80]">{d.duel.pro}</b> <span className="text-[#6A707E]">vs</span>{" "}
                <b className="text-[#F87171]">{d.duel.con}</b>
              </div>
            )}

            {/* Quorum */}
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-[10px]">
                <span className="text-[#6A707E]">참가 정족수</span>
                <span className="font-bold" style={{ color: quorumMet ? "#4ADE80" : "#FDE047" }}>
                  {d.participants}/{d.needed} {quorumMet ? "✓" : ""}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#20252F]">
                <div className="h-full rounded-full transition-all" style={{ width: `${quorumPct}%`, background: quorumMet ? "#22C55E" : "#EAB308" }} />
              </div>
            </div>

            {d.phase === "signup" && mine && (
              <button
                type="button"
                onClick={onLeave}
                className="mt-2 flex h-7 w-full items-center justify-center gap-1 rounded-[5px] border border-[#2A303C] bg-[#171B22] text-[11px] font-semibold text-[#8A8F9C]"
              >
                <X className="size-3" /> 참가 취소
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ResultBlock({ d }: { d: DecisionSnapshot }) {
  const r = d.result!;
  const won = r.winner === "pro";
  return (
    <div
      className="rounded-[6px] border py-3 text-center"
      style={{ borderColor: won ? "rgba(34,197,94,.4)" : "rgba(239,68,68,.4)", background: won ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)" }}
    >
      {won ? (
        <div className="text-[13px] font-extrabold text-[#4ADE80]">
          🏆 찬성 승리 — {r.toLabel} 티어로 1시간 고정
        </div>
      ) : (
        <div className="text-[13px] font-extrabold text-[#F87171]">🛡️ 반대 방어 성공 — 현 티어 유지</div>
      )}
    </div>
  );
}
