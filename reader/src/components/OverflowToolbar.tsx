import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { UiIcon } from "./UiIcon";

export interface ToolbarGroup {
  key: string;
  node: ReactNode;
  /** A flexible group (a spacer, or a field that shrinks) counts this width. */
  minWidth?: number;
  /** Never moved into the overflow menu. */
  pinned?: boolean;
  /** Grows to fill free space. */
  flexible?: boolean;
  /** Extra class for the group's slot, e.g. a field that may shrink. */
  slotClassName?: string;
}

const MORE_WIDTH = 36;
const GAP = 2;

/**
 * Decide which groups fit. Groups are hidden in `hideOrder` until the rest,
 * plus the "more" button, fit in `available` pixels.
 */
export function chooseHiddenGroups(
  groups: { key: string; width: number; pinned?: boolean }[],
  hideOrder: string[],
  available: number,
): Set<string> {
  const hidden = new Set<string>();
  const used = () => groups.reduce((sum, group) => hidden.has(group.key) ? sum : sum + group.width + GAP, 0)
    + (hidden.size > 0 ? MORE_WIDTH + GAP : 0);
  for (const key of hideOrder) {
    if (used() <= available) break;
    const group = groups.find((candidate) => candidate.key === key);
    if (group && !group.pinned) hidden.add(key);
  }
  return hidden;
}

/**
 * One toolbar row that never scrolls: groups that do not fit move, in
 * `hideOrder`, into a "more" menu at the position of the first hidden group.
 */
export function OverflowToolbar({ className, groups, hideOrder }: {
  className: string;
  groups: ToolbarGroup[];
  hideOrder: string[];
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const widthsRef = useRef<Record<string, number>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [rowWidth, setRowWidth] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelAt, setPanelAt] = useState<{ right: number; top: number } | null>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(() => setRowWidth(row.clientWidth));
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  // Measure visible groups, then hide the fewest groups that make the row fit.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    for (const element of Array.from(row.querySelectorAll<HTMLElement>(":scope > [data-group]"))) {
      const key = element.dataset.group!;
      const group = groups.find((candidate) => candidate.key === key);
      widthsRef.current[key] = group?.minWidth ?? element.getBoundingClientRect().width;
    }
    const style = getComputedStyle(row);
    const available = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const next = chooseHiddenGroups(groups.map((group) => ({
      key: group.key, pinned: group.pinned, width: widthsRef.current[group.key] ?? group.minWidth ?? 0,
    })), hideOrder, available);
    const same = next.size === hidden.size && [...next].every((key) => hidden.has(key));
    if (!same) setHidden(next);
  });

  useEffect(() => { if (hidden.size === 0) setMenuOpen(false); }, [hidden]);

  useEffect(() => {
    if (!menuOpen) { setPanelAt(null); return; }
    const button = moreRef.current!.getBoundingClientRect();
    setPanelAt({ right: Math.max(8, innerWidth - button.right), top: button.bottom + 6 });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !moreRef.current?.contains(target)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    const dismiss = () => setMenuOpen(false);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [menuOpen, rowWidth]);

  const firstHidden = groups.findIndex((group) => hidden.has(group.key));
  const more = (
    <button key="toolbar-more" ref={moreRef} type="button" className="toolbar-more"
      title="更多工具" aria-label="更多工具" aria-haspopup="true" aria-expanded={menuOpen}
      onMouseDown={(event) => event.preventDefault()} onClick={() => setMenuOpen((open) => !open)}>
      <UiIcon name="more" />
    </button>
  );

  return (
    <div className={className} ref={rowRef}>
      {groups.map((group, index) => [
        index === firstHidden ? more : null,
        hidden.has(group.key) ? null : (
          <div key={group.key} data-group={group.key}
            className={"toolbar-slot" + (group.flexible ? " toolbar-slot-flexible" : "")
              + (group.slotClassName ? " " + group.slotClassName : "")}>
            {group.node}
          </div>
        ),
      ])}
      {menuOpen && panelAt && createPortal(
        <div className="toolbar-overflow-panel" ref={panelRef} role="group" aria-label="更多工具"
          style={{ right: panelAt.right, top: panelAt.top }}>
          {groups.filter((group) => hidden.has(group.key)).map((group) => (
            <div key={group.key} className="toolbar-overflow-group">{group.node}</div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
