import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface FolderMenuItem { label: string; action: () => void }
export interface FolderMenuState {
  x: number;
  y: number;
  owner: HTMLElement;
  items: FolderMenuItem[];
}

export function FolderContextMenu({ state, close }: {
  state: FolderMenuState;
  close: (restoreFocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = ref.current!;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(state.x, innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(state.y, innerHeight - rect.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) close(false);
    };
    const dismiss = () => close(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [state, close]);

  return createPortal(
    <div className="folder-context-menu" ref={ref} role="menu" aria-label="文件夹操作"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          close(true);
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(ref.current!.querySelectorAll("button"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      {state.items.map((item) => (
        <button type="button" role="menuitem" key={item.label} onClick={() => {
          close(true);
          item.action();
        }}>{item.label}</button>
      ))}
    </div>, document.body,
  );
}
