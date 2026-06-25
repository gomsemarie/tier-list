import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

type BanWarningFrameProps = {
  mutedUntil?: number;
  placeBannedUntil?: number;
  voteBannedUntil?: number;
};

function leftLabel(until: number, now: number): string {
  const s = Math.max(0, Math.ceil((until - now) / 1000));
  if (s >= 60) return `약 ${Math.floor(s / 60)}분 ${s % 60}초 남음`;
  return `약 ${s}초 남음`;
}

/** Self-only ban warning: a pulsing red screen frame + a banner per active ban
 *  (chat / placement / vote) with the remaining time. */
export function BanWarningFrame({
  mutedUntil,
  placeBannedUntil,
  voteBannedUntil,
}: BanWarningFrameProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const bans = [
    { label: "채팅이 금지되었습니다", until: mutedUntil },
    { label: "배치가 금지되었습니다", until: placeBannedUntil },
    { label: "투표가 금지되었습니다", until: voteBannedUntil },
  ].filter((b): b is { label: string; until: number } => !!b.until && b.until > now);

  if (bans.length === 0) return null;

  return (
    <>
      {/* Pulsing red screen frame */}
      <div className="ban-warning pointer-events-none fixed inset-0 z-[55]" />
      {/* Banners */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[56] flex flex-col items-center gap-2 px-4">
        {bans.map((b) => (
          <div
            key={b.label}
            className="flex items-center gap-2.5 rounded-[3px] border-2 px-[13px] py-2.5"
            style={{
              background: "rgba(239,68,68,.14)",
              borderColor: "rgba(239,68,68,.5)",
            }}
          >
            <TriangleAlert className="size-[18px] shrink-0" style={{ color: "#F87171" }} />
            <div>
              <div className="text-[13px] font-extrabold" style={{ color: "#FCA5A5" }}>
                {b.label}
              </div>
              <div className="text-[11px]" style={{ color: "#E8A0A0" }}>
                {leftLabel(b.until, now)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
