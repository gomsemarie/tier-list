export type PerkType = "superchat" | "frame" | "ability";

/** Special ability perk ids (not cosmetic). */
export const ABILITY_ATTACK = "attack";

/**
 * Spectator buff a player contributes to their team during a 티어 결정전.
 * A free profile setting (not an unlockable), default "" (none). Team-pooled.
 */
export type SpecBuffId = "" | "bulwark" | "surge" | "gamble";
export const SPEC_BUFFS: { id: Exclude<SpecBuffId, "">; name: string; desc: string }[] = [
  { id: "bulwark", name: "방어", desc: "관전 1명당 아군 난이도 상승 흡수 +1회" },
  { id: "surge", name: "공격", desc: "관전 1명당 상대 시작 난이도 +1" },
  { id: "gamble", name: "도박", desc: "아군 난이도 상승 시 관전 1명마다 반반 확률 ±1 (난이도 감소·폭증 가능)" },
];
export function isSpecBuff(id: string): id is Exclude<SpecBuffId, ""> {
  return SPEC_BUFFS.some((b) => b.id === id);
}

/** Combat buff a fighter brings into a 결정전 (default "" none). Pools to the team.
 *  `admin` buffs are per-person (not pooled) and only equippable by admins. */
export type CombatBuffId = "" | "bulwark" | "surge" | "life" | "double" | "half";
export const COMBAT_BUFFS: { id: Exclude<CombatBuffId, "">; name: string; desc: string; admin?: boolean }[] = [
  { id: "bulwark", name: "방어", desc: "결투 1명당 아군 난이도 상승 흡수 +1회" },
  { id: "surge", name: "공격", desc: "결투 1명당 상대 시작 난이도 +1" },
  { id: "life", name: "목숨 +1", desc: "결투 1명당 팀 목숨 +1 (탈락 1회를 버팀)" },
  { id: "double", name: "강타 ×2", desc: "[관리자] 내가 상대에게 더하는 난이도 상승을 2배로 적용합니다.", admin: true },
  { id: "half", name: "철벽 ½", desc: "[관리자] 나에게 적용되는 난이도 상승률을 절반(10%→5% 복리)으로 줄입니다.", admin: true },
];
export function isCombatBuff(id: string): id is Exclude<CombatBuffId, ""> {
  return COMBAT_BUFFS.some((b) => b.id === id);
}
/** True for admin-only combat buffs (cannot be equipped by regular users). */
export function isAdminCombatBuff(id: string): boolean {
  return COMBAT_BUFFS.some((b) => b.id === id && b.admin === true);
}
export type Rarity = "common" | "rare" | "epic" | "legendary";

export const RARITY_META: Record<
  Rarity,
  { label: string; order: number; className: string }
> = {
  // Rarity grades C < B < A < S (design palette: mint/sapphire/flame/holo).
  common: { label: "C", order: 0, className: "bg-[#34D399]/15 text-[#34D399]" },
  rare: { label: "B", order: 1, className: "bg-[#60A5FA]/15 text-[#60A5FA]" },
  epic: { label: "A", order: 2, className: "bg-[#F59E0B]/15 text-[#F59E0B]" },
  legendary: {
    label: "S",
    order: 3,
    className: "bg-[#EC4899]/15 text-[#EC4899]",
  },
};

export type Perk = {
  id: string;
  type: PerkType;
  name: string;
  rarity: Rarity;
};

export type SuperIcon = "sparkles" | "star" | "zap" | "flame" | "gem" | "crown";

/** Superchat style. Higher rarity → animated gradient / glow. */
export type SuperStyle = {
  name: string;
  rarity: Rarity;
  gradient: string;
  /** Extra effect classes (animation / glow). */
  effect?: string;
  /** Text class override (default white). */
  text?: string;
  icon: SuperIcon;
};

/** Avatar frame. `disc` frames render a spinning conic ring behind the avatar. */
export type FrameStyle = {
  name: string;
  rarity: Rarity;
  className: string;
  disc?: boolean;
};

/** Default = no superchat style (none). Superchat is unlock-gated. */
export const DEFAULT_SC_STYLE = "";

export const SC_STYLES: Record<string, SuperStyle> = {
  base: {
    name: "기본",
    rarity: "common",
    gradient: "bg-gradient-to-r from-violet-600 via-fuchsia-600 to-amber-500",
    icon: "sparkles",
  },
  sc_mono: {
    name: "모노",
    rarity: "common",
    gradient: "bg-gradient-to-r from-zinc-800 to-zinc-600",
    icon: "sparkles",
  },
  sc_gold: {
    name: "골드",
    rarity: "rare",
    gradient: "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600",
    effect: "sc-glow-gold",
    text: "text-amber-950",
    icon: "star",
  },
  sc_neon: {
    name: "네온",
    rarity: "epic",
    gradient: "bg-gradient-to-br from-slate-900 to-zinc-900",
    effect: "sc-glow-neon",
    text: "sc-neon-text",
    icon: "zap",
  },
  sc_sunset: {
    name: "선셋",
    rarity: "epic",
    gradient: "bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 sc-pan",
    icon: "flame",
  },
  sc_aurora: {
    name: "오로라",
    rarity: "legendary",
    gradient:
      "bg-gradient-to-r from-emerald-400 via-cyan-500 to-violet-600 sc-legendary",
    icon: "gem",
  },
  sc_prism: {
    name: "프리즘",
    rarity: "legendary",
    gradient:
      "bg-[linear-gradient(90deg,#f43f5e,#f59e0b,#eab308,#22c55e,#06b6d4,#6366f1,#a855f7,#f43f5e)] sc-legendary",
    icon: "crown",
  },
};

export const FRAMES: Record<string, FrameStyle> = {
  fr_gold: { name: "골드 테두리", rarity: "rare", className: "frame-gold" },
  fr_neon: { name: "네온 글로우", rarity: "epic", className: "frame-neon" },
  fr_rainbow: { name: "레인보우", rarity: "epic", className: "frame-rainbow", disc: true },
  fr_flame: { name: "플레임", rarity: "legendary", className: "frame-flame", disc: true },
  fr_holo: { name: "홀로그램", rarity: "legendary", className: "frame-holo", disc: true },
};

/** Catalog of unlockable perks. Codes that grant them live on the server. */
export const PERKS: Perk[] = [
  { id: ABILITY_ATTACK, type: "ability", name: "연습 결투 권한", rarity: "epic" },
  ...Object.entries(SC_STYLES)
    .filter(([id]) => id !== "base")
    .map(([id, s]): Perk => ({ id, type: "superchat", name: `${s.name} 슈퍼챗`, rarity: s.rarity })),
  ...Object.entries(FRAMES).map(
    ([id, f]): Perk => ({ id, type: "frame", name: f.name, rarity: f.rarity }),
  ),
];

export function perkById(id: string): Perk | undefined {
  return PERKS.find((p) => p.id === id);
}
