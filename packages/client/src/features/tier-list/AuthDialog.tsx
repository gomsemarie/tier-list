import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { AuthResult } from "@tier-list/shared";

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (username: string, password: string) => Promise<AuthResult>;
  onRegister: (username: string, nickname: string, password: string) => Promise<AuthResult>;
};

const IN = "h-[38px] w-full rounded-md border px-3 text-[13px] text-[#EDEAE2] outline-none";
const IN_STYLE = { background: "#0E1117", borderColor: "#242a3a" } as const;
const FLBL = "mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]";

export function AuthDialog({ open, onOpenChange, onLogin, onRegister }: AuthDialogProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername("");
      setPassword("");
      setConfirm("");
      setError(null);
      setBusy(false);
    }
  }, [open, mode]);

  const isRegister = mode === "register";
  const canSubmit =
    username.trim().length >= 2 &&
    password.length >= 4 &&
    (!isRegister || (confirm.length > 0 && password === confirm));

  async function submit() {
    if (busy) return;
    if (isRegister && password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const u = username.trim();
    const res = isRegister ? await onRegister(u, u, password) : await onLogin(u, password);
    setBusy(false);
    if (res.ok) onOpenChange(false);
    else setError(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 rounded-[10px] border px-6 py-[26px] sm:max-w-[340px] [&>button]:hidden"
        style={{ background: "#11141B", borderColor: "#232934" }}
      >
        <DialogTitle className="sr-only">{isRegister ? "회원가입" : "로그인"}</DialogTitle>

        {/* Brand */}
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span className="flex h-7 w-7 flex-col justify-center gap-[3px] rounded-md border border-[#2A303C] bg-[#161B22] px-[6px]">
            <span className="h-[3px] w-full rounded-sm bg-amber" />
            <span className="h-[3px] w-[68%] rounded-sm bg-indigo" />
            <span className="h-[3px] w-[42%] rounded-sm bg-teal" />
          </span>
          <span className="text-[16px] font-extrabold text-[#EDEAE2]">티어리스트</span>
        </div>

        <div className="mb-1 text-center text-[18px] font-extrabold text-[#EDEAE2]">
          {isRegister ? "회원가입" : "로그인"}
        </div>
        <div className="mb-5 text-center text-[12px] text-[#8A8F9C]">
          {isRegister ? "닉네임·프로필이 계정에 저장됩니다." : "멀티플레이는 계정이 필요합니다."}
        </div>

        <label className={FLBL}>아이디</label>
        <input
          value={username}
          autoComplete="username"
          placeholder={isRegister ? "영문/숫자 2자 이상" : ""}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
          className={`${IN} mb-3.5`}
          style={IN_STYLE}
        />

        <label className={FLBL}>비밀번호</label>
        <input
          type="password"
          value={password}
          autoComplete={isRegister ? "new-password" : "current-password"}
          placeholder={isRegister ? "4자 이상" : ""}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
          className={`${IN} ${isRegister ? "mb-3.5" : "mb-1.5"}`}
          style={IN_STYLE}
        />

        {isRegister && (
          <>
            <label className={FLBL}>비밀번호 확인</label>
            <input
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
              className={`${IN} mb-[18px]`}
              style={IN_STYLE}
            />
          </>
        )}

        {error && <div className="mb-4 text-[11px] text-[#F87171]">{error}</div>}

        <button
          type="button"
          disabled={!canSubmit || busy}
          onClick={submit}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: "#6366F1" }}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {isRegister ? "가입하고 시작" : "로그인"}
        </button>

        <div className="mt-4 text-center text-[12px] text-[#8A8F9C]">
          {isRegister ? "이미 계정이 있나요? " : "계정이 없나요? "}
          <button
            type="button"
            onClick={() => setMode(isRegister ? "login" : "register")}
            className="font-bold text-[#A5B4FC]"
          >
            {isRegister ? "로그인" : "회원가입"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
