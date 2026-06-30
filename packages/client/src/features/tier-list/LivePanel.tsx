import { useEffect, useRef, useState } from "react";
import { ChevronRight, Eraser, History, MessagesSquare, Send, SlashSquare, Sparkles, Swords, Trophy } from "lucide-react";

import { COMMANDS, findCommand, SC_STYLES } from "@tier-list/shared";
import type {
  ChangeEntry,
  ChatMessage,
  CommandSpec,
  DecisionRole,
  DecisionSide,
  DecisionSnapshot,
  Member,
  VoteSnapshot,
} from "@tier-list/shared";
import { Avatar } from "./Avatar";
import { PanelVoteCard } from "./PanelVoteCard";
import { DecisionCard } from "./DecisionCard";

type LivePanelProps = {
  members: Member[];
  messages: ChatMessage[];
  history: ChangeEntry[];
  activeVote: VoteSnapshot | null;
  voteOptOut: boolean;
  /** In-progress decision match, rendered in-panel (null = none). */
  activeDecision: DecisionSnapshot | null;
  myUserId?: string;
  onDecisionJoin: (side: DecisionSide, role: DecisionRole) => void;
  onDecisionLeave: () => void;
  canSuper: boolean;
  canModerate: boolean;
  onCast: (tierId: string) => void;
  onSend: (text: string) => void;
  onClearChat: () => void;
  onOpenMember: (member: Member) => void;
};

function roleBadge(role?: Member["role"]) {
  if (role === "owner") return { label: "방장", bg: "#3B4B94", fg: "#fff" };
  if (role === "admin") return { label: "관리자", bg: "rgba(245,158,11,.16)", fg: "#F5B942" };
  return null;
}

function swatch(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360},40%,46%)`;
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간`;
  return `${Math.floor(s / 86400)}일`;
}

/** Right-side live panel: chat / change-history tabs, pinned notice, vote card. */
export function LivePanel({
  members,
  messages,
  history,
  activeVote,
  voteOptOut,
  activeDecision,
  myUserId,
  onDecisionJoin,
  onDecisionLeave,
  canSuper,
  canModerate,
  onCast,
  onSend,
  onClearChat,
  onOpenMember,
}: LivePanelProps) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"chat" | "history">("chat");
  const [text, setText] = useState("");
  const [superMode, setSuperMode] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [acIndex, setAcIndex] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [messages.length, tab]);

  const notice = [...messages].reverse().find((m) => m.kind === "announce");

  // Interleave the live vote / decision cards into the chat stream by their start
  // time, so they read like a posted message and scroll with the conversation.
  type FeedItem =
    | { kind: "msg"; ts: number; m: ChatMessage }
    | { kind: "vote"; ts: number }
    | { kind: "decision"; ts: number };
  const feedItems: FeedItem[] = messages.map((m) => ({ kind: "msg" as const, ts: m.ts, m }));
  if (activeVote) feedItems.push({ kind: "vote", ts: activeVote.endsAt - activeVote.durationMs });
  if (activeDecision)
    feedItems.push({ kind: "decision", ts: activeDecision.endsAt - activeDecision.durationMs });
  feedItems.sort((a, b) => a.ts - b.ts);

  // Command helpers: autocomplete while typing "/pl", usage hint after "/place ".
  const token = text.toLowerCase();
  const typingCommand = /^\/\S*$/.test(text);
  const acMatches = typingCommand
    ? COMMANDS.filter(
        (c) => c.name.startsWith(token) || c.aliases?.some((a) => a.toLowerCase().startsWith(token)),
      )
    : [];
  const activeCmd =
    text.startsWith("/") && text.includes(" ") ? findCommand(text.slice(0, text.indexOf(" "))) : undefined;

  function fillCommand(c: CommandSpec) {
    setText(c.args ? `${c.name} ` : c.name);
    setCmdOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    onSend(superMode && canSuper ? `/super ${t}` : t);
    setText("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-[42px] shrink-0 flex-col items-center gap-2 border-l border-[#20252F] bg-[#0D1015] pt-3.5 text-[13px] text-[#8A8F9C]"
      >
        ⟨
        <span className="text-[11px] font-bold tracking-[1px]" style={{ writingMode: "vertical-rl" }}>
          라이브
        </span>
      </button>
    );
  }

  return (
    <aside className="flex w-[330px] shrink-0 flex-col border-l border-[#20252F] bg-[#0D1015]">
      <div className="flex items-center gap-2 border-b border-[#1B1F27] px-3.5 py-3">
        <span className="text-[13px] font-extrabold text-[#EDEAE2]">라이브</span>
        <span className="size-1.5 rounded-full bg-[#5BD3A0]" />
        <span className="text-[11px] font-semibold text-[#6A707E]">{members.length}명</span>
        <div className="flex-1" />
        {canModerate && (
          <button
            type="button"
            onClick={() => window.confirm("채팅을 모두 초기화할까요?") && onClearChat()}
            aria-label="채팅 초기화"
            title="채팅 초기화 (방장·관리자)"
            className="grid size-6 place-items-center rounded-[5px] border border-[#2A303C] bg-[#171B22] text-[#8A8F9C] hover:text-[#F87171]"
          >
            <Eraser className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="패널 접기"
          className="grid size-6 place-items-center rounded-[5px] border border-[#2A303C] bg-[#171B22] text-[#8A8F9C]"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b border-[#1B1F27] px-2 py-1.5">
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")} icon={<MessagesSquare className="size-3.5" />}>
          채팅
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")} icon={<History className="size-3.5" />}>
          이력
        </TabButton>
      </div>

      {tab === "history" ? (
        <div className="flex flex-1 flex-col overflow-y-auto px-3 py-2">
          {history.length === 0 ? (
            <div className="grid flex-1 place-items-center text-[12px] text-[#4A4F5B]">아직 변경 이력이 없습니다.</div>
          ) : (
            history.map((h) => {
              const actor = (h.actorId && members.find((m) => m.userId === h.actorId)?.name) || h.actor;
              return (
              <div key={h.id} className="flex items-center gap-2 border-b border-[#1B1F27] py-[7px] last:border-0">
                <span
                  className="grid size-[22px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold text-white"
                  style={{ background: swatch(actor) }}
                >
                  {actor.slice(0, 1)}
                </span>
                <div className="flex-1 text-[12px] text-[#C4C8D2]">
                  <b className="text-[#A4AAB6]">{actor}</b> {h.itemName}{" "}
                  {h.fromLabel && <span className="text-[#6A707E]">{h.fromLabel} </span>}→{" "}
                  <span className="font-bold" style={{ color: h.toColor }}>
                    {h.toLabel}
                  </span>
                </div>
                <span className="text-[10px] text-[#5A6070]">{relTime(h.ts)}</span>
              </div>
              );
            })
          )}
        </div>
      ) : (
        <>
          {notice && (
            <div className="mx-3 mt-3 flex gap-2.5 rounded-[6px] border border-[rgba(99,102,241,.3)] bg-[rgba(99,102,241,.08)] px-2.5 py-2.5">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#A5B4FC]" />
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="rounded-[3px] bg-[#6366F1] px-1.5 py-px text-[9px] font-extrabold tracking-[.5px] text-white">공지</span>
                  <span className="text-[11px] font-bold text-[#A4AAB6]">{notice.author}</span>
                </div>
                <div className="text-[12.5px] leading-[1.5] text-[#D6DAE2]">{notice.text}</div>
              </div>
            </div>
          )}

          <div ref={feedRef} className="flex flex-1 flex-col gap-[9px] overflow-y-auto px-3 pt-3 pb-1">
            {feedItems.length === 0 && (
              <div className="grid flex-1 place-items-center text-[12px] text-[#4A4F5B]">아직 메시지가 없습니다.</div>
            )}
            {feedItems.map((it) => {
              if (it.kind === "vote")
                return <PanelVoteCard key="vote" vote={activeVote!} onCast={onCast} canVote={!voteOptOut} />;
              if (it.kind === "decision")
                return (
                  <DecisionCard
                    key="decision"
                    decision={activeDecision!}
                    myUserId={myUserId}
                    onJoin={onDecisionJoin}
                    onLeave={onDecisionLeave}
                  />
                );
              const m = it.m;
              if (m.rally) {
                const r = m.rally;
                // aLevel/bLevel = difficulty each side has *taken*; the pressure a
                // side *dealt* is the opponent's level. Show pressure dealt (higher
                // = winning) and split the bar proportionally to it.
                const aDealt = r.bLevel;
                const bDealt = r.aLevel;
                const totalDealt = aDealt + bDealt;
                const gap = Math.abs(aDealt - bDealt);
                const tie = !r.ended && gap === 0;
                const aWin = r.ended ? r.winner === r.a : aDealt > bDealt;
                const bWin = r.ended ? r.winner === r.b : bDealt > aDealt;
                const aShare = totalDealt > 0 ? aDealt / totalDealt : 0.5;
                const col = (win: boolean) => (tie ? "#7480A0" : win ? "#5BD3A0" : "#FF4C3A");
                const lead = aWin ? r.a : r.b;
                const strength = gap >= 4 ? "압도" : gap >= 2 ? "우세" : "근소 우세";
                return (
                  <div
                    key={m.id}
                    className="shrink-0 rounded-[2px] border-2 border-[#2A3142] bg-[#0E1117] px-2.5 py-2 transition-opacity"
                    style={{ boxShadow: "2px 2px 0 rgba(0,0,0,.5)", opacity: r.ended ? 0.7 : 1 }}
                  >
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <Swords
                        className="size-3.5 shrink-0 text-[#FF4C3A]"
                        style={{ animation: r.ended ? undefined : "blink 1s steps(1) infinite" }}
                      />
                      <span className="font-pixel text-[11px] font-bold text-[#EDEAE2]">난투</span>
                      {r.ended ? (
                        <span className="font-arcade rounded-[2px] bg-[#3A2226] px-1.5 py-px text-[9px] text-[#9A6B70]">종료</span>
                      ) : (
                        <span className="font-arcade rounded-[2px] bg-[#FF4C3A] px-1.5 py-px text-[9px] text-white">LIVE</span>
                      )}
                      <div className="flex-1" />
                      <span className="font-arcade text-[11px] text-[#A5B4FC]">{r.count}합</span>
                    </div>
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-bold">
                      <span className="min-w-0 truncate" style={{ color: col(aWin) }}>
                        {r.a} <span className="font-arcade text-[9px]">{aDealt}타</span>
                      </span>
                      <span className="min-w-0 truncate text-right" style={{ color: col(bWin) }}>
                        <span className="font-arcade text-[9px]">{bDealt}타</span> {r.b}
                      </span>
                    </div>
                    <div className="relative flex h-3 overflow-hidden rounded-[2px] border-2 border-black">
                      <div style={{ width: `${aShare * 100}%`, background: col(aWin), transition: "width .3s" }} />
                      <div className="flex-1" style={{ background: col(bWin) }} />
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-white"
                        style={{ left: `${aShare * 100}%`, boxShadow: "0 0 4px #fff", transition: "left .3s" }}
                      />
                    </div>
                    <div
                      className="font-pixel mt-1 flex items-center justify-center gap-1 text-center text-[9px] font-bold"
                      style={{ color: r.ended ? "#FDE047" : tie ? "#9AD8E8" : "#fff" }}
                    >
                      {r.ended ? (
                        <>
                          <Trophy className="size-3" /> {r.winner} 승리!
                        </>
                      ) : tie ? (
                        "접전!"
                      ) : (
                        `${lead} ${strength}`
                      )}
                    </div>
                  </div>
                );
              }
              if (m.kind !== "user" && m.kind !== "super") {
                return (
                  <div key={m.id} className="flex shrink-0 items-center gap-1.5 text-[11px] text-[#7A808E]">
                    <span className="text-[#6366F1]">◆</span>
                    <span>
                      <span className="font-bold text-[#A4AAB6]">{m.author}</span> {m.text}
                    </span>
                  </div>
                );
              }
              // Resolve the sender by stable id so renames show the *current*
              // nickname/avatar/frame across all of their messages.
              const mem = members.find((x) =>
                m.authorId ? x.userId === m.authorId : x.name === m.author,
              );
              const displayName = mem?.name ?? m.author;
              const badge = roleBadge(mem?.role);
              const sc = m.kind === "super" && m.style ? SC_STYLES[m.style] : undefined;
              const textCls = sc ? (sc.text ?? "text-white") : "text-[#D6DAE2]";
              const av = (
                <Avatar
                  name={displayName}
                  src={m.avatar ?? mem?.avatar}
                  frame={m.frame ?? mem?.frame}
                  size={40}
                  className="shrink-0"
                />
              );
              return (
                <div
                  key={m.id}
                  className={sc ? `relative shrink-0 overflow-hidden rounded-[8px] px-2.5 py-2.5 ${sc.gradient} ${sc.effect ?? ""}` : "shrink-0"}
                >
                  {sc && (
                    <>
                      <div
                        className="pointer-events-none absolute inset-y-0 w-1/3"
                        style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent)", animation: "shine 2.6s ease-in-out infinite" }}
                      />
                      <span
                        className="pointer-events-none absolute top-1.5 right-3 size-1 rounded-[1px] bg-white"
                        style={{ boxShadow: "0 0 5px #fff", animation: "twinkle .9s steps(2) infinite" }}
                      />
                      <span
                        className="pointer-events-none absolute right-7 bottom-2 size-[3px] rounded-[1px] bg-[#FDE047]"
                        style={{ boxShadow: "0 0 5px #FDE047", animation: "twinkle 1.1s steps(2) infinite .25s" }}
                      />
                    </>
                  )}
                  <div className={`flex gap-2 ${sc ? "relative" : ""}`}>
                    {mem ? (
                      <button type="button" onClick={() => onOpenMember(mem)} className="shrink-0" title={`${displayName} 프로필`}>
                        {av}
                      </button>
                    ) : (
                      av
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className={`text-[12px] font-bold ${sc ? textCls : "text-[#EDEAE2]"}`}>{displayName}</span>
                        {badge && (
                          <span className="rounded-[3px] px-1.5 py-px text-[9px] font-bold" style={{ background: badge.bg, color: badge.fg }}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <div className={`text-[13px] leading-[1.45] break-words ${textCls}`}>{m.text}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative border-t border-[#1B1F27] px-3 py-2.5">
            {/* command list / autocomplete (above input) */}
            {(cmdOpen || acMatches.length > 0) && (
              <>
                {cmdOpen && <div className="fixed inset-0 z-[1]" onClick={() => setCmdOpen(false)} />}
                <div className="absolute right-3 bottom-full left-3 z-[2] mb-1 max-h-[240px] overflow-y-auto rounded-[8px] border border-[#2A3142] bg-[#13161D] p-1.5 shadow-[0_-8px_30px_rgba(0,0,0,.55)]">
                  {!cmdOpen && (
                    <div className="px-2 pt-0.5 pb-1 text-[10px] text-[#5A6070]">Tab 으로 자동완성 · ↑↓ 이동</div>
                  )}
                  {(cmdOpen ? COMMANDS : acMatches).map((c, i) => (
                    <CommandRow
                      key={c.name}
                      cmd={c}
                      active={!cmdOpen && i === Math.min(acIndex, acMatches.length - 1)}
                      onPick={() => fillCommand(c)}
                    />
                  ))}
                </div>
              </>
            )}
            {/* usage hint for an in-progress command */}
            {activeCmd && !cmdOpen && acMatches.length === 0 && (
              <div className="absolute right-3 bottom-full left-3 mb-1 rounded-[6px] border border-[#2A3142] bg-[#13161D] px-2.5 py-1.5 text-[11px]">
                <span className="font-mono font-bold text-[#A5B4FC]">{activeCmd.name}</span>
                {activeCmd.args && <span className="font-mono text-[#8A8F9C]"> {activeCmd.args}</span>}
                <span className="text-[#8A8F9C]"> — {activeCmd.desc}</span>
              </div>
            )}

            <div className="flex items-center gap-[7px]">
              <button
                type="button"
                onClick={() => setCmdOpen((v) => !v)}
                title="명령어"
                aria-label="명령어"
                className="grid size-[34px] shrink-0 place-items-center rounded-[6px] border"
                style={
                  cmdOpen
                    ? { borderColor: "#6366F1", background: "rgba(99,102,241,.15)", color: "#A5B4FC" }
                    : { borderColor: "#232934", background: "#13161D", color: "#8A8F9C" }
                }
              >
                <SlashSquare className="size-[15px]" />
              </button>
              {canSuper && (
                <button
                  type="button"
                  onClick={() => setSuperMode((v) => !v)}
                  title="슈퍼챗으로 전송"
                  className="grid size-[34px] shrink-0 place-items-center rounded-[6px] border"
                  style={
                    superMode
                      ? { borderColor: "#F5B942", background: "rgba(245,182,66,.15)", color: "#F5B942" }
                      : { borderColor: "#232934", background: "#13161D", color: "#8A8F9C" }
                  }
                >
                  <Sparkles className="size-[15px]" />
                </button>
              )}
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setCmdOpen(false);
                  setAcIndex(0);
                }}
                onKeyDown={(e) => {
                  if (acMatches.length > 0 && !e.nativeEvent.isComposing) {
                    const n = acMatches.length;
                    const cur = Math.min(acIndex, n - 1);
                    if (e.key === "Tab") {
                      e.preventDefault();
                      fillCommand(acMatches[cur]);
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setAcIndex((cur + 1) % n);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setAcIndex((cur - 1 + n) % n);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
                }}
                placeholder={superMode ? "슈퍼챗 메시지…" : "메시지 또는 /명령어…"}
                className="h-[34px] flex-1 rounded-[6px] border bg-[#13161D] px-[11px] text-[13px] text-[#EDEAE2] outline-none"
                style={{ borderColor: superMode ? "#F5B942" : "#232934" }}
              />
              <button
                type="button"
                onClick={send}
                aria-label="전송"
                className="grid size-[34px] shrink-0 place-items-center rounded-[6px] text-white"
                style={{ background: superMode ? "#F5B942" : "#6366F1" }}
              >
                <Send className="size-[15px]" />
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function CommandRow({ cmd, active, onPick }: { cmd: CommandSpec; active?: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      // mousedown so the input doesn't blur before we fill it
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      className={`flex w-full items-baseline gap-2 rounded-[5px] px-2 py-1.5 text-left ${active ? "bg-[#1B2029]" : "hover:bg-[#1B2029]"}`}
    >
      <span className="font-mono text-[12px] font-bold text-[#D5D8E2]">{cmd.name}</span>
      {cmd.args && <span className="font-mono text-[10px] text-[#6A707E]">{cmd.args}</span>}
      <span className="ml-auto pl-2 text-[10px] text-[#8A8F9C]">{cmd.desc}</span>
    </button>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[5px] text-[12px] font-bold"
      style={active ? { background: "#171B22", color: "#EDEAE2" } : { color: "#6A707E" }}
    >
      {icon}
      {children}
    </button>
  );
}
