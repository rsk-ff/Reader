export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <h2>No document open</h2>
        <p>
          Double-click a <code>.pdf</code> or <code>.md</code> file in your file
          manager, or drop one onto this window.
        </p>
        <p className="empty-sub">
          No homepage. No file picker. This is the reader, not a launcher.
        </p>
      </div>
    </div>
  );
}
