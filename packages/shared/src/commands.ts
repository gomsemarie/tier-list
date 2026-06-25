export type CommandSpec = {
  name: string;
  args: string;
  desc: string;
  aliases?: string[];
};

/** Single source of truth for chat slash commands (UI autocomplete + server help). */
export const COMMANDS: CommandSpec[] = [
  { name: "/add", args: "<이름>[, <이름>…]", desc: "대상 추가" },
  { name: "/remove", args: "<이름>", desc: "대상 삭제", aliases: ["/del"] },
  { name: "/rename", args: "<이름> | <새 이름>", desc: "이름 변경" },
  { name: "/place", args: "<이름> | <티어>", desc: "티어로 이동", aliases: ["/move"] },
  { name: "/tier", args: "add | remove <티어>", desc: "티어 추가/삭제" },
  { name: "/announce", args: "<내용>", desc: "공지(강조 메시지)", aliases: ["/공지"] },
  { name: "/super", args: "<내용>", desc: "슈퍼챗(화려한 강조)", aliases: ["/슈퍼", "/sc"] },
  { name: "/vote", args: "<이름> | <사유> [ | <초> ]", desc: "인정협회 티어 투표 개최", aliases: ["/투표"] },
  { name: "/clear", args: "", desc: "보드 초기화" },
  { name: "/help", args: "", desc: "명령어 목록 보기" },
];

/** Find a command by its name or any alias (case-insensitive). */
export function findCommand(token: string): CommandSpec | undefined {
  const t = token.trim().toLowerCase();
  return COMMANDS.find(
    (c) => c.name === t || c.aliases?.some((a) => a.toLowerCase() === t),
  );
}

export function helpText(): string {
  return [
    "사용 가능한 명령어:",
    ...COMMANDS.map((c) => {
      const alias = c.aliases?.length ? ` (${c.aliases.join(", ")})` : "";
      const args = c.args ? ` ${c.args}` : "";
      return `${c.name}${alias}${args} — ${c.desc}`;
    }),
    "@닉네임 으로 멘션하면 강조됩니다.",
  ].join("\n");
}
