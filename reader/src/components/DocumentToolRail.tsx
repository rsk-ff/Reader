import type { ReactNode } from "react";

export function DocumentToolRail({ label, children }: { label: string; children: ReactNode }) {
  return <aside className="document-tool-rail" role="toolbar" aria-label={label}
    aria-orientation="vertical">{children}</aside>;
}

export function RailButton({ iconUrl, title, active, disabled, onClick }: {
  iconUrl: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return <button type="button" className="rail-button" title={title} aria-label={title}
    aria-pressed={active} disabled={disabled} onClick={onClick}
    onMouseDown={(event) => event.preventDefault()}>
    <span className="document-tool-icon" style={{ maskImage: `url("${iconUrl}")` }} aria-hidden="true" />
  </button>;
}
