import { useEffect, useRef, useState } from "react";
import { ZoomIn } from "lucide-react";

const FRAME_H = 200; // preview frame height (px)
const WIN = 150; // centered square crop window (px)
const OUT = 256; // exported avatar size (px)

type CropPanelProps = {
  /** Image source (data URL from a local upload). */
  src: string;
  onCancel: () => void;
  onCropped: (dataUrl: string) => void;
};

/** Crop an uploaded image to a 1:1 avatar — drag to pan, slider to zoom. */
export function CropPanel({ src, onCancel, onCropped }: CropPanelProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [frameW, setFrameW] = useState(0);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const winLeft = (frameW - WIN) / 2;
  const winTop = (FRAME_H - WIN) / 2;
  const baseScale = nat.w && nat.h ? Math.max(WIN / nat.w, WIN / nat.h) : 1;
  const effScale = baseScale * zoom;
  const dispW = nat.w * effScale;
  const dispH = nat.h * effScale;

  function clamp(x: number, y: number) {
    return {
      x: Math.min(winLeft, Math.max(winLeft + WIN - dispW, x)),
      y: Math.min(winTop, Math.max(winTop + WIN - dispH, y)),
    };
  }

  useEffect(() => {
    setFrameW(frameRef.current?.clientWidth ?? 0);
  }, []);

  // Center the image on the crop window when it loads / zoom / frame changes.
  useEffect(() => {
    if (!nat.w || !frameW) return;
    setOffset(clamp((frameW - dispW) / 2, (FRAME_H - dispH) / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nat.w, nat.h, zoom, frameW]);

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
    const sSize = WIN / effScale;
    const sx = (winLeft - offset.x) / effScale;
    const sy = (winTop - offset.y) / effScale;
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    onCropped(canvas.toDataURL("image/jpeg", 0.82));
  }

  return (
    <>
      <div onClick={onCancel} className="fixed inset-0 z-[70] bg-black/60" />
      <div
        className="fixed top-1/2 left-1/2 z-[71] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-[#242a3a] bg-[#13161D] p-5"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,.6)", animation: "popIn .16s ease both" }}
      >
        <div className="mb-3.5 text-[16px] font-extrabold text-[#EDEAE2]">이미지 자르기</div>

        <div
          ref={frameRef}
          className="relative mb-4 touch-none overflow-hidden rounded-[8px] bg-black"
          style={{ height: FRAME_H }}
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
          <div
            className="pointer-events-none absolute rounded-[4px]"
            style={{
              left: winLeft,
              top: winTop,
              width: WIN,
              height: WIN,
              outline: "2px solid #6366F1",
              boxShadow: "0 0 0 9999px rgba(0,0,0,.55)",
            }}
          >
            <span className="absolute -top-px -left-px size-3 border-t-2 border-l-2 border-white" />
            <span className="absolute -right-px -bottom-px size-3 border-r-2 border-b-2 border-white" />
          </div>
        </div>

        <label className="mb-1.5 block text-[11px] font-semibold text-[#8A8F9C]">확대 / 축소</label>
        <div className="mb-[18px] flex items-center gap-3">
          <ZoomIn className="size-4 shrink-0 text-[#8A8F9C]" />
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

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-[38px] flex-1 rounded-[6px] border border-[#2A303C] bg-[#171B22] text-[13px] font-semibold text-[#C4C8D2]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!nat.w}
            className="h-[38px] flex-[2] rounded-[6px] bg-[#6366F1] text-[13px] font-bold text-white disabled:opacity-50"
          >
            적용
          </button>
        </div>
      </div>
    </>
  );
}
