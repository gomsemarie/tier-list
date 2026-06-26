import { useState } from "react";

import type { AuthResult } from "@tier-list/shared";

type AuthDialogProps = {
  onLogin: (username: string, password: string) => Promise<AuthResult>;
  onRegister: (username: string, nickname: string, password: string) => Promise<AuthResult>;
  onClose: () => void;
};

const inputCls =
  "h-[38px] w-full rounded-[6px] border border-[#242a3a] bg-[#0E1117] px-3 text-[13px] text-[#EDEAE2] outline-none focus:border-[#6366F1]";

/** Login / register — multiplayer requires an account. */
export function AuthDialog({ onLogin, onRegister, onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    const id = username.trim();
    if (mode === "register") {
      if (id.length < 4) return setError("아이디는 4자 이상이어야 합니다.");
      if (password.length < 6) return setError("비밀번호는 6자 이상이어야 합니다.");
      if (password !== confirm) return setError("비밀번호가 일치하지 않습니다.");
    } else if (!id || !password) {
      return setError("아이디와 비밀번호를 입력하세요.");
    }
    setBusy(true);
    const res =
      mode === "login" ? await onLogin(id, password) : await onRegister(id, id, password);
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error ?? "오류가 발생했습니다.");
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/60" />
      <div
        className="fixed top-1/2 left-1/2 z-[61] w-[340px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-[#242a3a] bg-[#13161D] px-6 py-[26px]"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,.6)", animation: "popIn .16s ease both" }}
      >
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span className="flex h-[26px] w-[26px] flex-col justify-center gap-[3px] rounded-md border border-line-strong bg-secondary px-[6px]">
            <span className="h-[3px] w-full rounded-sm bg-amber" />
            <span className="h-[3px] w-[68%] rounded-sm bg-indigo" />
            <span className="h-[3px] w-[42%] rounded-sm bg-teal" />
          </span>
          <span className="text-[16px] font-extrabold text-[#EDEAE2]">티어리스트</span>
        </div>

        <div className="text-center text-[18px] font-extrabold text-[#EDEAE2]">
          {mode === "login" ? "로그인" : "회원가입"}
        </div>
        <div className="mb-5 text-center text-[12px] text-[#8A8F9C]">
          {mode === "login" ? "멀티플레이는 계정이 필요합니다." : "닉네임·프로필이 계정에 저장됩니다."}
        </div>

        <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">아이디</label>
        <input
          value={username}
          autoFocus
          placeholder={mode === "register" ? "영문/숫자 4자 이상" : undefined}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
          className={`${inputCls} mb-3.5`}
        />

        <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">비밀번호</label>
        <input
          type="password"
          value={password}
          placeholder={mode === "register" ? "6자 이상" : undefined}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
          className={`${inputCls} ${mode === "register" ? "mb-3.5" : "mb-1.5"}`}
        />

        {mode === "register" && (
          <>
            <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">비밀번호 확인</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
              className={`${inputCls} mb-[18px]`}
            />
          </>
        )}

        {error && <div className="mb-4 text-[11px] text-[#F87171]">{error}</div>}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="h-10 w-full rounded-[6px] bg-[#6366F1] text-[13px] font-bold text-white disabled:opacity-50"
        >
          {mode === "login" ? "로그인" : "가입하고 시작"}
        </button>

        <div className="mt-4 text-center text-[12px] text-[#8A8F9C]">
          {mode === "login" ? "계정이 없나요? " : "이미 계정이 있나요? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="font-bold text-[#A5B4FC]"
          >
            {mode === "login" ? "회원가입" : "로그인"}
          </button>
        </div>
      </div>
    </>
  );
}
