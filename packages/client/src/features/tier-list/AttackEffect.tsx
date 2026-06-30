/* Phaser's lazy-loaded plain-object scene is untyped here — `this` is the live
   Scene and the API surface is `any`. Scoped to this file only. */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias */
import { DuelGameShell, DUEL_VW, type DuelGameProps, type DuelResult } from "./DuelGameShell";

export type { AttackItem } from "./duelChrome";

/**
 * Phaser scene: a marker ping-pongs across a bar; hit the inner zone to reflect
 * harder (escalate), the outer zone to reflect at the same level, miss/timeout
 * to get hit. Same math as the old DOM version, now rendered in Phaser.
 */
function timingScene(ss: number, p: { level: number; perStack: number; onResult: DuelResult }) {
  const lv = Math.max(0, Math.floor(p.level));
  const shrink = Math.pow(1 - p.perStack, lv);
  const reflectHalf = Math.max(0.6, 14 * shrink); // inner zone, % each side of center
  const blockHalf = Math.max(reflectHalf + 1, 28 * shrink); // outer zone
  const duration = Math.max(200, 1500 / Math.pow(1 + p.perStack, lv)); // one traverse
  const TOTAL = 3000; // overall window before an automatic miss
  const W = DUEL_VW * ss;
  const u = (n: number) => n * ss;
  const font = (n: number) => `${n * ss}px`;

  const barW = W - u(80);
  const barX = W / 2;
  const barLeft = barX - barW / 2;
  const barY = u(104);
  const barH = u(30);

  return {
    key: "timing",
    create: function (this: any) {
      const s = this;
      s.done = false;
      s.elapsed = 0;

      const outerW = ((2 * blockHalf) / 100) * barW;
      const innerW = ((2 * reflectHalf) / 100) * barW;
      s.add.rectangle(barX, barY, barW, barH, 0x11141b).setStrokeStyle(u(3), 0x000000);
      s.add.rectangle(barX, barY, outerW, barH - u(6), 0x22d3ee, 0.34).setStrokeStyle(u(2), 0x22d3ee, 0.85);
      s.add.rectangle(barX, barY, innerW, barH - u(6), 0xfde047, 0.6).setStrokeStyle(u(2), 0xfde047, 1);
      s.marker = s.add.rectangle(barLeft, barY, u(5), barH + u(8), 0xffffff);

      // 패링! button (visual + cursor); the actual press is caught scene-wide.
      const btn = s.add.rectangle(W / 2, u(176), u(150), u(48), 0x22d3ee).setStrokeStyle(u(3), 0x000000).setInteractive({ useHandCursor: true });
      s.add.text(W / 2, u(176), "패링!", { fontFamily: "'Press Start 2P',monospace", fontSize: font(15), color: "#06121A", fontStyle: "bold" }).setOrigin(0.5);
      void btn;

      const attempt = () => {
        if (s.done) return;
        const pct = ((s.marker.x - barLeft) / barW) * 100;
        const dd = Math.abs(pct - 50);
        if (dd <= reflectHalf) {
          s.done = true;
          p.onResult("win", true); // inner → reflect harder
        } else if (dd <= blockHalf) {
          s.done = true;
          p.onResult("win", false); // outer → reflect same level
        } else {
          s.done = true;
          s.cameras.main.shake(140, 0.02);
          p.onResult("lose");
        }
      };

      s.input.on("pointerdown", attempt); // tap anywhere on the canvas
      s.input.keyboard.addCapture("SPACE");
      s.input.keyboard.on("keydown-SPACE", attempt);
    },
    update: function (this: any, _t: number, delta: number) {
      const s = this;
      if (s.done) return;
      s.elapsed += delta;
      if (s.elapsed >= TOTAL) {
        s.done = true;
        s.cameras.main.shake(140, 0.02);
        p.onResult("lose");
        return;
      }
      const tri = (s.elapsed / duration) % 2; // 0..2 triangle
      const pp = tri <= 1 ? tri : 2 - tri; // 0..1
      s.marker.x = barLeft + pp * barW;
    },
  };
}

/** 타이밍 결투 — marker-into-zone parry game (shared retro chrome via DuelGameShell). */
export function AttackEffect(props: DuelGameProps) {
  return (
    <DuelGameShell
      {...props}
      title="PARRY!"
      titleColor="#22D3EE"
      instruction={
        <>
          <span style={{ color: "#67E8F9" }}>바깥 = 반사(유지)</span> · <span style={{ color: "#FDE047" }}>안쪽 = 반사(난이도↑)</span>
        </>
      }
      hint="SPACE 또는 탭"
      winSub="받아쳤습니다 — 상대 차례!"
      scene={timingScene}
    />
  );
}
