import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Item } from "@tier-list/shared";

const PRESETS = [10, 20, 30, 60];
const DEFAULT_SECONDS = 10;

function hueColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${((hash % 360) + 360) % 360},42%,46%)`;
}

type StartVoteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Item | null;
  currentTier: { label: string; color: string } | null;
  onStart: (reason: string, seconds: number) => void;
};

/** Collects an (optional) reason + duration before opening a tier vote. */
export function StartVoteDialog({
  open,
  onOpenChange,
  item,
  currentTier,
  onStart,
}: StartVoteDialogProps) {
  const [reason, setReason] = useState("");
  const [seconds, setSeconds] = useState(DEFAULT_SECONDS);

  useEffect(() => {
    if (open) {
      setReason("");
      setSeconds(DEFAULT_SECONDS);
    }
  }, [open]);

  function submit() {
    if (!item) return;
    onStart(reason.trim(), seconds);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-visible border-0 bg-transparent p-0 shadow-none sm:max-w-[340px] [&>button]:hidden">
        <DialogTitle className="sr-only">티어 배치 투표 개최</DialogTitle>
        <div
          className="overflow-hidden rounded-[3px] border-2 border-black"
          style={{
            background: "#11141B",
            boxShadow: "0 0 0 1px #2A3142, 6px 6px 0 rgba(0,0,0,.5)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 border-b-2 px-[15px] py-[11px]"
            style={{ borderColor: "#1B1F27", background: "#0F1218" }}
          >
            <span
              className="font-arcade text-[10px]"
              style={{ color: "#FF6B5A" }}
            >
              VOTE
            </span>
            <span className="font-pixel text-[13px] text-[#EDEAE2]">
              티어 배치 투표 개최
            </span>
          </div>

          <div className="p-[18px]">
            {/* Item + current tier */}
            {item && (
              <div className="mb-4 flex items-center gap-2.5">
                <span className="grid size-[46px] shrink-0 place-items-center overflow-hidden rounded-[2px] border-2 border-black">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
                  ) : (
                    <span
                      className="grid size-full place-items-center text-[15px] font-extrabold text-white"
                      style={{ background: hueColor(item.name) }}
                    >
                      {item.name.slice(0, 2)}
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  <div className="font-pixel truncate text-[15px] font-bold text-[#EDEAE2]">
                    {item.name}
                  </div>
                  <div className="text-[11px] text-[#8A8F9C]">
                    현재{" "}
                    {currentTier ? (
                      <b style={{ color: currentTier.color }}>{currentTier.label} 티어</b>
                    ) : (
                      <b className="text-[#8A8F9C]">미배치</b>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Reason (optional) */}
            <div className="mb-1.5 text-[11px] font-semibold text-[#8A8F9C]">사유 (선택)</div>
            <input
              value={reason}
              autoFocus
              maxLength={200}
              placeholder="예: S 가야 합니다, 인정 좀"
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
              }}
              className="mb-4 h-[38px] w-full rounded-[2px] border-2 px-3 text-[13px] text-[#EDEAE2] outline-none"
              style={{ background: "#0E1117", borderColor: "#2A3142" }}
            />

            {/* Duration */}
            <div className="mb-1.5 text-[11px] font-semibold text-[#8A8F9C]">제한 시간</div>
            <div className="mb-[18px] grid grid-cols-4 gap-1.5">
              {PRESETS.map((p) => {
                const sel = seconds === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSeconds(p)}
                    className="h-8 rounded-[2px] border-2 text-[12px] font-semibold"
                    style={{
                      background: "#0E1117",
                      borderColor: sel ? "#6366F1" : "#000",
                      color: sel ? "#A5B4FC" : "#C4C8D2",
                      fontWeight: sel ? 700 : 600,
                      boxShadow: sel ? "2px 2px 0 #1D2348" : "2px 2px 0 #000",
                    }}
                  >
                    {p}초
                  </button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="font-pixel h-10 flex-1 rounded-[2px] border-2 border-black font-bold text-[#C4C8D2]"
                style={{ background: "#171B22", boxShadow: "2px 2px 0 #000" }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={submit}
                className="font-pixel h-10 flex-[2] rounded-[2px] border-2 border-black font-bold text-white"
                style={{ background: "#6366F1", boxShadow: "2px 2px 0 #000" }}
              >
                투표 개최
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
