import type { ViewMode } from "../state/types.js";

/**
 * ツールバー1本。モードは2つだけに限る（原則4・設計書 7.2）。
 * ここに機能を足したくなったら、まず設計書 2.2「対象外」を読むこと。
 */

interface Props {
  title: string;
  mode: ViewMode;
  onChangeMode: (mode: ViewMode) => void;
  onToggleExport: () => void;
  onNewMap: () => void;
  onToggleHelp: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  helpOpen: boolean;
  exportOpen: boolean;
  settingsOpen: boolean;
  sidebarOpen: boolean;
  canEdit: boolean;
}

export function Toolbar({
  title,
  mode,
  onChangeMode,
  onToggleExport,
  onNewMap,
  onToggleHelp,
  onToggleSidebar,
  onToggleSettings,
  helpOpen,
  exportOpen,
  settingsOpen,
  sidebarOpen,
  canEdit,
}: Props): React.JSX.Element {
  return (
    <header className="toolbar">
      <button
        type="button"
        className="toolbar-icon"
        aria-pressed={sidebarOpen}
        aria-label="サイドバーの開閉"
        title="Ctrl+B"
        onClick={onToggleSidebar}
      >
        ☰
      </button>
      <span className="brand">Mieru</span>
      <span className="toolbar-title">{title}</span>

      <div className="toolbar-actions">
        <div className="segmented" role="group" aria-label="表示の切り替え">
          <button
            type="button"
            aria-pressed={mode === "canvas"}
            onClick={() => onChangeMode("canvas")}
            disabled={!canEdit}
          >
            キャンバス
          </button>
          <button
            type="button"
            aria-pressed={mode === "outline"}
            onClick={() => onChangeMode("outline")}
            disabled={!canEdit}
          >
            アウトライン
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleExport}
          aria-pressed={exportOpen}
          disabled={!canEdit}
          title="Ctrl+Shift+C ですぐコピーもできます"
        >
          テキスト出力
        </button>
        <button type="button" onClick={onNewMap}>
          新規作成
        </button>
        <button type="button" onClick={onToggleHelp} aria-pressed={helpOpen} title="?">
          キー操作
        </button>
        <button
          type="button"
          className="toolbar-icon"
          onClick={onToggleSettings}
          aria-pressed={settingsOpen}
          aria-label="設定"
          title="設定"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
