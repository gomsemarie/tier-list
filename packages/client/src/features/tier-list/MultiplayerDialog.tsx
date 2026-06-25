import { useEffect, useState } from "react";
import {
  Check,
  Loader2,
  LogIn,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AuthUser, RoomSummary } from "@tier-list/shared";
import { Avatar } from "./Avatar";
import { RoleBadge } from "./RoleBadge";
import type { ServerStatus } from "./useRoom";

type MultiplayerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: ServerStatus;
  error: string | null;
  authUser: AuthUser | null;
  roomList: RoomSummary[];
  onCreate: (title: string, isPublic?: boolean) => void;
  onJoin: (roomId: string) => void;
  onList: () => void;
  onRename: (roomId: string, title: string) => void;
  onDelete: (roomId: string) => void;
  onRequireLogin: () => void;
  onManageAccount: () => void;
  clearError: () => void;
};

export function MultiplayerDialog({
  open,
  onOpenChange,
  status,
  error,
  authUser,
  roomList,
  onCreate,
  onJoin,
  onList,
  onRename,
  onDelete,
  onRequireLogin,
  onManageAccount,
  clearError,
}: MultiplayerDialogProps) {
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [code, setCode] = useState("");
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menuRoomId, setMenuRoomId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setCode("");
      setRenamingId(null);
      clearError();
      if (status === "online") onList();
    }
  }, [open, status, onList, clearError]);

  const offline = status === "offline";
  const canAct = status === "online" && !!authUser;

  const mine = authUser
    ? roomList.filter((r) => r.ownerId === authUser.id)
    : [];
  const shown = filter === "mine" ? mine : roomList;

  function join(id: string) {
    if (!canAct) return;
    onJoin(id);
  }
  function create() {
    if (!canAct) return;
    onCreate(title.trim(), isPublic);
  }
  function startRename(room: RoomSummary) {
    setRenamingId(room.id);
    setRenameDraft(room.title);
  }
  function commitRename(id: string) {
    const t = renameDraft.trim();
    if (t) onRename(id, t);
    setRenamingId(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <p className="label-caps text-muted-foreground">Multiplayer</p>
          <DialogTitle className="text-xl">멀티플레이</DialogTitle>
          <DialogDescription>
            방을 만들거나 목록에서 골라 참여해 여러 명이 함께 티어를 정하세요.
          </DialogDescription>
        </DialogHeader>

        {offline ? (
          <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            서버에 연결할 수 없습니다. <b className="text-foreground">싱글 모드</b>
            만 사용할 수 있어요. 서버를 실행하면 멀티가 활성화됩니다.
          </p>
        ) : !authUser ? (
          <div className="grid gap-3 py-2 text-center">
            <p className="text-sm text-muted-foreground">
              멀티플레이는 <b className="text-foreground">로그인</b>이 필요해요.
              로그인하면 닉네임·프로필이 계정에 저장되고 방을 관리할 수 있어요.
            </p>
            <Button onClick={onRequireLogin}>
              <LogIn /> 로그인 / 회원가입
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {/* Logged-in identity */}
            <button
              type="button"
              onClick={onManageAccount}
              className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-2.5 text-left transition-colors hover:border-foreground/30"
            >
              <Avatar
                name={authUser.nickname}
                src={authUser.avatar ?? null}
                frame={authUser.frame}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold">
                  {authUser.nickname}
                  {authUser.isAdmin && <RoleBadge role="admin" />}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  @{authUser.username}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                계정 관리
              </span>
            </button>

            {/* Create */}
            <div className="flex gap-2">
              <Input
                value={title}
                maxLength={40}
                placeholder="새 방 이름 (선택)"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) create();
                }}
              />
              <Button disabled={!canAct} onClick={create}>
                <Plus /> 방 만들기
              </Button>
            </div>

            {/* Visibility */}
            <div className="-mt-1.5 flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">공개 설정</span>
              <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-semibold transition-colors",
                    isPublic ? "bg-indigo text-white" : "text-muted-foreground",
                  )}
                >
                  공개 (목록 노출)
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-semibold transition-colors",
                    !isPublic ? "bg-indigo text-white" : "text-muted-foreground",
                  )}
                >
                  비공개 (코드만)
                </button>
              </div>
            </div>

            {/* Join by code */}
            <div className="flex gap-2">
              <Input
                value={code}
                maxLength={6}
                placeholder="코드로 참여 (예: AB3K9P)"
                className="font-mono tracking-widest uppercase"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.nativeEvent.isComposing &&
                    canAct &&
                    code.trim()
                  ) {
                    join(code.trim());
                  }
                }}
              />
              <Button
                variant="outline"
                disabled={!canAct || !code.trim()}
                onClick={() => join(code.trim())}
              >
                <LogIn /> 참여
              </Button>
            </div>

            {/* Room list */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition-colors",
                      filter === "all"
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    전체 {roomList.length}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("mine")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition-colors",
                      filter === "mine"
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    내 방 {mine.length}
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="새로고침"
                  onClick={onList}
                >
                  {status === "connecting" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                </Button>
              </div>

              <div className="grid max-h-[40vh] gap-2 overflow-y-auto sm:grid-cols-2">
                {shown.length === 0 ? (
                  <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                    {filter === "mine"
                      ? "내가 만든 방이 없어요."
                      : "아직 방이 없어요. 새로 만들어 보세요."}
                  </p>
                ) : (
                  shown.map((r) => {
                    const isMine = r.ownerId === authUser.id;
                    const canManage = isMine || authUser.isAdmin;
                    return (
                      <div
                        key={r.id}
                        className="shadow-soft group relative rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/30"
                      >
                        {renamingId === r.id ? (
                          <div className="flex gap-1.5">
                            <Input
                              value={renameDraft}
                              autoFocus
                              maxLength={40}
                              className="h-8"
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  !e.nativeEvent.isComposing
                                )
                                  commitRename(r.id);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                            />
                            <Button
                              size="icon"
                              className="size-8"
                              aria-label="확인"
                              onClick={() => commitRename(r.id)}
                            >
                              <Check />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={!canAct}
                              onClick={() => join(r.id)}
                              className="block w-full text-left disabled:opacity-60"
                            >
                              <div className="flex items-center gap-2 pr-12">
                                <span
                                  className="size-[7px] shrink-0 rounded-full"
                                  style={{ background: r.memberCount > 0 ? "#FF4C3A" : "#5BD3A0" }}
                                />
                                <span className="truncate font-semibold">
                                  {r.title || "이름 없는 방"}
                                </span>
                                {r.memberCount > 0 ? (
                                  <span className="shrink-0 rounded-[3px] border border-[#FF4C3A]/40 px-1.5 py-px text-[9px] font-extrabold text-[#FF6B5A]">
                                    LIVE
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-[10px] text-muted-foreground">대기</span>
                                )}
                                {isMine && (
                                  <span className="shrink-0 rounded-full bg-indigo/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-fg">
                                    내 방
                                  </span>
                                )}
                              </div>
                              <div className="mt-1.5 flex items-center gap-2.5 text-xs text-muted-foreground">
                                <span className="font-mono tracking-wider text-[#C4C8D2]">
                                  {r.id}
                                </span>
                                {r.ownerName && (
                                  <span className="truncate">방장 {r.ownerName}</span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Users className="size-3" />
                                  {r.memberCount}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Package className="size-3" />
                                  {r.itemCount}
                                </span>
                              </div>
                            </button>

                            {canManage ? (
                              <div className="absolute top-2 right-2">
                                <button
                                  type="button"
                                  aria-label="방 관리"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuRoomId(menuRoomId === r.id ? null : r.id);
                                  }}
                                  className="grid size-7 place-items-center rounded-[2px] border-2 border-black bg-secondary text-muted-foreground shadow-[2px_2px_0_#000] hover:text-foreground"
                                >
                                  <MoreHorizontal className="size-4" />
                                </button>
                                {menuRoomId === r.id && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuRoomId(null);
                                      }}
                                    />
                                    <div className="absolute top-9 right-0 z-20 w-[152px] rounded-lg border border-[#2a3142] bg-[#13161d] p-[5px] shadow-[0_14px_40px_rgba(0,0,0,.6)]">
                                      {isMine && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuRoomId(null);
                                            startRename(r);
                                          }}
                                          className="flex w-full items-center gap-2 rounded-[5px] px-[9px] py-2 text-[12px] text-[#d5d8e2] hover:bg-white/5"
                                        >
                                          <Pencil className="size-3.5" /> 이름 변경
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuRoomId(null);
                                          if (
                                            window.confirm(
                                              `'${r.title}' 방을 삭제할까요? 되돌릴 수 없어요.`,
                                            )
                                          )
                                            onDelete(r.id);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-[5px] px-[9px] py-2 text-[12px] text-[#f87171] hover:bg-white/5"
                                      >
                                        <Trash2 className="size-3.5" /> 방 삭제
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="absolute top-3 right-3 text-[10px] text-muted-foreground">
                                관리 권한 없음
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
