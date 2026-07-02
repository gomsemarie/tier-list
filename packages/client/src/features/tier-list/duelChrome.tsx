import { useMemo, type CSSProperties } from "react";

/** One item to scatter as retro shrapnel: name (+ image optional) + 0–1 weight. */
export type AttackItem = { src: string | null; name: string; weight: number };

export const ARCADE = "'Press Start 2P','Galmuri11',monospace";
export const PIXEL = "'Galmuri11','Noto Sans KR',sans-serif";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return ((h % 360) + 360) % 360;
}

/** Glitchy arcade "DUEL!!" title — shared by both duel mini-games. */
export function DuelTitle() {
  return (
    <div className="relative text-center" style={{ animation: "glitch .14s steps(2) infinite" }}>
      <div className="relative inline-block">
        <div className="absolute inset-x-0 top-0" style={{ fontFamily: ARCADE, fontSize: 44, color: "#FF2D6A", transform: "translate(-4px,0)" }}>
          DUEL!!
        </div>
        <div className="absolute inset-x-0 top-0" style={{ fontFamily: ARCADE, fontSize: 44, color: "#22D3EE", transform: "translate(4px,0)" }}>
          DUEL!!
        </div>
        <div className="relative" style={{ fontFamily: ARCADE, fontSize: 44, color: "#fff", textShadow: "5px 5px 0 #000" }}>
          DUEL!!
        </div>
      </div>
    </div>
  );
}

/**
 * Full-screen retro backdrop shared by both duel games: tense red flash + shake
 * with item shrapnel while playing/losing, calm cyan glow on a win, star burst
 * once resolved. `phase` drives the mood; `seed` re-randomizes the shrapnel.
 */
export function RetroBackdrop({ phase, items = [], seed = 0, calm = false }: { phase: "play" | "win" | "lose"; items?: AttackItem[]; seed?: number; calm?: boolean }) {
  const success = phase === "win";
  const peaceful = calm && phase === "play"; // solo practice: not under attack → no red strobe
  const calmView = success || peaceful; // calm radial + gentle upward drift
  const resolved = phase !== "play";

  const floaters = useMemo(() => {
    const src = items.length ? items.slice(0, 120) : Array.from({ length: 16 }, (_, i) => ({ src: null, name: `${i}`, weight: Math.random() }));
    return src.map((it, i) => {
      // Ring the edges only — leave the center clear so shrapnel never covers
      // the arrows/marker. Each tile sits in the top/bottom/left/right band and
      // only drifts a little, so it stays out of the play area.
      const edge = i % 4;
      const left = edge === 2 ? rand(0.5, 11) : edge === 3 ? rand(86, 97.5) : rand(1, 95);
      const top = edge === 0 ? rand(1, 13) : edge === 1 ? rand(84, 96) : rand(2, 92);
      const sz = 34 + it.weight * 24;
      return {
        key: i,
        label: it.src ? "" : it.name.slice(0, 2), // image tiles need no initials
        style: {
          position: "absolute",
          left: `${left}%`,
          top: `${top}%`,
          width: sz,
          height: sz,
          backgroundColor: it.src ? "#0E1117" : calmView ? (peaceful ? "hsl(232,55%,62%)" : "hsl(190,70%,55%)") : `hsl(${hueOf(it.name)},42%,46%)`,
          backgroundImage: it.src ? `url("${it.src}")` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          imageRendering: "pixelated",
          border: "3px solid #000",
          display: "grid",
          placeItems: "center",
          fontFamily: PIXEL,
          fontSize: 11,
          fontWeight: 700,
          color: "#fff",
          textShadow: "1px 1px 0 #000",
          opacity: 0.9,
          "--dx": `${rand(-22, 22)}px`,
          "--dy": `${rand(-22, 22)}px`,
          "--rot": "0deg",
          animation: `floatY ${rand(0.8, 1.5)}s steps(4) ${rand(0, 0.3)}s infinite alternate`,
        } as CSSProperties,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, calmView, peaceful]);

  const boom = useMemo(() => {
    if (!resolved) return [];
    return Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * 6.283;
      const d = 90 + Math.random() * 130;
      return {
        key: i,
        style: {
          position: "absolute",
          left: "50%",
          top: "42%",
          width: 14,
          height: 14,
          background: success ? (i % 2 ? "#22D3EE" : "#fff") : i % 3 ? "#FF3B30" : "#FDE047",
          imageRendering: "pixelated",
          "--bx": `${Math.cos(a) * d}px`,
          "--by": `${Math.sin(a) * d}px`,
          animation: `starBurst 1s steps(6) ${Math.random() * 0.2}s forwards`,
        } as CSSProperties,
      };
    });
  }, [resolved, success]);

  return (
    <>
      <div className="pointer-events-none absolute -inset-12">
        {peaceful ? (
          // Playing: a calm retro-CRT screen — breathing indigo glow + scanlines.
          <>
            <div
              className="absolute inset-0"
              style={{ background: "radial-gradient(circle at 50% 45%, rgba(99,102,241,.22), rgba(8,11,20,.92) 72%)", animation: "retroBreath 4.5s ease-in-out infinite" }}
            />
            <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(150,170,255,.05) 1px, transparent 1px)", backgroundSize: "100% 3px" }} />
          </>
        ) : success ? (
          // Win: calm cyan glow.
          <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 42%, rgba(34,211,238,.30), rgba(7,14,20,.78) 70%)" }} />
        ) : (
          // Loss: a static muted vignette — never a red strobe.
          <div className="absolute inset-0" style={{ background: "rgba(9,11,18,.55)", boxShadow: "inset 0 0 220px 70px rgba(70,26,34,.7)" }} />
        )}
      </div>
      <div className="pointer-events-none absolute inset-0">
        {!success && floaters.map((f) => (
          <span key={f.key} style={f.style}>
            {f.label}
          </span>
        ))}
        {boom.map((b) => (
          <span key={`b${b.key}`} style={b.style} />
        ))}
      </div>
    </>
  );
}

/** After you parry in a real duel: a retro "waiting for the opponent" hold. */
export function WaitScreen({ by }: { by: string }) {
  return (
    <div className="text-center select-none" style={{ animation: "slam .4s steps(4) both" }}>
      <div style={{ fontFamily: ARCADE, fontSize: 40, color: "#FDE047", textShadow: "5px 5px 0 #000,0 0 20px rgba(253,224,71,.8)" }}>REFLECT!!</div>
      <div style={{ marginTop: 12, fontFamily: PIXEL, fontSize: 16, fontWeight: 700, color: "#fff", textShadow: "2px 2px 0 #000" }}>{by}에게 받아쳤습니다!</div>
      <div className="mt-4 flex items-center justify-center gap-2">
        <span style={{ fontFamily: ARCADE, fontSize: 13, color: "#67E8F9", textShadow: "2px 2px 0 #000" }}>WAITING</span>
        <span style={{ fontFamily: ARCADE, fontSize: 13, color: "#67E8F9", animation: "blink 1s steps(1) infinite" }}>...</span>
      </div>
      <div style={{ marginTop: 6, fontFamily: PIXEL, fontSize: 12, color: "#9AD8E8" }}>상대의 반사를 기다리는 중</div>
    </div>
  );
}

/** Win/lose arcade splash (shared wording). `sub` overrides the default line. */
export function RetroSplash({ phase, by, sub }: { phase: "win" | "lose"; by: string; sub?: string }) {
  if (phase === "win") {
    return (
      <div className="text-center select-none" style={{ animation: "slam .5s steps(4) both" }}>
        <div style={{ fontFamily: ARCADE, fontSize: 50, color: "#FDE047", textShadow: "5px 5px 0 #000,0 0 22px rgba(253,224,71,.85)" }}>REFLECT!!</div>
        <div style={{ marginTop: 10, fontFamily: PIXEL, fontSize: 19, fontWeight: 700, color: "#fff", textShadow: "2px 2px 0 #000" }}>{by}에게 받아쳤습니다!</div>
        {sub && <div style={{ marginTop: 4, fontFamily: PIXEL, fontSize: 13, color: "#FDE9A0" }}>{sub}</div>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <DuelTitle />
      <div style={{ fontFamily: PIXEL, fontSize: 18, fontWeight: 700, color: "#FFD0C8", textShadow: "2px 2px 0 #000" }}>{by}에게 한 방 먹었습니다!</div>
      <div style={{ fontFamily: ARCADE, fontSize: 16, color: "#FF6B5A", textShadow: "2px 2px 0 #000" }}>GUARD BREAK</div>
    </div>
  );
}
