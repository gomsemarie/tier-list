import { useEffect } from "react";

import { playRankSound } from "@/lib/sound";

type MiniResultProps = {
  itemName: string;
  tier: { label: string; color: string };
  kind: "up" | "down" | "keep";
  onDone: () => void;
};

const META = {
  up: { arrow: "▲", suffix: "승급!", color: "#FDE047" },
  down: { arrow: "▼", suffix: "강등", color: "#FB7185" },
  keep: { arrow: "·", suffix: "유지", color: "#A5B4FC" },
} as const;

/** Compact top-center result for opt-out ("미참여") members. Auto-dismisses. */
export function MiniResult({ itemName, tier, kind, onDone }: MiniResultProps) {
  const m = META[kind];
  const n = [...tier.label].length;
  const boxFont = n <= 1 ? 15 : n === 2 ? 12 : n === 3 ? 9 : 8;

  useEffect(() => {
    playRankSound(kind);
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [kind, onDone]);

  return (
    <div
      className="fixed top-4 left-1/2 z-[58] flex -translate-x-1/2 items-center gap-2.5 rounded-[2px] bg-[#11141B] py-2 pr-3.5 pl-2"
      style={{ border: "2px solid #000", boxShadow: "4px 4px 0 rgba(0,0,0,.6)", animation: "slam .45s steps(4) both" }}
    >
      <span
        className="font-arcade grid size-9 place-items-center overflow-hidden border-2 border-black px-px leading-none whitespace-nowrap text-white"
        style={{ background: tier.color, fontSize: boxFont, textShadow: "2px 2px 0 #000" }}
      >
        {tier.label}
      </span>
      <div>
        <div className="font-pixel text-[13px] font-bold text-white">
          {itemName} <span style={{ color: m.color }}>{m.arrow} {tier.label} {m.suffix}</span>
        </div>
        <div className="font-pixel text-[10px] text-[#8A8F9C]">미참여 중 · 결과만 표시</div>
      </div>
      <span
        className="ml-1 size-1 rounded-[1px] bg-[#FDE047]"
        style={{ boxShadow: "0 0 6px #FDE047", animation: "twinkle .9s steps(2) infinite" }}
      />
    </div>
  );
}
