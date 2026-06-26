/**
 * Tiny retro-arcade SFX, synthesized with the Web Audio API (no asset files).
 * Used for the tier-decided effect: a rising power-up arpeggio for a promotion,
 * a descending tone for a demotion, a short neutral blip when it holds.
 */
export function playRankSound(kind: "up" | "down" | "keep"): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const seq =
      kind === "up"
        ? [523, 659, 784, 1047] // C5 E5 G5 C6 — power up
        : kind === "down"
          ? [523, 440, 349] // C5 A4 F4 — power down
          : [523, 523]; // neutral blip
    const step = 0.09;
    seq.forEach((f, i) => {
      const t = ctx.currentTime + i * step;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.14, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + step);
    });
    setTimeout(() => ctx.close().catch(() => {}), (seq.length * step + 0.4) * 1000);
  } catch {
    /* audio unavailable — effect still plays silently */
  }
}
