import { useEffect, useRef, useState } from "react";

type BulkAddDialogProps = {
  onSubmit: (names: string[]) => void;
  onClose: () => void;
};

/** Paste many names (one per line) → add them all as unranked targets. */
export function BulkAddDialog({ onSubmit, onClose }: BulkAddDialogProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const names = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/60" />
      <div
        className="fixed top-1/2 left-1/2 z-[61] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-[#242a3a] bg-[#13161D] p-5"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,.6)", animation: "popIn .16s ease both" }}
      >
        <div className="mb-1 text-[16px] font-extrabold text-[#EDEAE2]">대상 일괄 추가</div>
        <div className="mb-3.5 text-[12px] text-[#8A8F9C]">한 줄에 하나씩 이름을 입력하세요.</div>

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"신라면\n진라면\n너구리\n짜파게티"}
          className="h-[120px] w-full resize-none rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-3 py-2.5 text-[13px] leading-[1.6] text-[#EDEAE2] outline-none focus:border-[#6366F1]"
        />

        <div className="my-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[#8A8F9C]">미리보기 {names.length}개:</span>
          {names.slice(0, 8).map((n, i) => (
            <span
              key={`${n}-${i}`}
              className="rounded-[5px] bg-[#1B1F27] px-2 py-[3px] text-[11px] font-bold text-[#C4C8D2]"
            >
              {n}
            </span>
          ))}
          {names.length > 8 && (
            <span className="text-[11px] text-[#8A8F9C]">+{names.length - 8}</span>
          )}
        </div>

        <button
          type="button"
          disabled={names.length === 0}
          onClick={() => onSubmit(names)}
          className="h-10 w-full rounded-[6px] bg-[#6366F1] text-[13px] font-bold text-white disabled:opacity-40"
        >
          {names.length}개 추가
        </button>
      </div>
    </>
  );
}
