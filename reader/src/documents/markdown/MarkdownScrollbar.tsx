import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import {
  getMarkdownScrollbarMetrics,
  getScrollTopForThumb,
  type MarkdownScrollbarMetrics,
} from "./markdownScrollbarModel";

interface MarkdownScrollbarProps {
  containerRef: RefObject<HTMLDivElement | null>;
  sourceRef: RefObject<HTMLTextAreaElement | null>;
  mode: "wysiwyg" | "source";
  contentVersion: number;
}

interface DragState {
  pointerId: number;
  grabOffset: number;
}

const EMPTY_METRICS = getMarkdownScrollbarMetrics(0, 0, 0);

export function MarkdownScrollbar({
  containerRef,
  sourceRef,
  mode,
  contentVersion,
}: MarkdownScrollbarProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [metrics, setMetrics] = useState<MarkdownScrollbarMetrics>(EMPTY_METRICS);

  const getScrollTarget = useCallback(
    () => (mode === "source" ? sourceRef.current : containerRef.current),
    [containerRef, mode, sourceRef],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const target = getScrollTarget();
    if (!container || !target) return;

    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setMetrics(
          getMarkdownScrollbarMetrics(
            target.clientHeight,
            target.scrollHeight,
            target.scrollTop,
          ),
        );
      });
    };

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(container);
    resizeObserver.observe(target);
    const renderedArticle = container.querySelector(".milkdown-root");
    if (renderedArticle) resizeObserver.observe(renderedArticle);

    const mutationObserver = new MutationObserver(sync);
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    target.addEventListener("scroll", sync, { passive: true });
    target.addEventListener("input", sync);
    sync();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      target.removeEventListener("scroll", sync);
      target.removeEventListener("input", sync);
    };
  }, [containerRef, contentVersion, getScrollTarget]);

  const scrollFromPointer = useCallback(
    (clientY: number, grabOffset: number) => {
      const rail = railRef.current;
      const target = getScrollTarget();
      if (!rail || !target || metrics.thumbRange === 0) return;
      const pointerY = clientY - rail.getBoundingClientRect().top;
      target.scrollTop = getScrollTopForThumb(
        pointerY - grabOffset,
        metrics,
      );
    },
    [getScrollTarget, metrics],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || metrics.scrollRange === 0) return;
      event.preventDefault();
      event.stopPropagation();

      const rail = event.currentTarget;
      const pointerY = event.clientY - rail.getBoundingClientRect().top;
      const onThumb =
        pointerY >= metrics.thumbTop &&
        pointerY <= metrics.thumbTop + metrics.thumbHeight;
      const grabOffset = onThumb
        ? pointerY - metrics.thumbTop
        : metrics.thumbHeight / 2;

      dragRef.current = { pointerId: event.pointerId, grabOffset };
      rail.setPointerCapture(event.pointerId);
      scrollFromPointer(event.clientY, grabOffset);
    },
    [metrics, scrollFromPointer],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      scrollFromPointer(event.clientY, drag.grabOffset);
    },
    [scrollFromPointer],
  );

  const finishDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = getScrollTarget();
      if (!target) return;
      let next: number | null = null;
      if (event.key === "ArrowUp") next = target.scrollTop - 40;
      if (event.key === "ArrowDown") next = target.scrollTop + 40;
      if (event.key === "PageUp") next = target.scrollTop - target.clientHeight;
      if (event.key === "PageDown") next = target.scrollTop + target.clientHeight;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = metrics.scrollRange;
      if (next == null) return;
      event.preventDefault();
      target.scrollTop = next;
    },
    [getScrollTarget, metrics.scrollRange],
  );

  if (metrics.scrollRange === 0) return null;

  return (
    <div
      ref={railRef}
      className="md-scrollbar"
      role="scrollbar"
      aria-label="Markdown scroll position"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.round(metrics.scrollRange)}
      aria-valuenow={Math.round(
        (metrics.thumbTop / metrics.thumbRange) * metrics.scrollRange,
      )}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={onKeyDown}
    >
      <div
        className="md-scrollbar-thumb"
        style={{
          height: `${metrics.thumbHeight}px`,
          transform: `translateY(${metrics.thumbTop}px)`,
        }}
      />
    </div>
  );
}
