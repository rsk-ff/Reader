import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { UiIcon } from "../components/UiIcon";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Muted text after the label. */
  hint?: string;
}

interface PrintSelectProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

/**
 * A select drawn like the app's other controls: an outlined button and a
 * menu-styled list. Keyboard works like a native select: arrows change the
 * value on the closed button; Enter/Space/Alt+Down open the list, where
 * arrows move, Enter picks and Esc closes without closing the dialog.
 */
export function PrintSelect<T extends string | number>({ label, value, options, disabled, onChange }: PrintSelectProps<T>) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const wanted = Math.min(options.length * 32 + 10, 320);
    const flip = below < Math.min(wanted, 160) && above > below;
    const maxHeight = Math.min(wanted, flip ? above : below);
    setPosition({ left: rect.left, top: flip ? rect.top - 4 - maxHeight : rect.bottom + 4, width: rect.width, maxHeight });
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const openList = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };
  const pick = (index: number) => {
    const option = options[index];
    setOpen(false);
    buttonRef.current?.focus();
    if (option && option.value !== value) onChange(option.value);
  };
  const move = (from: number, step: number) => Math.max(0, Math.min(options.length - 1, from + step));

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
    if (!open) {
      if ((event.key === "ArrowDown" && event.altKey) || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openList();
      } else if (event.key in steps || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : move(selectedIndex, steps[event.key]);
        if (next !== selectedIndex) onChange(options[next].value);
      }
      return;
    }
    if (event.key === "Escape") {
      // Close the list only; the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(activeIndex);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key in steps) {
      event.preventDefault();
      setActiveIndex(move(activeIndex, steps[event.key]));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
    }
  };

  return (
    <div className="print-field">
      <span className="print-label" id={`${id}-label`}>{label}</span>
      <button ref={buttonRef} type="button" className="print-select" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-value`}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown}>
        <span className="print-select-value" id={`${id}-value`}>
          {selected?.label ?? ""}
          {selected?.hint && <span className="print-select-hint">{selected.hint}</span>}
        </span>
        <UiIcon name="chevronDown" />
      </button>
      {open && position && (
        <div ref={listRef} id={`${id}-list`} className="print-select-list" role="listbox" aria-labelledby={`${id}-label`}
          style={{ left: position.left, top: position.top, minWidth: position.width, maxHeight: position.maxHeight }}>
          {options.map((option, index) => (
            <div key={String(option.value)} id={`${id}-option-${index}`} data-index={index} role="option"
              aria-selected={index === selectedIndex}
              className={`print-select-option${index === activeIndex ? " active" : ""}`}
              onPointerEnter={() => setActiveIndex(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => pick(index)}>
              <span className="print-select-check">{index === selectedIndex && <UiIcon name="check" />}</span>
              <span className="print-select-option-label">{option.label}</span>
              {option.hint && <span className="print-select-hint">{option.hint}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
