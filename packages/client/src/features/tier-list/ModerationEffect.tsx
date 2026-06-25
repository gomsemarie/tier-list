import { useEffect, useState } from "react";
import { Ban, Gavel, MessageSquareOff } from "lucide-react";

import type { ModerationEffect as ModerationEvent } from "@tier-list/shared";

type ModerationEffectProps = ModerationEvent & {
  /** Remount per event so the slam + sound replay. */
  effectKey: number;
  onDone: () => void;
};

const META = {
  mute: {
    icon: MessageSquareOff,
    label: "채팅 금지",
    grad: "from-rose-500 to-red-600",
    ring: "rgba(244,63,94,0.6)",
  },
  banPlace: {
    icon: Ban,
    label: "배치 금지",
    grad: "from-orange-500 to-amber-600",
    ring: "rgba(249,115,22,0.6)",
  },
  banVote: {
    icon: Gavel,
    label: "투표 금지",
    grad: "from-violet-500 to-purple-600",
    ring: "rgba(139,92,246,0.6)",
  },
} as const;

/** Short descending buzz — a "penalty" cue, synthesized (no asset files). */
function playBanSound() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.32);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {
    /* audio unavailable — visual still plays */
  }
}

/** Center-top game-style banner shown to everyone when a timed ban is applied. */
export function ModerationEffect({
  effectKey,
  action,
  targetName,
  by,
  durationLabel,
  onDone,
}: ModerationEffectProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    playBanSound();
    const outAt = setTimeout(() => setLeaving(true), 3000);
    const doneAt = setTimeout(onDone, 3400);
    return () => {
      clearTimeout(outAt);
      clearTimeout(doneAt);
    };
  }, [effectKey, onDone]);

  const m = META[action];
  const Icon = m.icon;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[65] flex justify-center px-4">
      <div
        className={`${leaving ? "mod-out" : "mod-slam"} relative flex items-center gap-3 overflow-visible rounded-2xl bg-gradient-to-r ${m.grad} px-5 py-3 text-white shadow-2xl`}
      >
        {/* expanding shockwave behind the icon */}
        <span
          className="mod-ring absolute top-1/2 left-7 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ boxShadow: `0 0 0 3px ${m.ring}` }}
        />
        <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-white/40">
          <Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wider uppercase opacity-90">
            🛡️ {by} 님의 제재
          </p>
          <p className="text-lg leading-tight font-black">
            {targetName} · {m.label}{" "}
            <span className="tabular-nums">{durationLabel}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
