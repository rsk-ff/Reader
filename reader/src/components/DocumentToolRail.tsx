import type { ReactNode } from "react";
import { UiIcon, type UiIconName } from "./UiIcon";

export function DocumentToolRail({ label, children }: { label: string; children: ReactNode }) {
  return <aside className="document-tool-rail" role="toolbar" aria-label={label}
    aria-orientation="vertical">{children}</aside>;
}

export function RailButton({ icon, iconUrl, title, active, disabled, onClick }: {
  icon?: UiIconName;
  iconUrl?: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return <button type="button" className="rail-button" title={title} aria-label={title}
    aria-pressed={active} disabled={disabled} onClick={onClick}
    onMouseDown={(event) => event.preventDefault()}>
    {iconUrl ? <span className="markdown-tool-icon" style={{ maskImage: `url("${iconUrl}")` }} aria-hidden="true" /> : icon ? <UiIcon name={icon} /> : null}
  </button>;
}
