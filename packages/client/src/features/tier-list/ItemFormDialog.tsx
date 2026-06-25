import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ImageIcon, Plus, Replace, Search, Upload } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { findSimilarItems, type SimilarItem } from "@/lib/similarity";
import { ImageSearchPanel } from "./ImageSearchPanel";
import type { Item } from "@tier-list/shared";

type ItemFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Item | null;
  onSave: (name: string, imageUrl: string | null) => void;
  existingItems?: Item[];
  onReplace?: (id: string, name: string, imageUrl: string | null) => void;
  /** Delete the item being edited (shown only in edit mode). */
  onRemove?: (id: string) => void;
};

function hueColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${((hash % 360) + 360) % 360},40%,46%)`;
}

const IN = "h-[38px] w-full rounded-md border px-3 text-[13px] text-[#EDEAE2] outline-none";
const IN_STYLE = { background: "#0E1117", borderColor: "#242a3a" } as const;
const BTN_G =
  "flex h-[38px] items-center justify-center gap-1.5 rounded-md border text-[13px] font-semibold text-[#C4C8D2]";
const BTN_G_STYLE = { background: "#171B22", borderColor: "#2A303C" } as const;

export function ItemFormDialog({
  open,
  onOpenChange,
  editing,
  onSave,
  existingItems = [],
  onReplace,
  onRemove,
}: ItemFormDialogProps) {
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<SimilarItem[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setImageUrl(editing?.imageUrl ?? null);
      setSearching(false);
      setError(null);
      setDupes(null);
    }
  }, [open, editing]);

  function commitAdd(n: string, url: string | null) {
    onSave(n, url);
    onOpenChange(false);
  }

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("이름을 입력하세요.");
      return;
    }
    if (editing) {
      commitAdd(trimmed, imageUrl);
      return;
    }
    const sims = findSimilarItems(trimmed, existingItems).slice(0, 6);
    if (sims.length > 0) {
      setDupes(sims);
      return;
    }
    commitAdd(trimmed, imageUrl);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  const title = searching
    ? "이미지 검색"
    : dupes
      ? "중복 대상 확인"
      : editing
        ? "대상 수정"
        : "대상 추가";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 rounded-[10px] border p-5 sm:max-w-[430px] [&>button]:hidden"
        style={{ background: "#11141B", borderColor: "#232934" }}
      >
        <DialogTitle className="mb-4 text-[16px] font-extrabold text-[#EDEAE2]">
          {title}
        </DialogTitle>

        {searching ? (
          <ImageSearchPanel
            initialQuery={name}
            onSelect={(url) => {
              setImageUrl(url);
              setSearching(false);
            }}
            onBack={() => setSearching(false)}
          />
        ) : dupes ? (
          <>
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber/30 bg-amber/10 p-3 text-sm text-amber-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-fg" />
              <span>
                <b>{name.trim()}</b> 와(과) 비슷한 대상이 <b>{dupes.length}개</b> 있어요. 같은
                것이라면 교체하세요.
              </span>
            </div>
            <div className="grid max-h-[40vh] gap-2 overflow-y-auto">
              {dupes.map(({ item, score }) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-2"
                >
                  <span className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-[10px] font-bold text-muted-foreground">
                        {item.name.slice(0, 2)}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">유사도 {Math.round(score * 100)}%</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onReplace?.(item.id, name.trim(), imageUrl);
                      onOpenChange(false);
                    }}
                    className={`${BTN_G} px-3`}
                    style={BTN_G_STYLE}
                  >
                    <Replace className="size-3.5" /> 교체
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setDupes(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← 다시 입력
              </button>
              <button
                type="button"
                onClick={() => commitAdd(name.trim(), imageUrl)}
                className="flex h-9 items-center gap-1.5 rounded-md px-4 text-[13px] font-bold text-white"
                style={{ background: "#6366F1" }}
              >
                <Plus className="size-4" /> 그대로 새로 추가
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Name */}
            <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">이름</label>
            <input
              value={name}
              autoFocus
              placeholder="예: 새우깡"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
              }}
              className={`${IN} mb-4`}
              style={IN_STYLE}
            />

            {/* Image */}
            <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">이미지</label>
            <div className="mb-3.5 flex gap-3">
              <div
                className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-md border"
                style={{ borderColor: "#2A303C", background: "#0E1117" }}
              >
                {imageUrl ? (
                  <img src={imageUrl} alt={name} className="size-full object-cover" />
                ) : name.trim() ? (
                  <span
                    className="grid size-full place-items-center text-lg font-extrabold text-white"
                    style={{ background: hueColor(name) }}
                  >
                    {name.slice(0, 2)}
                  </span>
                ) : (
                  <ImageIcon className="size-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={BTN_G}
                  style={BTN_G_STYLE}
                >
                  <Upload className="size-3.5" /> 이미지 업로드
                </button>
                <button
                  type="button"
                  onClick={() => setSearching(true)}
                  className={BTN_G}
                  style={BTN_G_STYLE}
                >
                  <Search className="size-3.5" /> 이미지 검색
                </button>
              </div>
            </div>
            <p className="mb-[18px] text-[11px] text-[#8A8F9C]">
              이미지가 없으면 이름 이니셜 스와치로 표시됩니다.
            </p>

            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            {/* Footer */}
            <div className="flex gap-2">
              {editing && onRemove && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`'${editing.name}'을(를) 삭제할까요?`)) {
                      onRemove(editing.id);
                      onOpenChange(false);
                    }
                  }}
                  className="h-[38px] rounded-md border px-4 text-[13px] font-bold text-[#F87171]"
                  style={{ background: "transparent", borderColor: "rgba(239,68,68,.45)" }}
                >
                  삭제
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={`${BTN_G} px-4`}
                style={BTN_G_STYLE}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="h-[38px] rounded-md px-[22px] text-[13px] font-bold text-white"
                style={{ background: "#6366F1" }}
              >
                {editing ? "저장" : "추가"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
