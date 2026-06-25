import { FRAMES } from "@tier-list/shared";

import { cn } from "@/lib/utils";

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 45%, 50%)`;
}

function initial(name: string): string {
  const chars = Array.from(name.trim());
  return chars[0]?.toUpperCase() ?? "?";
}

type AvatarProps = {
  name: string;
  src?: string | null;
  size?: number;
  /** Equipped frame perk id (decorates the avatar). */
  frame?: string;
  className?: string;
};

/** Circular avatar: image or colored initial, optionally with a frame decoration. */
export function Avatar({ name, src, size = 32, frame, className }: AvatarProps) {
  const frameDef = frame ? FRAMES[frame] : undefined;
  const useDisc = frameDef?.disc;

  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{ width: size, height: size }}
    >
      {useDisc && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-[2.5px] rounded-full",
            frameDef.className,
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-grid size-full place-items-center overflow-hidden rounded-full font-semibold text-white select-none",
          frameDef && !useDisc && frameDef.className,
        )}
        style={{
          fontSize: Math.round(size * 0.42),
          backgroundColor: src ? "transparent" : colorFor(name),
        }}
      >
        {src ? (
          <img
            src={src}
            alt={name}
            draggable={false}
            className="size-full object-cover"
          />
        ) : (
          initial(name)
        )}
      </span>
    </span>
  );
}
