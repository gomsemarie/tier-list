import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Crown,
  Eraser,
  Flame,
  Gem,
  Megaphone,
  MessagesSquare,
  Send,
  SlashSquare,
  Sparkles,
  Star,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  COMMANDS,
  findCommand,
  SC_STYLES,
  type ChatMessage,
  type CommandSpec,
  type Hint,
  type MemberRole,
  type RoomSnapshot,
} from "@tier-list/shared";
import { Avatar } from "./Avatar";
import { RoleBadge } from "./RoleBadge";

const SC_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  star: Star,
  zap: Zap,
  flame: Flame,
  gem: Gem,
  crown: Crown,
};

function nameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 45%, 45%)`;
}

/** Render message text with @mentions highlighted. */
function renderText(text: string, memberNames: Set<string>): ReactNode {
  const parts = text.split(/(@[^\s@]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@") && memberNames.has(part.slice(1))) {
      return (
        <span
          key={i}
          className="rounded bg-foreground/10 px-1 font-medium text-foreground"
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** A single command row (shared by the popover list and the autocomplete). */
function CommandRow({
  cmd,
  active,
  onPick,
}: {
  cmd: CommandSpec;
  active?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      // mousedown (not click) so the input doesn't blur before we act
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      className={cn(
        "flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent",
      )}
    >
      <span className="font-mono text-sm font-semibold">{cmd.name}</span>
      {cmd.args && (
        <span className="font-mono text-xs text-muted-foreground">{cmd.args}</span>
      )}
      <span className="ml-auto pl-2 text-xs text-muted-foreground">{cmd.desc}</span>
    </button>
  );
}

type Row =
  | { kind: "msg"; ts: number; id: string; data: ChatMessage }
  | { kind: "hint"; ts: number; id: string; data: Hint };

type ChatPanelProps = {
  room: RoomSnapshot;
  hints: Hint[];
  onSend: (text: string) => void;
  className?: string;
  /** Viewer can moderate (owner/admin): shows the clear-chat control. */
  canModerate?: boolean;
  onClearChat?: () => void;
  /** Epoch ms until which the viewer is chat-muted (disables input). */
  mutedUntil?: number;
};

export function ChatPanel({
  room,
  hints,
  onSend,
  className,
  canModerate,
  onClearChat,
  mutedUntil,
}: ChatPanelProps) {
  const [text, setText] = useState("");
  const [acIndex, setAcIndex] = useState(0);
  const [acDismissed, setAcDismissed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const memberNames = useMemo(
    () => new Set(room.members.map((m) => m.name)),
    [room.members],
  );
  const avatarByName = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const m of room.members) map.set(m.name, m.avatar);
    return map;
  }, [room.members]);
  const roleByName = useMemo(() => {
    const map = new Map<string, MemberRole | undefined>();
    for (const m of room.members) map.set(m.name, m.role);
    return map;
  }, [room.members]);
  const frameByName = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const m of room.members) map.set(m.name, m.frame);
    return map;
  }, [room.members]);

  // Re-render once a second while muted so the input re-enables on expiry.
  const [, setTick] = useState(0);
  const muted = mutedUntil !== undefined && mutedUntil > Date.now();
  useEffect(() => {
    if (!muted) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [muted]);
  const muteLeftMin = muted
    ? Math.ceil((mutedUntil! - Date.now()) / 60_000)
    : 0;

  const rows = useMemo<Row[]>(() => {
    const merged: Row[] = [
      ...room.messages.map((m) => ({ kind: "msg" as const, ts: m.ts, id: m.id, data: m })),
      ...hints.map((h) => ({ kind: "hint" as const, ts: h.ts, id: h.id, data: h })),
    ];
    return merged.sort((a, b) => a.ts - b.ts);
  }, [room.messages, hints]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows]);

  // Autocomplete while typing a command name ("/pl" → /place …).
  const typingCommand = /^\/\S*$/.test(text);
  const acMatches = useMemo(() => {
    if (!typingCommand || acDismissed) return [];
    const token = text.toLowerCase();
    return COMMANDS.filter(
      (c) =>
        c.name.startsWith(token) ||
        c.aliases?.some((a) => a.toLowerCase().startsWith(token)),
    );
  }, [typingCommand, acDismissed, text]);

  // Usage hint once a known command + space is typed ("/place …").
  const activeCmd =
    text.startsWith("/") && text.includes(" ")
      ? findCommand(text.slice(0, text.indexOf(" ")))
      : undefined;

  function setInput(value: string) {
    setText(value);
    setAcIndex(0);
    setAcDismissed(false);
  }

  function pickCommand(cmd: CommandSpec) {
    setText(cmd.args ? `${cmd.name} ` : cmd.name);
    setAcIndex(0);
    setCmdOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
    setAcDismissed(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (acMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAcIndex((i) => (i + 1) % acMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAcIndex((i) => (i - 1 + acMatches.length) % acMatches.length);
        return;
      }
      if ((e.key === "Tab" || e.key === "Enter") && !e.nativeEvent.isComposing) {
        e.preventDefault();
        pickCommand(acMatches[acIndex] ?? acMatches[0]);
        return;
      }
      if (e.key === "Escape") {
        setAcDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
  }

  return (
    <aside
      className={cn(
        "flex flex-col overflow-hidden bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <MessagesSquare className="size-4" /> 채팅
        </div>
        {canModerate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => {
              if (window.confirm("채팅 내용을 모두 지울까요?")) onClearChat?.();
            }}
          >
            <Eraser className="size-3.5" /> 채팅 비우기
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {rows.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            메시지를 입력하거나 <code className="rounded bg-muted px-1">/</code> 로
            명령어를 사용해 보세요.
          </p>
        )}
        {rows.map((row) => {
          if (row.kind === "hint") {
            return (
              <pre
                key={row.id}
                className="rounded-md bg-muted/60 px-2 py-1.5 text-left font-sans text-xs whitespace-pre-wrap text-muted-foreground"
              >
                {row.data.text}
                <span className="mt-1 block text-[10px] opacity-70">나만 보임</span>
              </pre>
            );
          }
          const m = row.data;
          if (m.kind === "system") {
            return (
              <p key={m.id} className="text-center text-xs text-muted-foreground">
                {m.text}
              </p>
            );
          }
          if (m.kind === "action") {
            return (
              <p key={m.id} className="text-center text-xs font-medium text-foreground/70">
                {m.text}
              </p>
            );
          }
          if (m.kind === "announce") {
            return (
              <div
                key={m.id}
                className="animate-rise flex items-start gap-2.5 rounded-lg border border-indigo/30 bg-indigo/10 px-3 py-2.5"
              >
                <Megaphone className="mt-0.5 size-4 shrink-0 text-indigo-fg" />
                <div className="min-w-0">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span className="rounded-sm bg-indigo px-1.5 py-px text-[9px] font-bold tracking-wide text-white">
                      공지
                    </span>
                    <span className="text-xs font-bold text-[#a4aab6]">{m.author}</span>
                  </div>
                  <span className="break-words text-sm font-medium text-foreground/90">
                    {m.text}
                  </span>
                </div>
              </div>
            );
          }
          if (m.kind === "super") {
            const sc = SC_STYLES[m.style ?? "base"] ?? SC_STYLES.base;
            const Icon = SC_ICONS[sc.icon] ?? Sparkles;
            const legendary = sc.rarity === "legendary";
            return (
              <div
                key={m.id}
                className={cn(
                  "super-shine animate-rise relative flex items-center gap-2.5 overflow-hidden rounded-xl px-3 shadow-pop",
                  legendary ? "py-3 ring-2 ring-white/40" : "py-2.5",
                  sc.gradient,
                  sc.effect,
                  sc.text ?? "text-white",
                )}
              >
                <Avatar
                  name={m.author}
                  src={m.avatar ?? avatarByName.get(m.author)}
                  frame={m.frame}
                  size={legendary ? 44 : 38}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-xs font-bold drop-shadow-sm">
                    <Icon className="size-3.5" /> {m.author}
                  </div>
                  <span
                    className={cn(
                      "block font-extrabold break-words drop-shadow-sm",
                      legendary ? "text-lg" : "text-base",
                    )}
                  >
                    {m.text}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex items-start gap-2.5">
              <Avatar
                name={m.author}
                src={avatarByName.get(m.author)}
                frame={frameByName.get(m.author)}
                size={40}
                className="mt-0.5"
              />
              <div className="min-w-0 text-sm leading-snug">
                <span className="inline-flex items-center gap-1 align-middle">
                  <span className="font-semibold" style={{ color: nameColor(m.author) }}>
                    {m.author}
                  </span>
                  <RoleBadge role={roleByName.get(m.author)} />
                </span>
                <span className="ml-2 break-words text-foreground">
                  {renderText(m.text, memberNames)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative border-t border-border p-3">
        {/* Autocomplete dropdown */}
        {acMatches.length > 0 && (
          <div className="absolute inset-x-3 bottom-full mb-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-pop">
            {acMatches.map((c, i) => (
              <CommandRow
                key={c.name}
                cmd={c}
                active={i === acIndex}
                onPick={() => pickCommand(c)}
              />
            ))}
          </div>
        )}
        {/* Usage hint for the active command */}
        {acMatches.length === 0 && activeCmd && (
          <div className="mb-1.5 flex items-baseline gap-2 px-1 text-xs">
            <span className="font-mono font-semibold">{activeCmd.name}</span>
            <span className="font-mono text-muted-foreground">{activeCmd.args}</span>
            <span className="ml-auto text-muted-foreground">{activeCmd.desc}</span>
          </div>
        )}

        {muted && (
          <div className="mb-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-center text-xs text-destructive">
            채팅이 금지되었습니다. (약 {muteLeftMin}분 남음)
          </div>
        )}
        <div className="flex gap-2">
          <Popover open={cmdOpen} onOpenChange={setCmdOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="명령어"
                title="명령어"
                className="shrink-0"
                disabled={muted}
              >
                <SlashSquare />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-80">
              <p className="label-caps px-2 pb-1 text-muted-foreground">명령어</p>
              <div className="grid gap-0.5">
                {COMMANDS.map((c) => (
                  <CommandRow key={c.name} cmd={c} onPick={() => pickCommand(c)} />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Input
            ref={inputRef}
            value={text}
            disabled={muted}
            placeholder={muted ? "채팅 금지 중…" : "메시지 또는 /명령어…"}
            className={cn(text.startsWith("/") && "font-mono")}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <Button size="icon" aria-label="전송" onClick={send} disabled={muted}>
            <Send />
          </Button>
        </div>
      </div>
    </aside>
  );
}
