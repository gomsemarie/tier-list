import { useState } from "react";

import type { Item } from "@tier-list/shared";

const TIMES = [
  { s: 5, label: "5초" },
  { s: 10, label: "10초" },
  { s: 30, label: "30초" },
  { s: 60, label: "1분" },
  { s: 180, label: "3분" },
  { s: 300, label: "5분" },
];

function swatch(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360},40%,46%)`;
}

type StartVoteDialogProps = {
  item: Item;
  currentTier: { label: string; color: string } | null;
  onConfirm: (reason: string, seconds: number) => void;
  onCancel: () => void;
};

/** Retro "open a tier vote" dialog (popover '투표 시작' → here). */
export function StartVoteDialog({ item, currentTier, onConfirm, onCancel }: StartVoteDialogProps) {
  const [reason, setReason] = useState("");
  const [seconds, setSeconds] = useState(60);

  return (
    <>
      <div onClick={onCancel} className="fixed inset-0 z-[62]" style={{ background: "rgba(6,7,11,.8)" }} />
      <div
        className="fixed top-1/2 left-1/2 z-[63] w-[360px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[3px] bg-[#11141B]"
        style={{ border: "2px solid #000", boxShadow: "0 0 0 1px #2A3142, 6px 6px 0 rgba(0,0,0,.5)", animation: "popIn .2s both" }}
      >
        <div className="flex items-center gap-2 border-b-2 border-[#1B1F27] bg-[#0F1218] px-[15px] py-[11px]">
          <span className="font-arcade text-[10px] text-[#FF6B5A]">VOTE</span>
          <span className="font-pixel text-[13px] text-[#EDEAE2]">티어 배치 투표 개최</span>
        </div>

        <div className="p-[18px]">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="relative size-[46px] shrink-0 overflow-hidden rounded-[2px] border-2 border-black">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div
                  className="absolute inset-0 grid place-items-center text-[15px] font-extrabold text-white"
                  style={{ background: swatch(item.name) }}
                >
                  {item.name.slice(0, 2)}
                </div>
              )}
            </div>
            <div>
              <div className="font-pixel text-[15px] font-bold text-[#EDEAE2]">{item.name}</div>
              <div className="text-[11px] text-[#8A8F9C]">
                현재 <b style={{ color: currentTier?.color ?? "#8A8F9C" }}>{currentTier?.label ?? "미배치"}</b>
              </div>
            </div>
          </div>

          <div className="mb-1.5 text-[11px] font-semibold text-[#8A8F9C]">사유 (선택)</div>
          <input
            value={reason}
            autoFocus
            placeholder="예: S 가야 합니다, 인정 좀"
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && onConfirm(reason.trim(), seconds)}
            className="mb-4 h-[38px] w-full rounded-[2px] border-2 border-[#2A3142] bg-[#0E1117] px-3 text-[13px] text-[#EDEAE2] outline-none focus:border-[#6366F1]"
          />

          <div className="mb-1.5 text-[11px] font-semibold text-[#8A8F9C]">제한 시간</div>
          <div className="mb-[18px] grid grid-cols-3 gap-1.5">
            {TIMES.map((t) => (
              <button
                key={t.s}
                type="button"
                onClick={() => setSeconds(t.s)}
                className="font-pixel h-9 rounded-[2px] border-2 text-[12px] font-bold"
                style={
                  seconds === t.s
                    ? { borderColor: "#6366F1", background: "rgba(99,102,241,.16)", color: "#A5B4FC" }
                    : { borderColor: "#2A3142", background: "#0E1117", color: "#8A8F9C" }
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="font-pixel h-10 flex-1 rounded-[2px] text-[13px] font-bold text-[#C4C8D2]"
              style={{ border: "2px solid #000", boxShadow: "2px 2px 0 #000", background: "#171B22" }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => onConfirm(reason.trim(), seconds)}
              className="font-pixel h-10 flex-[2] rounded-[2px] text-[13px] font-bold text-white"
              style={{ border: "2px solid #000", boxShadow: "2px 2px 0 #000", background: "#6366F1" }}
            >
              투표 개최
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
