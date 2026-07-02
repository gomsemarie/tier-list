import { useEffect, useState } from "react";
import { Swords, Eye, Shield, X, Info, ArrowRight, Heart, Zap, Scale, Trophy, Check, UserPlus, TrendingUp, Dices, type LucideIcon } from "lucide-react";

import type { DecisionSnapshot, DecisionSide, DecisionRole, DuelParticipant, DecisionBuffs } from "@tier-list/shared";
import { Avatar } from "./Avatar";

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

const PHASE_LABEL: Record<DecisionSnapshot["phase"], string> = {
  signup: "모집 중",
  balance: "인원 보충",
  duel: "결투 중",
  resolved: "종료",
  canceled: "무산",
};

function TierChip({ label, color, big }: { label: string; color: string; big?: boolean }) {
  return (
    <span
      className={`font-display inline-flex items-center rounded-[4px] font-bold text-white ${big ? "h-[24px] px-2 text-[13px]" : "h-[20px] px-1.5 text-[12px]"}`}
      style={{ background: color, textShadow: "0 1px 1px rgba(0,0,0,.4)" }}
    >
      {label}
    </span>
  );
}

/** Small square profile card for a spectator (avatar + name). */
function SpecCards({ list }: { list: DuelParticipant[] }) {
  if (list.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.map((p) => (
        <div key={p.userId} className="flex w-[34px] flex-col items-center gap-0.5">
          <Avatar name={p.name} src={p.avatar} frame={p.frame} size={28} spin={false} />
          <span className="w-full truncate text-center text-[9px] text-[#8A8F9C]">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

/** A bracket seat: a fighter profile card, or a dashed "모집 중" placeholder. */
function FighterSlot({ p, side }: { p?: DuelParticipant; side: DecisionSide }) {
  const color = side === "pro" ? "#4ADE80" : "#F87171";
  const ring = side === "pro" ? "rgba(34,197,94,.65)" : "rgba(239,68,68,.65)";
  if (!p) {
    return (
      <div className="flex w-[78px] flex-col items-center gap-1">
        <div className="grid size-11 place-items-center rounded-[6px] border border-dashed border-[#3A4150] text-[#5A6070]">
          <UserPlus className="size-4" />
        </div>
        <span className="text-[10px] text-[#5A6070]">모집 중</span>
      </div>
    );
  }
  return (
    <div className="flex w-[78px] flex-col items-center gap-1">
      <span className="rounded-[7px] p-[2px]" style={{ boxShadow: `0 0 0 2px ${ring}` }}>
        <Avatar name={p.name} src={p.avatar} frame={p.frame} size={42} spin={false} />
      </span>
      <span className="w-full truncate text-center text-[10px] font-bold" style={{ color }}>
        {p.name}
      </span>
    </div>
  );
}

/** Matchup preview. Parry games pair 찬성 vs 반대 by seat; Tetris is a free-for-all
 *  arena so it just lists each team's roster (unequal counts are fine). */
function Bracket({ pro, con, mode }: { pro: DuelParticipant[]; con: DuelParticipant[]; mode: string }) {
  const rows = Math.max(pro.length, con.length);
  if (mode === "tetris") {
    return (
      <div className="mt-3 rounded-[9px] bg-[#0E1117] p-3">
        <div className="mb-2.5 text-center text-[10px] font-bold tracking-wide text-[#6A707E]">
          {pro.length} vs {con.length} · 다대다 자유 대전
        </div>
        {pro.length === 0 && con.length === 0 ? (
          <div className="py-2 text-center text-[11px] text-[#6A707E]">결투에 참가하면 참가자가 표시됩니다</div>
        ) : (
          <div className="flex items-start justify-center gap-3">
            <div className="flex flex-col gap-1.5">{pro.map((p) => <FighterSlot key={p.userId} p={p} side="pro" />)}</div>
            <span className="font-arcade self-center text-[12px] font-bold text-[#6A707E]">VS</span>
            <div className="flex flex-col gap-1.5">{con.map((p) => <FighterSlot key={p.userId} p={p} side="con" />)}</div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-[9px] bg-[#0E1117] p-3">
      <div className="mb-2.5 text-center text-[10px] font-bold tracking-wide text-[#6A707E]">대진표</div>
      {rows === 0 ? (
        <div className="py-2 text-center text-[11px] text-[#6A707E]">결투에 참가하면 대진이 표시됩니다</div>
      ) : (
        <div className="space-y-2.5">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-center gap-3">
              <FighterSlot p={pro[i]} side="pro" />
              <span className="font-arcade text-[12px] font-bold text-[#6A707E]">VS</span>
              <FighterSlot p={con[i]} side="con" />
            </div>
          ))}
        </div>
      )}
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
  const recruiting = d.phase === "signup" || d.phase === "balance";
  const quorumPct = Math.min(100, (d.participants / Math.max(1, d.needed)) * 100);
  const quorumMet = d.participants >= d.needed;

  const joinBtn = (side: DecisionSide, role: DecisionRole, label: string, icon: React.ReactNode) => {
    const active = mine?.side === side && mine?.role === role;
    const accent = side === "pro" ? "#22C55E" : "#EF4444";
    return (
      <button
        type="button"
        title={active ? "다시 누르면 참가 해제" : undefined}
        onClick={() => (active ? onLeave() : onJoin(side, role))}
        className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[6px] text-[12px] font-bold transition-colors"
        style={
          active
            ? { background: accent, color: "#fff", boxShadow: `0 2px 10px ${accent}66` }
            : { background: "#1A1F28", color: "#C4C8D2", border: "1px solid #2A303C" }
        }
      >
        {icon} {label}
      </button>
    );
  };

  const side = (s: DecisionSide) => {
    const isPro = s === "pro";
    const roster = isPro ? d.pro : d.con;
    const accent = isPro ? "#22C55E" : "#EF4444";
    const accentText = isPro ? "#4ADE80" : "#F87171";
    return (
      <div
        className="rounded-[9px] border p-2.5"
        style={{
          borderColor: isPro ? "rgba(34,197,94,.4)" : "rgba(239,68,68,.4)",
          background: isPro ? "rgba(34,197,94,.05)" : "rgba(239,68,68,.05)",
        }}
      >
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="grid size-[22px] shrink-0 place-items-center rounded-[5px]" style={{ background: accent }}>
            {isPro ? <Swords className="size-3.5 text-white" /> : <Shield className="size-3.5 text-white" />}
          </span>
          <span className="text-[14px] font-extrabold" style={{ color: accentText }}>
            {isPro ? "찬성" : "반대"}
          </span>
          <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-bold text-[#8A8F9C]">
            {isPro ? "티어 이동" : "현재 유지"}
          </span>
          <span className="ml-auto flex items-center gap-3 text-[12px] font-bold">
            <span className="flex items-center gap-1" style={{ color: accentText }}>
              <Swords className="size-3.5" /> {roster.fighters.length}
            </span>
            <span className="flex items-center gap-1 text-[#67E8F9]">
              <Eye className="size-3.5" /> {roster.spectators.length}
            </span>
          </span>
        </div>
        <BuffRow
          own={isPro ? d.buffs.pro : d.buffs.con}
          opp={isPro ? d.buffs.con : d.buffs.pro}
          duel={d.phase === "duel"}
        />
        <SpecCards list={roster.spectators} />
      </div>
    );
  };

  return (
    <div
      className="w-full shrink-0 overflow-hidden rounded-[10px] border"
      style={{ background: "#13161D", borderColor: "#2A303C", boxShadow: "0 8px 24px rgba(0,0,0,.45)", animation: "popIn .18s ease both" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: "linear-gradient(90deg,rgba(99,102,241,.28),rgba(99,102,241,.04))" }}
      >
        <div className="flex items-center gap-2">
          <Swords className="size-[18px] text-[#818CF8]" />
          <span className="text-[15px] font-extrabold tracking-tight text-white">티어 결정전</span>
          <span className="rounded-full bg-[#6366F1]/25 px-2 py-[3px] text-[10px] font-bold text-[#A9AEF5]">
            {PHASE_LABEL[d.phase]}
          </span>
        </div>
        {recruiting && (
          <span className="font-mono text-[20px] leading-none font-extrabold tabular-nums text-[#FDE047]">
            {left}
            <span className="text-[12px] text-[#A89A3A]">s</span>
          </span>
        )}
      </div>

      <div className="px-3 pt-3 pb-3">
        {/* Proposal: item + tier transition */}
        <div className="mb-3 flex items-center gap-2 rounded-[8px] bg-[#0E1117] px-3 py-2.5">
          {d.itemImage && (
            <img src={d.itemImage} alt="" className="size-8 shrink-0 rounded-[5px] object-cover" />
          )}
          <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-white">{d.itemName}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {d.currentTier ? (
              <TierChip label={d.currentTier.label} color={d.currentTier.color} />
            ) : (
              <span className="text-[11px] text-[#6A707E]">미배치</span>
            )}
            <ArrowRight className="size-4 text-[#6A707E]" />
            <TierChip label={d.targetTier.label} color={d.targetTier.color} big />
          </div>
        </div>

        {d.phase === "resolved" && d.result ? (
          <ResultBlock d={d} />
        ) : d.phase === "canceled" ? (
          <div className="rounded-[8px] border border-[#2A303C] bg-[#0E1117] py-4 text-center text-[13px] font-bold text-[#8A8F9C]">
            결정전이 무산되었습니다
          </div>
        ) : (
          <>
            {recruiting && (
              <div className="mb-3 flex gap-2 rounded-[8px] bg-[#0E1117] px-3 py-2.5 text-[11px] leading-relaxed text-[#9AA0AD]">
                <Info className="mt-px size-3.5 shrink-0 text-[#818CF8]" />
                <span>
                  {d.mode === "tetris" ? "테트리스 다대다 대전" : "실력(패링 결투)"}으로 티어를 정합니다. <b className="text-[#86EFAC]">찬성</b> 승리 →{" "}
                  <b className="text-white">{d.targetTier.label} 티어로 1시간 고정</b>, <b className="text-[#FCA5A5]">반대</b> 승리
                  → 현재 티어 유지. 방 인원 <b className="text-[#E6E9EF]">절반 이상</b> 참가 +{" "}
                  {d.mode === "tetris" ? (
                    <b className="text-[#E6E9EF]">각 팀 최소 1명</b>
                  ) : (
                    "양측 결투자"
                  )}
                  {d.mode === "tetris" ? "이면 시작돼요 (인원 동수 불필요)." : "가 있어야 시작돼요."}
                </span>
              </div>
            )}

            {d.phase === "balance" && (
              <div className="mb-3 flex items-center justify-center gap-1.5 rounded-[8px] border border-[rgba(234,179,8,.4)] bg-[rgba(234,179,8,.1)] px-3 py-2 text-center text-[12px] font-bold text-[#FACC15]">
                <Scale className="size-3.5 shrink-0" /> 양측 결투 인원을 맞추는 중 — 부족한 쪽에 결투 참가하세요
              </div>
            )}

            <div className="space-y-2">
              {side("pro")}
              {side("con")}
            </div>

            {d.phase === "duel" && d.duel ? (
              <DuelBoard duel={d.duel} />
            ) : (
              <>
                <Bracket pro={d.pro.fighters} con={d.con.fighters} mode={d.mode} />

                {/* Quorum */}
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-[#8A8F9C]">참가 인원 · 방 인원 절반 이상 필요</span>
                    <span className="flex items-center gap-1 font-bold" style={{ color: quorumMet ? "#4ADE80" : "#FDE047" }}>
                      {d.participants} / {d.needed}명{quorumMet && (
                        <>
                          <Check className="size-3" /> 충족
                        </>
                      )}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#20252F]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${quorumPct}%`, background: quorumMet ? "#22C55E" : "#EAB308" }}
                    />
                  </div>
                </div>

                {/* Unified join actions (card bottom) */}
                <div className="mt-3 space-y-1.5 border-t border-[#20252F] pt-3">
                  {(["pro", "con"] as const).map((sd) => {
                    const isPro = sd === "pro";
                    return (
                      <div key={sd} className="flex items-center gap-1.5">
                        <span
                          className="w-8 shrink-0 text-[12px] font-extrabold"
                          style={{ color: isPro ? "#4ADE80" : "#F87171" }}
                        >
                          {isPro ? "찬성" : "반대"}
                        </span>
                        {joinBtn(sd, "fighter", "결투 참가", <Swords className="size-3.5" />)}
                        {d.phase === "signup" && joinBtn(sd, "spectator", "관전 참가", <Eye className="size-3.5" />)}
                      </div>
                    );
                  })}
                  {mine && (
                    <button
                      type="button"
                      onClick={onLeave}
                      className="flex h-7 w-full items-center justify-center gap-1.5 rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[11px] font-semibold text-[#9AA0AD] hover:text-white"
                    >
                      <X className="size-3.5" /> 참가 취소
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const BUFF_META: Record<"bulwark" | "surge" | "gamble" | "life", { Icon: LucideIcon; name: string; color: string; desc: string }> = {
  bulwark: { Icon: Shield, name: "방어", color: "#67E8F9", desc: "아군의 난이도 상승을 흡수해 막아냅니다." },
  surge: { Icon: Zap, name: "공격", color: "#FBBF24", desc: "상대 시작 난이도를 높입니다." },
  gamble: { Icon: Dices, name: "도박", color: "#C084FC", desc: "아군 난이도가 오를 때마다 인원수만큼 ±1 도박 — 감소도, 폭증도 가능합니다." },
  life: { Icon: Heart, name: "목숨", color: "#F472B6", desc: "탈락 시 목숨을 소모해 부활합니다 (팀 공유)." },
};

/** Game-style buff badge — icon + value, with a detail tooltip on hover. */
function BuffBadge({ kind, value, sub }: { kind: keyof typeof BUFF_META; value: string; sub: string }) {
  const m = BUFF_META[kind];
  const Icon = m.Icon;
  return (
    <div className="group/buff relative">
      <span
        className="flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[11px] font-extrabold"
        style={{ color: m.color, borderColor: `${m.color}55`, background: `${m.color}14` }}
      >
        <Icon className="size-3" /> {value}
      </span>
      <div className="pointer-events-none invisible absolute top-full left-0 z-20 mt-1 w-[170px] rounded-[7px] border border-[#2A303C] bg-[#0B0E13] px-2.5 py-2 opacity-0 shadow-[0_10px_28px_rgba(0,0,0,.6)] transition-opacity group-hover/buff:visible group-hover/buff:opacity-100">
        <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: m.color }}>
          <Icon className="size-3.5" /> {m.name} <span className="ml-auto text-[#8A8F9C]">{sub}</span>
        </div>
        <div className="mt-1 text-[10px] leading-relaxed text-[#9AA0AD]">{m.desc}</div>
      </div>
    </div>
  );
}

/** Received start-difficulty penalty badge from the opponent's 공격. */
function NetBadge({ oppSurge }: { oppSurge: number }) {
  if (oppSurge <= 0) return null;
  const color = "#FB7185";
  return (
    <div className="group/buff relative">
      <span
        className="flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[11px] font-extrabold"
        style={{ color, borderColor: `${color}55`, background: `${color}14` }}
      >
        <TrendingUp className="size-3" /> 시작 +{oppSurge}
      </span>
      <div className="pointer-events-none invisible absolute top-full left-0 z-20 mt-1 w-[180px] rounded-[7px] border border-[#2A303C] bg-[#0B0E13] px-2.5 py-2 opacity-0 shadow-[0_10px_28px_rgba(0,0,0,.6)] transition-opacity group-hover/buff:visible group-hover/buff:opacity-100">
        <div className="text-[11px] font-bold" style={{ color }}>
          받는 시작 페널티 +{oppSurge}
        </div>
        <div className="mt-1 text-[10px] leading-relaxed text-[#9AA0AD]">
          상대 공격 +{oppSurge} 만큼 더 불리하게 시작합니다.
        </div>
      </div>
    </div>
  );
}

/** Buff badges for one side: pooled buffs + the received start penalty. */
function BuffRow({ own, opp, duel }: { own: DecisionBuffs; opp: DecisionBuffs; duel: boolean }) {
  if (!own.bulwark && !own.surge && !own.gamble && !own.life && !opp.surge) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {own.bulwark > 0 && (
        <BuffBadge
          kind="bulwark"
          value={duel ? `${own.bulwarkLeft}/${own.bulwark}` : `${own.bulwark}`}
          sub={duel ? `남은 ${own.bulwarkLeft}회` : `${own.bulwark}회`}
        />
      )}
      {own.surge > 0 && <BuffBadge kind="surge" value={`${own.surge}`} sub={`상대 +${own.surge}`} />}
      {own.gamble > 0 && <BuffBadge kind="gamble" value={`${own.gamble}`} sub={`±${own.gamble} 도박`} />}
      {own.life > 0 && (
        <BuffBadge
          kind="life"
          value={duel ? `${own.lifeLeft}/${own.life}` : `+${own.life}`}
          sub={duel ? `남은 ${own.lifeLeft}` : `+${own.life} 목숨`}
        />
      )}
      <NetBadge oppSurge={opp.surge} />
    </div>
  );
}

/** Live NvN board: survivor tally + active matchups with each fighter's stack. */
function DuelBoard({ duel }: { duel: NonNullable<DecisionSnapshot["duel"]> }) {
  const now = Date.now();
  const live = duel.feed.filter((e) => now - e.ts < 3500).slice(-4);
  const dot = (alive: number, total: number) =>
    Array.from({ length: total }, (_, i) => (
      <span
        key={i}
        className="inline-block size-2.5 rounded-full"
        style={{ background: i < alive ? "currentColor" : "rgba(255,255,255,.14)" }}
      />
    ));
  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex items-center justify-center gap-4 rounded-[8px] bg-[#0E1117] py-2.5 text-[18px] font-extrabold">
        <span className="flex items-center gap-1.5 text-[#4ADE80]">
          {duel.proAlive}
          <span className="flex gap-1">{dot(duel.proAlive, duel.proTotal)}</span>
        </span>
        <span className="text-[12px] text-[#6A707E]">남음</span>
        <span className="flex items-center gap-1.5 text-[#F87171]">
          <span className="flex gap-1">{dot(duel.conAlive, duel.conTotal)}</span>
          {duel.conAlive}
        </span>
      </div>
      {live.length > 0 && (
        <div className="space-y-0.5 rounded-[6px] bg-[#0E1117] px-2 py-1.5">
          {live.map((e, i) => {
            const op = Math.max(0.35, 1 - (now - e.ts) / 3500);
            return (
              <div
                key={`${e.ts}-${i}`}
                className="flex items-center justify-center gap-1.5 text-[10px] font-bold"
                style={{ opacity: op }}
              >
                <span className="max-w-[100px] truncate" style={{ color: e.side === "pro" ? "#4ADE80" : "#F87171" }}>
                  {e.name}
                </span>
                {e.kind === "absorb" ? (
                  <span className="flex items-center gap-1 text-[#67E8F9]">
                    <Shield className="size-3" /> 방어로 막음
                  </span>
                ) : e.kind === "life" ? (
                  <span className="flex items-center gap-1 text-[#F472B6]">
                    <Heart className="size-3" /> 목숨 소모 — 부활!
                  </span>
                ) : (
                  <span className="flex items-center gap-1" style={{ color: e.amount > 0 ? "#FB7185" : "#4ADE80" }}>
                    <Dices className="size-3 text-[#C084FC]" /> 도박 {e.amount > 0 ? `+${e.amount}` : e.amount}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {duel.pairs.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-center text-[10px] font-bold tracking-wide text-[#6A707E]">진행 중인 대결</div>
          {duel.pairs.map((p, i) => (
            <div key={i} className="flex items-center gap-2 rounded-[6px] bg-[#0E1117] px-2.5 py-1.5 text-[11px]">
              <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                {p.proLevel > 0 && <span className="text-[10px] text-[#FF6B5A]">LV{p.proLevel}</span>}
                <span className="truncate font-bold text-[#A4F4C0]">{p.pro.name}</span>
                <Avatar name={p.pro.name} src={p.pro.avatar} frame={p.pro.frame} size={24} spin={false} />
              </div>
              <Swords className="size-3.5 shrink-0 text-[#6A707E]" />
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <Avatar name={p.con.name} src={p.con.avatar} frame={p.con.frame} size={24} spin={false} />
                <span className="truncate font-bold text-[#F4A4A4]">{p.con.name}</span>
                {p.conLevel > 0 && <span className="text-[10px] text-[#FF6B5A]">LV{p.conLevel}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {duel.results.length > 0 && (
        <div className="space-y-1">
          <div className="text-center text-[10px] font-bold tracking-wide text-[#6A707E]">종료된 대결</div>
          {duel.results.map((r, i) => {
            const proWon = r.winnerSide === "pro";
            const proF = proWon ? r.winner : r.loser;
            const conF = proWon ? r.loser : r.winner;
            return (
              <DoneRow key={`r${i}`} proF={proF} conF={conF} proWon={proWon} />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A finished matchup row: winner highlighted, loser struck-through + greyed. */
function DoneRow({ proF, conF, proWon }: { proF: DuelParticipant; conF: DuelParticipant; proWon: boolean }) {
  const name = (p: DuelParticipant, won: boolean) => (
    <span className={`truncate text-[11px] font-bold ${won ? "text-[#FDE047]" : "text-[#8A8F9C] line-through"}`}>
      {p.name}
    </span>
  );
  const av = (p: DuelParticipant, won: boolean) => (
    <Avatar name={p.name} src={p.avatar} frame={p.frame} size={20} spin={false} className={won ? "" : "grayscale opacity-60"} />
  );
  return (
    <div className="flex items-center gap-2 rounded-[6px] bg-[#0E1117]/50 px-2.5 py-1">
      <div className={`flex min-w-0 flex-1 items-center justify-end gap-1.5 ${proWon ? "" : "opacity-60"}`}>
        {proWon && <Trophy className="size-3 shrink-0 text-[#FDE047]" />}
        {name(proF, proWon)}
        {av(proF, proWon)}
      </div>
      <span className="font-arcade shrink-0 text-[9px] font-bold text-[#FF6B5A]">KO</span>
      <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${!proWon ? "" : "opacity-60"}`}>
        {av(conF, !proWon)}
        {name(conF, !proWon)}
        {!proWon && <Trophy className="size-3 shrink-0 text-[#FDE047]" />}
      </div>
    </div>
  );
}

function ResultBlock({ d }: { d: DecisionSnapshot }) {
  const r = d.result!;
  const won = r.winner === "pro";
  return (
    <div
      className="rounded-[8px] border py-4 text-center"
      style={{
        borderColor: won ? "rgba(34,197,94,.45)" : "rgba(239,68,68,.45)",
        background: won ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)",
      }}
    >
      {won ? (
        <>
          <div className="flex items-center justify-center gap-1.5 text-[16px] font-extrabold text-[#4ADE80]">
            <Trophy className="size-4" /> 찬성 승리
          </div>
          <div className="mt-1 text-[12px] font-semibold text-[#A4F4C0]">
            {r.toLabel} 티어로 1시간 고정
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center gap-1.5 text-[16px] font-extrabold text-[#F87171]">
            <Shield className="size-4" /> 반대 방어 성공
          </div>
          <div className="mt-1 text-[12px] font-semibold text-[#F4A4A4]">현재 티어 유지</div>
        </>
      )}
    </div>
  );
}
