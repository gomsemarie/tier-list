import { useEffect, useRef, useState } from "react";
import { Camera, Check, KeyRound, List, Loader2, LogOut, Plus, Sparkles, Swords } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ABILITY_ATTACK,
  DEFAULT_SC_STYLE,
  PERKS,
  RARITY_META,
  SC_STYLES,
  perkById,
  type AuthUser,
  type CodeInfo,
  type IssueCodeResult,
  type ProfileUpdate,
  type Rarity,
  type RedeemResult,
  type UpdateResult,
} from "@tier-list/shared";
import { Avatar } from "./Avatar";
import { CropPanel } from "./CropPanel";
import { RoleBadge } from "./RoleBadge";

type AccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser;
  onUpdate: (patch: ProfileUpdate) => Promise<UpdateResult>;
  onLogout: () => void;
  onRedeem: (code: string) => Promise<RedeemResult>;
  onEquip: (patch: { frame?: string; scStyle?: string }) => Promise<UpdateResult>;
  onFetchCodes: () => Promise<CodeInfo[]>;
  onIssueCode: (perks: string[]) => Promise<IssueCodeResult>;
};

export function AccountDialog({
  open,
  onOpenChange,
  user,
  onUpdate,
  onLogout,
  onRedeem,
  onEquip,
  onFetchCodes,
  onIssueCode,
}: AccountDialogProps) {
  const [nickname, setNickname] = useState(user.nickname);
  const [avatar, setAvatar] = useState<string | null>(user.avatar ?? null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [codes, setCodes] = useState<CodeInfo[] | null>(null);
  const [issuePerk, setIssuePerk] = useState<string>(PERKS[0]?.id ?? "");
  const [issuing, setIssuing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setNickname(user.nickname);
      setAvatar(user.avatar ?? null);
      setCropSrc(null);
      setCurrentPassword("");
      setNewPassword("");
      setError(null);
      setDone(false);
      setBusy(false);
      setCode("");
      setRedeemMsg(null);
      setCodes(null);
    }
  }, [open, user]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setCropSrc(URL.createObjectURL(file));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(false);
    const patch: ProfileUpdate = {};
    if (nickname.trim() !== user.nickname) patch.nickname = nickname.trim();
    if ((avatar ?? "") !== (user.avatar ?? "")) patch.avatar = avatar ?? "";
    if (newPassword) {
      patch.password = newPassword;
      patch.currentPassword = currentPassword;
    }
    const res = await onUpdate(patch);
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setCurrentPassword("");
      setNewPassword("");
    } else {
      setError(res.error);
    }
  }

  async function redeem() {
    const c = code.trim();
    if (!c) return;
    const res = await onRedeem(c);
    if (res.ok) {
      setCode("");
      setRedeemMsg({
        ok: true,
        text: res.granted.length
          ? `잠금 해제: ${res.granted.map((id) => perkById(id)?.name ?? id).join(", ")}`
          : "이미 보유한 코드예요.",
      });
    } else {
      setRedeemMsg({ ok: false, text: res.error });
    }
  }

  const unlocked = new Set(user.unlocked);
  const byRarity = (a: { rarity: Rarity }, b: { rarity: Rarity }) =>
    RARITY_META[a.rarity].order - RARITY_META[b.rarity].order;
  const myFrames = PERKS.filter((p) => p.type === "frame" && unlocked.has(p.id)).sort(byRarity);
  const allStyles = PERKS.filter((p) => p.type === "superchat").sort(byRarity);
  const equippedStyle = user.scStyle || DEFAULT_SC_STYLE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <p className="label-caps text-muted-foreground">
            {cropSrc ? "Crop" : "Account"}
          </p>
          <DialogTitle className="text-xl">
            {cropSrc ? "프로필 이미지" : "계정 관리"}
          </DialogTitle>
          <DialogDescription>
            {cropSrc
              ? "드래그로 위치를 옮기고, 슬라이더로 확대/축소해 원형 영역을 맞추세요."
              : `@${user.username} 계정의 프로필·꾸미기·보안을 관리합니다.`}
          </DialogDescription>
        </DialogHeader>

        {cropSrc ? (
          <CropPanel
            src={cropSrc}
            onCancel={() => setCropSrc(null)}
            onCropped={(dataUrl) => {
              setAvatar(dataUrl);
              setCropSrc(null);
            }}
          />
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">내 권한</span>
              {user.isAdmin ? (
                <RoleBadge role="admin" withLabel />
              ) : (
                <span className="font-medium">일반 회원</span>
              )}
            </div>

            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0">
                <Avatar
                  name={nickname || user.username}
                  src={avatar}
                  frame={user.frame}
                  size={60}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title="프로필 이미지 변경"
                  className="absolute -right-1.5 -bottom-1.5 grid size-[22px] place-items-center rounded-full border border-[#2A303C] bg-[#161B22] text-[#A5B4FC]"
                >
                  <Camera className="size-3" />
                </button>
              </div>
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="acc-nick" className="text-[11px] font-semibold text-[#8A8F9C]">
                  닉네임
                </Label>
                <Input
                  id="acc-nick"
                  value={nickname}
                  maxLength={24}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />

            {/* Cosmetics */}
            <div className="grid gap-3 border-t border-border pt-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="size-4 text-fuchsia-500" /> 꾸미기
              </p>

              {/* Code redeem */}
              <div className="flex gap-2">
                <Input
                  value={code}
                  placeholder="받은 코드를 입력하세요"
                  className="font-mono uppercase"
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) redeem();
                  }}
                />
                <Button variant="outline" onClick={redeem} disabled={!code.trim()}>
                  <KeyRound /> 등록
                </Button>
              </div>
              {redeemMsg && (
                <p className={cn("text-xs", redeemMsg.ok ? "text-green-600" : "text-destructive")}>
                  {redeemMsg.text}
                </p>
              )}

              {/* Abilities */}
              {user.unlocked.includes(ABILITY_ATTACK) && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  <Swords className="size-4" /> 공격 권한 보유 — 참가자 프로필에서 ⚔ 공격 가능
                </div>
              )}

              {/* Frame picker */}
              <div className="grid gap-1.5">
                <span className="text-xs text-muted-foreground">프로필 테두리</span>
                <div className="flex flex-wrap gap-2">
                  <FrameOption
                    active={!user.frame}
                    label="없음"
                    onClick={() => onEquip({ frame: "" })}
                  >
                    <Avatar name={nickname || user.username} src={avatar} size={36} />
                  </FrameOption>
                  {myFrames.map((p) => (
                    <FrameOption
                      key={p.id}
                      active={user.frame === p.id}
                      label={p.name}
                      rarity={p.rarity}
                      onClick={() => onEquip({ frame: p.id })}
                    >
                      <Avatar
                        name={nickname || user.username}
                        src={avatar}
                        frame={p.id}
                        size={36}
                      />
                    </FrameOption>
                  ))}
                </div>
                {myFrames.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    코드를 등록하면 테두리가 추가됩니다.
                  </p>
                )}
              </div>

              {/* Superchat style picker — owned styles are equippable */}
              <div className="grid gap-2">
                <div className="text-sm font-bold">슈퍼챗 스타일</div>
                <p className="text-xs text-muted-foreground">
                  보유한 스타일 중 채팅에 쓸 1개를 선택하세요.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onEquip({ scStyle: "" })}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
                      !equippedStyle ? "border-foreground" : "border-border hover:border-foreground/40",
                    )}
                  >
                    <span className="rounded-sm bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                      OFF
                    </span>
                    <span className="flex-1 text-sm font-semibold">사용 안 함</span>
                    {!equippedStyle && (
                      <span className="rounded-sm bg-indigo px-2 py-0.5 text-[11px] font-bold text-white">
                        장착중
                      </span>
                    )}
                  </button>
                  {allStyles.map((p) => {
                    const sc = SC_STYLES[p.id] ?? SC_STYLES.base;
                    const owned = unlocked.has(p.id);
                    const equipped = equippedStyle === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!owned}
                        onClick={() => owned && onEquip({ scStyle: p.id })}
                        className={cn(
                          "relative flex items-center gap-2.5 overflow-hidden rounded-md px-3 py-2 text-left transition-transform",
                          owned
                            ? cn(sc.gradient, sc.effect, "active:scale-[0.99]")
                            : "border border-dashed border-[#2A3142] bg-paper opacity-60",
                          equipped && "ring-2 ring-indigo ring-offset-1 ring-offset-card",
                        )}
                      >
                        <RarityTag rarity={p.rarity} />
                        <span
                          className={cn(
                            "relative z-10 flex-1 truncate text-sm font-bold drop-shadow",
                            owned ? sc.text ?? "text-white" : "text-muted-foreground",
                          )}
                        >
                          {sc.name}
                        </span>
                        {equipped ? (
                          <span className="relative z-10 rounded-sm bg-indigo px-2 py-0.5 text-[11px] font-bold text-white">
                            장착중
                          </span>
                        ) : owned ? (
                          <span className="relative z-10 text-[11px] font-bold text-white/90">
                            보유
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">미보유 · 코드 필요</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  채팅에서 <code className="rounded bg-muted px-1">/super</code> 로 사용됩니다.
                </p>
              </div>

              {/* Admin: issue + grantable code list */}
              {user.isAdmin && (
                <div className="grid gap-2 border-t border-border pt-4">
                  <p className="text-sm font-medium">상환 코드 관리</p>

                  {/* Issue a new single-use code */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={issuePerk}
                      onChange={(e) => setIssuePerk(e.target.value)}
                      className="h-9 flex-1 rounded-md border border-input bg-paper px-2 text-sm outline-none"
                    >
                      {PERKS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {RARITY_META[p.rarity].label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={issuing || !issuePerk}
                      onClick={async () => {
                        setIssuing(true);
                        const res = await onIssueCode([issuePerk]);
                        setIssuing(false);
                        if (res.ok) {
                          setCodes((prev) => [res.code, ...(prev ?? [])]);
                          navigator.clipboard?.writeText(res.code.code).catch(() => {});
                          setRedeemMsg({
                            ok: true,
                            text: `발급됨: ${res.code.code} (복사됨)`,
                          });
                        } else {
                          setRedeemMsg({ ok: false, text: res.error });
                        }
                      }}
                    >
                      <Plus /> 코드 발급
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => setCodes(await onFetchCodes())}
                    >
                      <List /> 목록
                    </Button>
                  </div>

                  {codes && (
                    <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 text-xs">
                      {codes.length === 0 && (
                        <p className="p-1 text-muted-foreground">코드가 없습니다.</p>
                      )}
                      {codes.map((c) => (
                        <div
                          key={c.code}
                          className="flex items-center gap-2 rounded-md px-1.5 py-1"
                        >
                          <span className="font-mono font-bold tracking-wider">
                            {c.code}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {c.perks.join(", ")}
                          </span>
                          {c.singleUse ? (
                            c.usedBy ? (
                              <span className="shrink-0 rounded-sm bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-300">
                                사용됨 · {c.usedBy}
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-sm bg-indigo/20 px-1.5 py-0.5 font-semibold text-indigo-fg">
                                미사용
                              </span>
                            )
                          ) : (
                            <span className="shrink-0 rounded-sm bg-white/10 px-1.5 py-0.5 font-semibold text-muted-foreground">
                              재사용
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Password */}
            <div className="grid gap-2 border-t border-border pt-4">
              <p className="text-sm font-medium">비밀번호 변경 (선택)</p>
              <Input
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                placeholder="현재 비밀번호"
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <Input
                type="password"
                value={newPassword}
                autoComplete="new-password"
                placeholder="새 비밀번호 (4자 이상)"
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {done && (
              <p className="flex items-center gap-1.5 text-sm text-green-600">
                <Check className="size-4" /> 저장되었습니다.
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive hover:text-white"
                onClick={() => {
                  onLogout();
                  onOpenChange(false);
                }}
              >
                <LogOut /> 로그아웃
              </Button>
              <Button disabled={busy} onClick={save}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />} 저장
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RarityTag({ rarity }: { rarity: Rarity }) {
  const r = RARITY_META[rarity];
  return (
    <span className={cn("rounded-full px-1.5 text-[9px] leading-tight font-bold", r.className)}>
      {r.label}
    </span>
  );
}

function FrameOption({
  active,
  label,
  rarity,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  rarity?: Rarity;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-colors",
        active ? "border-foreground" : "border-transparent hover:border-border",
      )}
    >
      {children}
      <span className="max-w-16 truncate text-[10px] text-muted-foreground">
        {label}
      </span>
      {rarity && <RarityTag rarity={rarity} />}
    </button>
  );
}

