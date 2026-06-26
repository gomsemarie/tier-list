import { useEffect, useRef, useState } from "react";
import { ImagePlus, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";

import type { RoomSummary } from "@tier-list/shared";
import { ImageSearchPanel } from "./ImageSearchPanel";

type RoomDialogProps = {
  rooms: RoomSummary[];
  nickname: string;
  myId?: string;
  isAdmin?: boolean;
  error?: string | null;
  onRefresh: () => void;
  onJoin: (code: string) => void;
  onCreate: (title: string, isPublic: boolean, image: string) => void;
  onRename: (roomId: string, title: string) => void;
  onDelete: (roomId: string) => void;
  onSetImage: (roomId: string, image: string) => void;
  onClose: () => void;
};

function readImage(file: File | undefined, cb: (dataUrl: string) => void) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") cb(reader.result);
  };
  reader.readAsDataURL(file);
}

/** Lobby: public room list + code-join, with an inline create view. */
export function RoomDialog({
  rooms,
  nickname,
  myId,
  isAdmin,
  error,
  onRefresh,
  onJoin,
  onCreate,
  onRename,
  onDelete,
  onSetImage,
  onClose,
}: RoomDialogProps) {
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [cover, setCover] = useState("");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // Image-search target: "create" (the create form) or a room id (existing room).
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const rowImgRef = useRef<HTMLInputElement>(null);
  const rowTargetRef = useRef<string | null>(null);

  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/60" />
      <div
        className="fixed top-1/2 left-1/2 z-[61] flex max-h-[82vh] w-[760px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[10px] border border-[#242a3a] bg-[#13161D]"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,.6)", animation: "popIn .16s ease both" }}
      >
        {/* Header bar */}
        <div className="flex items-center gap-3 border-b border-[#20252F] bg-[#101319] px-[18px] py-[13px]">
          <span className="flex h-[26px] w-[26px] flex-col justify-center gap-[3px] rounded-md border border-line-strong bg-secondary px-[6px]">
            <span className="h-[3px] w-full rounded-sm bg-amber" />
            <span className="h-[3px] w-[68%] rounded-sm bg-indigo" />
            <span className="h-[3px] w-[42%] rounded-sm bg-teal" />
          </span>
          <span className="text-[15px] font-extrabold text-[#EDEAE2]">티어리스트</span>
          <div className="flex-1" />
          <div className="flex h-[34px] items-center gap-2 rounded-[6px] border border-[#2A303C] bg-[#171B22] pr-2.5 pl-1.5">
            <span className="grid size-[22px] place-items-center rounded-full bg-[#5B6EE1] text-[11px] font-extrabold text-white">
              {nickname.slice(0, 1)}
            </span>
            <span className="text-[12px] font-bold text-[#EDEAE2]">{nickname}</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-[18px]">
          {creating ? (
            <div className="mx-auto w-full max-w-[380px]">
              <div className="mb-4 text-[16px] font-extrabold text-[#EDEAE2]">새 방 만들기</div>
              <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">방 제목</label>
              <input
                value={title}
                autoFocus
                placeholder="예: 라면 티어 정하기"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && title.trim() && onCreate(title.trim(), isPublic, cover)}
                className="mb-4 h-[38px] w-full rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-3 text-[13px] text-[#EDEAE2] outline-none focus:border-[#6366F1]"
              />
              <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">대표 이미지 (선택)</label>
              <div className="mb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => coverRef.current?.click()}
                  className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[6px] border border-dashed border-[#2A3142] bg-[#0E1117] text-[#8A8F9C]"
                >
                  {cover ? <img src={cover} alt="" className="size-full object-cover" /> : <ImagePlus className="size-5" />}
                </button>
                <div className="flex flex-col items-start gap-1.5">
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => coverRef.current?.click()}
                      className="rounded-[5px] border border-[#2A303C] bg-[#171B22] px-2.5 py-1 text-[12px] font-semibold text-[#C4C8D2]"
                    >
                      업로드
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchFor("create")}
                      className="flex items-center gap-1 rounded-[5px] border border-[#2A303C] bg-[#171B22] px-2.5 py-1 text-[12px] font-semibold text-[#C4C8D2]"
                    >
                      <Search className="size-3" /> 검색
                    </button>
                  </div>
                  {cover && (
                    <button type="button" onClick={() => setCover("")} className="text-[11px] text-[#8A8F9C]">
                      제거
                    </button>
                  )}
                </div>
                <input
                  ref={coverRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    readImage(e.target.files?.[0], setCover);
                    e.target.value = "";
                  }}
                />
              </div>
              <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">공개 설정</label>
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className="h-9 flex-1 rounded-[6px] border text-[12px] font-bold"
                  style={
                    isPublic
                      ? { borderColor: "#6366F1", background: "rgba(99,102,241,.14)", color: "#A5B4FC" }
                      : { borderColor: "#2A303C", background: "#0E1117", color: "#8A8F9C" }
                  }
                >
                  공개 (목록 노출)
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className="h-9 flex-1 rounded-[6px] border text-[12px] font-bold"
                  style={
                    !isPublic
                      ? { borderColor: "#6366F1", background: "rgba(99,102,241,.14)", color: "#A5B4FC" }
                      : { borderColor: "#2A303C", background: "#0E1117", color: "#8A8F9C" }
                  }
                >
                  비공개 (코드만)
                </button>
              </div>
              <div className="mb-[18px] text-[11px] leading-[1.5] text-[#8A8F9C]">
                생성하면 4자리 초대 코드가 발급됩니다. 방장 권한으로 티어·참가자·모더레이션을 관리할 수 있어요.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="h-10 rounded-[6px] border border-[#2A303C] bg-[#171B22] px-4 text-[13px] font-semibold text-[#C4C8D2]"
                >
                  뒤로
                </button>
                <button
                  type="button"
                  disabled={!title.trim()}
                  onClick={() => onCreate(title.trim(), isPublic, cover)}
                  className="h-10 flex-1 rounded-[6px] bg-[#6366F1] text-[13px] font-bold text-white disabled:opacity-40"
                >
                  방 만들기
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2.5">
                <span className="text-[18px] font-extrabold text-[#EDEAE2]">방 목록</span>
                <div className="flex-1" />
                <input
                  value={code}
                  placeholder="코드로 입장 (예: K7Q2)"
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && code.trim() && onJoin(code.trim())}
                  className="h-[38px] w-[200px] rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-3 font-mono text-[13px] tracking-[1px] text-[#EDEAE2] outline-none focus:border-[#6366F1]"
                />
                <button
                  type="button"
                  disabled={!code.trim()}
                  onClick={() => onJoin(code.trim())}
                  className="h-[38px] rounded-[6px] border border-[#2A303C] bg-[#171B22] px-3.5 text-[13px] font-semibold text-[#C4C8D2] disabled:opacity-40"
                >
                  입장
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex h-[38px] items-center gap-1.5 rounded-[6px] bg-[#6366F1] px-4 text-[13px] font-bold text-white"
                >
                  <Plus className="size-4" /> 방 생성
                </button>
              </div>

              {error && <div className="mb-2.5 text-[12px] text-[#F87171]">{error}</div>}

              <div className="flex min-h-0 flex-1 flex-col gap-[9px] overflow-y-auto">
                {rooms.length === 0 ? (
                  <div className="grid flex-1 place-items-center py-12 text-[13px] text-[#8A8F9C]">
                    공개된 방이 없습니다 — 새 방을 만들어 보세요.
                  </div>
                ) : (
                  rooms.map((r) => {
                    const mine = (!!myId && r.ownerId === myId) || !!isAdmin;
                    return (
                    <div
                      key={r.id}
                      className="relative flex items-center gap-[13px] rounded-[8px] border border-[#232934] bg-[#0E1117] px-[15px] py-[13px]"
                    >
                      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[6px] border border-[#232934] bg-[#11141B]">
                        {r.image ? (
                          <img src={r.image} alt="" className="size-full object-cover" />
                        ) : (
                          <span className="text-[15px] font-extrabold text-[#4A4F5B]">{r.title.slice(0, 1)}</span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-[3px]">
                        <div className="flex items-center gap-2">
                          <span className="size-[7px] rounded-full bg-[#5BD3A0]" />
                          <span className="text-[14px] font-bold text-[#EDEAE2]">{r.title}</span>
                          {mine && (
                            <span className="rounded-[5px] bg-[rgba(99,102,241,.16)] px-1.5 py-0.5 text-[10px] font-bold text-[#A5B4FC]">
                              내 방
                            </span>
                          )}
                          {!r.isPublic && (
                            <span className="rounded-[3px] border border-[#2A303C] px-1.5 py-px text-[9px] font-bold text-[#8A8F9C]">
                              비공개
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 text-[11px] text-[#8A8F9C]">
                          <span className="font-mono tracking-[1px] text-[#C4C8D2]">{r.id}</span>
                          {r.ownerName && <span>방장 {r.ownerName}</span>}
                          <span>◍ {r.memberCount}명</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onJoin(r.id)}
                        className="h-[38px] rounded-[6px] border border-[#2A303C] bg-[#171B22] px-[18px] text-[13px] font-semibold text-[#C4C8D2]"
                      >
                        입장
                      </button>
                      {mine && (
                        <button
                          type="button"
                          aria-label="방 관리"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenu((m) => (m?.id === r.id ? null : { id: r.id, x: rect.right, y: rect.bottom }));
                          }}
                          className="grid size-[38px] place-items-center rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[#C4C8D2]"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      )}
                      {menu?.id === r.id && (
                        <>
                          <div className="fixed inset-0 z-[62]" onClick={() => setMenu(null)} />
                          <div
                            className="fixed z-[63] w-[160px] rounded-[8px] border border-[#2A3142] bg-[#13161D] p-1.5 shadow-[0_14px_40px_rgba(0,0,0,.6)]"
                            style={{ left: Math.max(8, menu.x - 160), top: menu.y + 6 }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setMenu(null);
                                const t = window.prompt("새 방 이름", r.title)?.trim();
                                if (t && t !== r.title) onRename(r.id, t);
                              }}
                              className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-2 text-[12px] text-[#D5D8E2] hover:bg-[#1B2029]"
                            >
                              <Pencil className="size-3.5" /> 이름 변경
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMenu(null);
                                rowTargetRef.current = r.id;
                                rowImgRef.current?.click();
                              }}
                              className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-2 text-[12px] text-[#D5D8E2] hover:bg-[#1B2029]"
                            >
                              <ImagePlus className="size-3.5" /> 대표 이미지 업로드
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMenu(null);
                                setSearchFor(r.id);
                              }}
                              className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-2 text-[12px] text-[#D5D8E2] hover:bg-[#1B2029]"
                            >
                              <Search className="size-3.5" /> 대표 이미지 검색
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMenu(null);
                                if (window.confirm(`'${r.title}' 방을 삭제할까요?`)) onDelete(r.id);
                              }}
                              className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-2 text-[12px] text-[#F87171] hover:bg-[#1B2029]"
                            >
                              <Trash2 className="size-3.5" /> 방 삭제
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <input
        ref={rowImgRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const id = rowTargetRef.current;
          if (id) readImage(e.target.files?.[0], (url) => onSetImage(id, url));
          e.target.value = "";
          rowTargetRef.current = null;
        }}
      />

      {searchFor && (
        <ImageSearchPanel
          initialQuery={searchFor === "create" ? title : rooms.find((r) => r.id === searchFor)?.title ?? ""}
          onSelect={(url) => {
            if (searchFor === "create") setCover(url);
            else onSetImage(searchFor, url);
            setSearchFor(null);
          }}
          onClose={() => setSearchFor(null)}
        />
      )}
    </>
  );
}
