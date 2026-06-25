import { useEffect, useRef, useState } from "react";
import { ZoomIn } from "lucide-react";

const BOX = 260; // on-screen crop square
const OUT = 256; // exported avatar size (px)

type CropPanelProps = {
  /** Image source (object URL or data URL). */
  src: string;
  onCancel: () => void;
  onCropped: (dataUrl: string) => void;
};

/**
 * In-dialog crop view (rendered inside the multiplayer dialog, not a nested
 * modal). Drag to pan, slider to zoom; exports a 1:1 avatar.
 */
export function CropPanel({ src, onCancel, onCropped }: CropPanelProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(
    null,
  );

  const baseScale = nat.w && nat.h ? Math.max(BOX / nat.w, BOX / nat.h) : 1;
  const effScale = baseScale * zoom;
  const dispW = nat.w * effScale;
  const dispH = nat.h * effScale;

  function clamp(x: number, y: number) {
    return {
      x: Math.min(0, Math.max(BOX - dispW, x)),
      y: Math.min(0, Math.max(BOX - dispH, y)),
    };
  }

  // Center the image when it loads or zoom changes.
  useEffect(() => {
    if (!nat.w) return;
    setOffset(clamp((BOX - dispW) / 2, (BOX - dispH) / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nat.w, nat.h, zoom]);

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const el = e.currentTarget;
    setNat({ w: el.naturalWidth, h: el.naturalHeight });
    setZoom(1);
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const d = drag.current;
    setOffset(clamp(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py)));
  }
  function onPointerUp() {
    drag.current = null;
  }

  function apply() {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sSize = BOX / effScale;
    const sx = -offset.x / effScale;
    const sy = -offset.y / effScale;
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    onCropped(canvas.toDataURL("image/jpeg", 0.82));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative touch-none overflow-hidden bg-muted"
          style={{ width: BOX, height: BOX }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            onLoad={onImgLoad}
            draggable={false}
            className="absolute top-0 left-0 max-w-none cursor-grab select-none active:cursor-grabbing"
            style={{
              width: dispW || "auto",
              height: dispH || "auto",
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-[4px]" style={{ outline: "2px solid #6366F1", outlineOffset: -2 }}>
            <span className="absolute top-0 left-0 size-3 border-t-2 border-l-2 border-white" />
            <span className="absolute right-0 bottom-0 size-3 border-r-2 border-b-2 border-white" />
          </div>
        </div>

        <div className="flex w-full items-center gap-3">
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: "#6366F1" }}
            aria-label="확대/축소"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-[38px] flex-1 rounded-md border text-[13px] font-semibold text-[#C4C8D2]"
          style={{ background: "#171B22", borderColor: "#2A303C" }}
        >
          취소
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!nat.w}
          className="h-10 flex-[2] rounded-md text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: "#6366F1" }}
        >
          적용
        </button>
      </div>
    </div>
  );
}
