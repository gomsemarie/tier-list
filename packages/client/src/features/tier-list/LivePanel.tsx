import { useEffect, useRef, useState } from "react";
import { ChevronRight, History, MessagesSquare, Send, Sparkles } from "lucide-react";

import { SC_STYLES } from "@tier-list/shared";
import type { ChangeEntry, ChatMessage, Member, VoteSnapshot } from "@tier-list/shared";
import { Avatar } from "./Avatar";
import { PanelVoteCard } from "./PanelVoteCard";

type LivePanelProps = {
  members: Member[];
  messages: ChatMessage[];
  history: ChangeEntry[];
  activeVote: VoteSnapshot | null;
  voteOptOut: boolean;
  canSuper: boolean;
  setVoteOptOut: (enabled: boolean) => void;
  onCast: (tierId: string) => void;
  onSend: (text: string) => void;
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
  canSuper,
  setVoteOptOut,
  onCast,
  onSend,
  onOpenMember,
}: LivePanelProps) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"chat" | "history">("chat");
  const [text, setText] = useState("");
  const [superMode, setSuperMode] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [messages.length, tab]);

  const roleOf = (name: string) => members.find((m) => m.name === name)?.role;
  const notice = [...messages].reverse().find((m) => m.kind === "announce");

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
        <button
          type="button"
          onClick={() => setVoteOptOut(!voteOptOut)}
          title="투표 참여/미참여 전환"
          className="flex h-[26px] items-center gap-1.5 rounded-[5px] border px-2 text-[11px] font-bold"
          style={
            voteOptOut
              ? { borderColor: "#2A303C", background: "#171B22", color: "#8A8F9C" }
              : { borderColor: "rgba(91,211,160,.4)", background: "rgba(91,211,160,.12)", color: "#5BD3A0" }
          }
        >
          <span className="size-[6px] rounded-full" style={{ background: voteOptOut ? "#6A707E" : "#5BD3A0" }} />
          {voteOptOut ? "미참여" : "참여"}
        </button>
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

      {activeVote && !voteOptOut && <PanelVoteCard vote={activeVote} onCast={onCast} />}

      {tab === "history" ? (
        <div className="flex flex-1 flex-col overflow-y-auto px-3 py-2">
          {history.length === 0 ? (
            <div className="grid flex-1 place-items-center text-[12px] text-[#4A4F5B]">아직 변경 이력이 없습니다.</div>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex items-center gap-2 border-b border-[#1B1F27] py-[7px] last:border-0">
                <span
                  className="grid size-[22px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold text-white"
                  style={{ background: swatch(h.actor) }}
                >
                  {h.actor.slice(0, 1)}
                </span>
                <div className="flex-1 text-[12px] text-[#C4C8D2]">
                  <b className="text-[#A4AAB6]">{h.actor}</b> {h.itemName} →{" "}
                  <span className="font-bold" style={{ color: h.toColor }}>
                    {h.toLabel}
                  </span>
                </div>
                <span className="text-[10px] text-[#5A6070]">{relTime(h.ts)}</span>
              </div>
            ))
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
            {messages.length === 0 && (
              <div className="grid flex-1 place-items-center text-[12px] text-[#4A4F5B]">아직 메시지가 없습니다.</div>
            )}
            {messages.map((m) => {
              if (m.kind !== "user" && m.kind !== "super") {
                return (
                  <div key={m.id} className="flex items-center gap-1.5 text-[11px] text-[#7A808E]">
                    <span className="text-[#6366F1]">◆</span>
                    <span>
                      <span className="font-bold text-[#A4AAB6]">{m.author}</span> {m.text}
                    </span>
                  </div>
                );
              }
              const badge = roleBadge(roleOf(m.author));
              const sc = m.kind === "super" && m.style ? SC_STYLES[m.style] : undefined;
              const textCls = sc ? (sc.text ?? "text-white") : "text-[#D6DAE2]";
              const mem = members.find((x) => x.name === m.author);
              const av = <Avatar name={m.author} src={m.avatar} frame={m.frame} size={26} className="shrink-0" />;
              return (
                <div
                  key={m.id}
                  className={sc ? `relative overflow-hidden rounded-[8px] px-2.5 py-2 ${sc.gradient} ${sc.effect ?? ""}` : undefined}
                >
                  <div className="flex gap-2">
                    {mem ? (
                      <button type="button" onClick={() => onOpenMember(mem)} className="shrink-0" title={`${m.author} 프로필`}>
                        {av}
                      </button>
                    ) : (
                      av
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className={`text-[12px] font-bold ${sc ? textCls : "text-[#EDEAE2]"}`}>{m.author}</span>
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

          <div className="flex items-center gap-[7px] border-t border-[#1B1F27] px-3 py-2.5">
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
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
              placeholder={superMode ? "슈퍼챗 메시지…" : "메시지 입력…"}
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
        </>
      )}
    </aside>
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
