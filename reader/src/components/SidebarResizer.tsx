import { useEffect, useRef } from "react";

export const SIDEBAR_MIN_WIDTH = 168;
export const SIDEBAR_MAX_WIDTH = 560;
// After reaching the minimum, drag another 70% of it left before collapsing.
export const SIDEBAR_COLLAPSE_WIDTH = SIDEBAR_MIN_WIDTH * (1 - 0.7);

interface SidebarResizerProps {
  kind: "md" | "pdf";
  label: string;
  width: number;
  preferredWidth?: number;
  maxWidth?: number;
  onWidthChange: (width: number) => void;
  onCollapse: (restoreWidth: number) => void;
}

/** Both viewers use the same drag threshold and pointer cleanup. */
export function SidebarResizer({ kind, label, width, preferredWidth = width,
  maxWidth = SIDEBAR_MAX_WIDTH, onWidthChange, onCollapse }: SidebarResizerProps) {
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number; restoreWidth: number } | null>(null);
  const bodyClass = `${kind}-sidebar-resizing`;
  const stopDragging = () => {
    dragRef.current = null;
    document.body.classList.remove(bodyClass);
  };
  useEffect(() => () => document.body.classList.remove(bodyClass), [bodyClass]);
  const resize = (next: number) => onWidthChange(Math.max(SIDEBAR_MIN_WIDTH, Math.min(maxWidth, Math.round(next))));

  return (
    <div className={`${kind}-sidebar-resizer`} role="separator" aria-label={label}
      aria-orientation="vertical" aria-valuemin={SIDEBAR_MIN_WIDTH} aria-valuemax={maxWidth}
      aria-valuenow={width} tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0 || dragRef.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX,
          startWidth: width, restoreWidth: preferredWidth };
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.classList.add(bodyClass);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const targetWidth = drag.startWidth + event.clientX - drag.startX;
        if (targetWidth <= SIDEBAR_COLLAPSE_WIDTH) {
          stopDragging();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          onCollapse(drag.restoreWidth);
          return;
        }
        resize(targetWidth);
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        stopDragging();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={stopDragging}
      onLostPointerCapture={stopDragging}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        resize(event.key === "Home" ? SIDEBAR_MIN_WIDTH : event.key === "End" ? maxWidth
          : width + (event.key === "ArrowRight" ? 16 : -16));
      }} />
  );
}
