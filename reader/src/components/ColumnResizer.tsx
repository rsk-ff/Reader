import { useRef } from "react";

/** Drag handle on the right edge of a list header cell. */
export function ColumnResizer({ label, width, min = 60, max = 900, onWidthChange }: {
  label: string;
  width: number;
  min?: number;
  max?: number;
  onWidthChange: (width: number) => void;
}) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const clamp = (value: number) => Math.max(min, Math.min(max, Math.round(value)));
  const stop = () => {
    drag.current = null;
    document.body.classList.remove("column-resizing");
  };
  return <span className="column-resizer" role="separator" aria-label={label} aria-orientation="vertical"
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={width} tabIndex={0}
    onClick={(event) => event.stopPropagation()}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add("column-resizing");
    }}
    onPointerMove={(event) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      onWidthChange(clamp(current.startWidth + event.clientX - current.startX));
    }}
    onPointerUp={stop}
    onPointerCancel={stop}
    onLostPointerCapture={stop}
    onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      onWidthChange(clamp(width + (event.key === "ArrowRight" ? 16 : -16)));
    }} />;
}
