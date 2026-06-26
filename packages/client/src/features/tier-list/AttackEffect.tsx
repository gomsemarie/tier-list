import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/** One item to scatter: image (or null → initials), and a 0–1 "lowness" weight
 *  (higher = lower/worse tier → bigger & wilder). */
export type AttackItem = { src: string | null; name: string; weight: number };

type AttackEffectProps = {
  /** Changes each time a new attack lands (restarts the effect). */
  attackKey: number;
  by: string;
  /** True for a fresh attack (can be parried); false for a reflected hit. */
  parryable?: boolean;
  /** Called once when the user successfully parries (reflects the attack). */
  onParry?: () => void;
  onDone: () => void;
  items?: AttackItem[];
};

const EMOJI = ["🍪", "🍿", "🍫", "🥨", "🍘", "🍩", "🧁", "🍬", "🍭", "🍡"];
const MAX_FLOATERS = 120; // perf guard for huge rooms
const PARRY_DURATION = 1500; // ms for the marker to cross the gauge
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${hash % 360}, 60%, 55%)`;
}

type Floater = {
  content:
    | { kind: "img"; src: string }
    | { kind: "emoji"; ch: string }
    | { kind: "init"; name: string };
  size: number;
  weight: number;
  style: CSSProperties;
};

type Phase = "pending" | "success" | "miss" | "hit";

/** Full-screen "hit" effect with a parry mini-game. A fresh (parryable) attack
 *  shows a timing gauge — SPACE/click in the zone reflects it back; otherwise a
 *  hit lands. Reflected attacks aren't parryable (just the hit). */
export function AttackEffect({
  attackKey,
  by,
  parryable = false,
  onParry,
  onDone,
  items = [],
}: AttackEffectProps) {
  const [phase, setPhase] = useState<Phase>(parryable ? "pending" : "hit");
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);
  const parriedRef = useRef(false);

  // Marker sweep while waiting for the parry input.
  useEffect(() => {
    if (phase !== "pending") return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(100, ((now - start) / PARRY_DURATION) * 100);
      posRef.current = p;
      setPos(p);
      if (p >= 100) {
        setPhase("miss"); // ran out the gauge → guard break
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  const tryParry = useCallback(() => {
    setPhase((cur) => {
      if (cur !== "pending") return cur;
      const p = posRef.current;
      const ok = p >= 36 && p <= 64; // good/perfect window
      if (ok && !parriedRef.current) {
        parriedRef.current = true;
        onParry?.();
      }
      return ok ? "success" : "miss";
    });
  }, [onParry]);

  // SPACE to parry (mirrors the on-screen button).
  useEffect(() => {
    if (phase !== "pending") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        tryParry();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, tryParry]);

  // Auto-dismiss once resolved.
  useEffect(() => {
    if (phase === "pending") return;
    const ms = phase === "success" ? 2400 : phase === "hit" ? 2600 : 1900;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  const success = phase === "success";

  const floaters = useMemo<Floater[]>(() => {
    const source: AttackItem[] = items.length
      ? items.slice(0, MAX_FLOATERS)
      : EMOJI.map((ch) => ({ src: null, name: ch, weight: Math.random() }));

    return source.map((it): Floater => {
      const w = Math.max(0, Math.min(1, it.weight)); // lowness 0..1
      const size = (40 + w * 150) * rand(0.85, 1.2); // low tier → bigger
      const reach = 28 + w * 48; // low tier → roams more
      const isEmoji = !it.src && it.name.length <= 2 && /\p{Emoji}/u.test(it.name);
      return {
        size,
        weight: w,
        content: it.src
          ? { kind: "img", src: it.src }
          : isEmoji
            ? { kind: "emoji", ch: it.name }
            : { kind: "init", name: it.name },
        style: {
          left: `${rand(-6, 94)}%`,
          top: `${rand(-6, 94)}%`,
          width: size,
          height: size,
          zIndex: Math.round(w * 10),
          "--dx": `${rand(-reach, reach)}vw`,
          "--dy": `${rand(-reach, reach)}vh`,
          "--rot": `${rand(-720, 720)}deg`,
          "--dur": `${rand(0.45, 1.3 - w * 0.35)}s`,
          "--delay": `${rand(0, 0.3)}s`,
          "--scale": `${rand(0.85, 1.25)}`,
        } as CSSProperties,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackKey]);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      {/* Tint + vignette (success = cyan, otherwise red), shaking */}
      <div className="attack-shake pointer-events-none absolute -inset-12">
        <div
          className={"attack-flash absolute inset-0 " + (success ? "bg-cyan-500" : "bg-red-600")}
        />
        <div className="attack-vignette absolute inset-0" />
      </div>

      {/* Flying items */}
      <div className="pointer-events-none absolute inset-0">
        {floaters.map((f, i) => (
          <span key={i} className="attack-floater" style={f.style}>
            {f.content.kind === "img" ? (
              <img
                src={f.content.src}
                alt=""
                draggable={false}
                className={
                  "size-full rounded-xl object-cover " +
                  (success
                    ? "ring-2 ring-cyan-300"
                    : f.weight > 0.66
                      ? "ring-4 ring-red-400"
                      : "ring-2 ring-white/70")
                }
              />
            ) : f.content.kind === "emoji" ? (
              <span className="grid size-full place-items-center" style={{ fontSize: f.size * 0.8 }}>
                {f.content.ch}
              </span>
            ) : (
              <span
                className="grid size-full place-items-center rounded-xl font-black text-white ring-2 ring-white/70"
                style={{ backgroundColor: colorFor(f.content.name), fontSize: f.size * 0.32 }}
              >
                {f.content.name.slice(0, 2)}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Center: parry gauge (pending) or result text */}
      <div className="grid h-full place-items-center">
        {phase === "pending" ? (
          <div className="w-[380px] max-w-[90vw] text-center select-none">
            <p className="font-arcade text-2xl text-cyan-300 drop-shadow-[3px_3px_0_rgba(0,0,0,0.9)]">
              PARRY!
            </p>
            <p className="font-pixel mt-1 text-sm text-white drop-shadow-[1px_1px_0_rgba(0,0,0,0.9)]">
              흰 마커가 가운데 올 때 패링!
            </p>
            {/* gauge */}
            <div className="relative mt-3 h-7 overflow-hidden border-2 border-black bg-[#11141b] shadow-[3px_3px_0_rgba(0,0,0,0.5)]">
              <div className="absolute inset-y-0 left-[36%] w-[28%] bg-cyan-400/20" />
              <div className="absolute inset-y-0 left-[44%] w-[12%] bg-cyan-400/50 shadow-[inset_0_0_0_2px_#22d3ee]" />
              <div
                className="absolute -top-0.5 -bottom-0.5 w-1.5 bg-white shadow-[0_0_8px_#fff]"
                style={{ left: `calc(${pos}% - 3px)` }}
              />
            </div>
            <button
              type="button"
              onClick={tryParry}
              className="font-arcade mt-3.5 border-2 border-black bg-cyan-400 px-7 py-2.5 text-base text-[#06121a] shadow-[3px_3px_0_#000] active:translate-x-px active:translate-y-px"
            >
              패링!
            </button>
            <p className="font-pixel mt-2 animate-pulse text-[11px] text-cyan-200">
              SPACE 또는 클릭
            </p>
          </div>
        ) : success ? (
          <div className="attack-bounce text-center select-none">
            <p className="font-arcade text-4xl text-cyan-300 drop-shadow-[4px_4px_0_rgba(0,0,0,0.9)] sm:text-5xl">
              PARRY!!
            </p>
            <p className="font-pixel mt-3 text-xl font-bold text-white drop-shadow-[2px_2px_0_rgba(0,0,0,0.9)]">
              {by} 에게 공격을 되돌렸습니다!
            </p>
          </div>
        ) : (
          <div className="attack-bounce text-center select-none">
            <p className="text-6xl font-black text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.85)] sm:text-7xl">
              💥 피격!
            </p>
            <p className="mt-2 text-xl font-extrabold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
              {by} 의 공격!
            </p>
            {phase === "miss" && (
              <p className="font-arcade mt-3 text-base text-red-400 drop-shadow-[2px_2px_0_#000]">
                GUARD BREAK
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
