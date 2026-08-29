export function NewTabPage() {
  return (
    <div className="new-tab-page">
      <div className="new-tab-card">
        <div className="new-tab-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 6v12M6 12h12" />
          </svg>
        </div>
        <h2>新标签页</h2>
        <p>
          将 <code>PDF</code> 或 <code>Markdown</code> 文件拖放到此窗口，或从文件管理器中打开。
        </p>
      </div>
    </div>
  );
}
