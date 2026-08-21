export interface MarkdownScrollbarMetrics {
  trackHeight: number;
  thumbHeight: number;
  thumbTop: number;
  thumbRange: number;
  scrollRange: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getMarkdownScrollbarMetrics(
  clientHeight: number,
  scrollHeight: number,
  scrollTop: number,
  minThumbHeight = 28,
): MarkdownScrollbarMetrics {
  const trackHeight = Math.max(0, clientHeight);
  const scrollRange = Math.max(0, scrollHeight - clientHeight);
  if (trackHeight === 0 || scrollRange === 0) {
    return {
      trackHeight,
      thumbHeight: trackHeight,
      thumbTop: 0,
      thumbRange: 0,
      scrollRange,
    };
  }

  const proportionalHeight = (clientHeight / scrollHeight) * trackHeight;
  const thumbHeight = Math.min(
    trackHeight,
    Math.max(Math.min(minThumbHeight, trackHeight), proportionalHeight),
  );
  const thumbRange = Math.max(0, trackHeight - thumbHeight);
  const thumbTop =
    thumbRange === 0
      ? 0
      : (clamp(scrollTop, 0, scrollRange) / scrollRange) * thumbRange;

  return { trackHeight, thumbHeight, thumbTop, thumbRange, scrollRange };
}

export function getScrollTopForThumb(
  thumbTop: number,
  metrics: MarkdownScrollbarMetrics,
): number {
  if (metrics.thumbRange === 0 || metrics.scrollRange === 0) return 0;
  return (
    (clamp(thumbTop, 0, metrics.thumbRange) / metrics.thumbRange) *
    metrics.scrollRange
  );
}
