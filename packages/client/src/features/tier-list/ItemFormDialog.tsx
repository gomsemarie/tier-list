import { useEffect, useRef, useState } from "react";
import { Search, Upload } from "lucide-react";

import type { Item } from "@tier-list/shared";
import { CropPanel } from "./CropPanel";
import { ImageSearchPanel } from "./ImageSearchPanel";

function swatch(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360},40%,46%)`;
}

type ItemFormDialogProps = {
  /** Provide to edit an existing item; omit to add a new one. */
  item?: Item;
  onSubmit: (name: string, imageUrl: string | null) => void;
  onDelete?: () => void;
  onClose: () => void;
};

/** Add / edit a target — name + image (upload or search), or initials swatch. */
export function ItemFormDialog({ item, onSubmit, onDelete, onClose }: ItemFormDialogProps) {
  const [name, setName] = useState(item?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(item?.imageUrl ?? null);
  const [searching, setSearching] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  function pickFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setCropSrc(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function submit() {
    const n = name.trim();
    if (!n) return;
    onSubmit(n, imageUrl);
  }

  const trimmed = name.trim();

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/60" />
      <div
        className="fixed top-1/2 left-1/2 z-[61] w-[430px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-[#242a3a] bg-[#13161D] p-5"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,.6)", animation: "popIn .16s ease both" }}
      >
        <div className="mb-4 text-[16px] font-extrabold text-[#EDEAE2]">{item ? "대상 수정" : "대상 추가"}</div>

        <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">이름</label>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            // Add mode + no image yet → name+Enter opens the image picker. Once an
            // image is set (or when editing), Enter saves.
            if (!item && !imageUrl && name.trim()) setSearching(true);
            else submit();
          }}
          className="mb-4 h-[38px] w-full rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-3 text-[13px] text-[#EDEAE2] outline-none focus:border-[#6366F1]"
        />

        <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">이미지</label>
        <div className="mb-3.5 flex gap-3">
          <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-[6px] border border-[#2A303C] bg-[#0E1117]">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <span
                className="absolute inset-0 grid place-items-center text-[15px] font-extrabold text-white"
                style={{ background: swatch(trimmed || "?") }}
              >
                {(trimmed || "?").slice(0, 2)}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-[38px] items-center justify-center gap-1.5 rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[13px] font-semibold text-[#C4C8D2]"
            >
              <Upload className="size-3.5" /> 이미지 업로드
            </button>
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="flex h-[38px] items-center justify-center gap-1.5 rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[13px] font-semibold text-[#C4C8D2]"
            >
              <Search className="size-3.5" /> 이미지 검색
            </button>
            {imageUrl && (
              <button
                type="button"
                onClick={() => setImageUrl(null)}
                className="h-[26px] text-[11px] text-[#8A8F9C] hover:text-[#C4C8D2]"
              >
                이미지 제거
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="mb-[18px] text-[11px] text-[#8A8F9C]">이미지가 없으면 이름 이니셜 스와치로 표시됩니다.</div>

        <div className="flex gap-2">
          {item && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="h-[38px] rounded-[6px] border border-[rgba(239,68,68,.45)] bg-transparent px-4 text-[13px] font-bold text-[#F87171]"
            >
              삭제
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="h-[38px] rounded-[6px] border border-[#2A303C] bg-[#171B22] px-4 text-[13px] font-semibold text-[#C4C8D2]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!trimmed}
            className="h-[38px] rounded-[6px] bg-[#6366F1] px-[22px] text-[13px] font-bold text-white disabled:opacity-40"
          >
            저장
          </button>
        </div>
      </div>

      {searching && (
        <ImageSearchPanel
          initialQuery={trimmed}
          onSelect={(url) => {
            setImageUrl(url);
            setSearching(false);
          }}
          onClose={() => setSearching(false)}
        />
      )}

      {cropSrc && (
        <CropPanel
          src={cropSrc}
          onCropped={(url) => {
            setImageUrl(url);
            setCropSrc(null);
          }}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </>
  );
}
