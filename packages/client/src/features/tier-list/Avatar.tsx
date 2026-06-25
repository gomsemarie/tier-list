import { FRAMES } from "@tier-list/shared";
import { cn } from "@/lib/utils";

function hueColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${((hash % 360) + 360) % 360},40%,46%)`;
}

type AvatarProps = {
  name: string;
  src?: string | null;
  /** Equipped frame perk id (e.g. "fr_holo") → applies its ring/border. */
  frame?: string;
  size?: number;
  className?: string;
};

/** Square avatar: image or hue-initials. Optional equipped frame ring. */
export function Avatar({ name, src, frame, size = 32, className }: AvatarProps) {
  const frameClass = frame ? FRAMES[frame]?.className : undefined;
  const inner = Math.round(size * 0.86);
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-[3px]", frameClass, className)}
      style={{ width: size, height: size }}
    >
      <span
        className="grid place-items-center overflow-hidden rounded-[2px]"
        style={{ width: frameClass ? inner : size, height: frameClass ? inner : size }}
      >
        {src ? (
          <img src={src} alt={name} className="size-full object-cover" draggable={false} />
        ) : (
          <span
            className="grid size-full place-items-center font-extrabold text-white"
            style={{ background: hueColor(name), fontSize: Math.max(9, size * 0.42) }}
          >
            {name.trim().slice(0, 2) || "?"}
          </span>
        )}
      </span>
    </span>
  );
}
