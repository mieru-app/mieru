import type { ViewMode } from "../state/types.js";
import { Wordmark } from "./Wordmark.js";

/**
 * ツールバー1本。モードは2つだけに限る（原則4・設計書 7.2）。
 * ここに機能を足したくなったら、まず設計書 2.2「対象外」を読むこと。
 *
 * **狭い画面では8個が入らない**（2.7-1）。残すのは
 * ☰・ロゴ・表示切替・⚙ の4つで、外した3つは行き先がある。
 *
 * | 外すもの | 行き先 |
 * |---|---|
 * | テキスト出力 | 設定シート（`Ctrl+Shift+C` は狭い画面では押せない） |
 * | 新規作成 | サイドバーとホーム画面に元からある |
 * | キー操作 | 設定シート。物理キーボードが無ければそもそも要らない |
 *
 * マップ名も外す。切り替えの左右に挟まれて、数文字で切れて意味をなさない。
 */

interface Props {
  title: string;
  /** ロゴを押したときの行き先。開いているマップを閉じてホームへ戻す */
  onHome: () => void;
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
  /** 1ペインしか置けない画面か。測るのは `useNarrow` */
  narrow: boolean;
}

export function Toolbar({
  title,
  onHome,
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
  narrow,
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
      {/* ロゴがホームへの帰り道を兼ねる。置き場所を増やさずに導線を作る */}
      <button
        type="button"
        className="toolbar-home"
        aria-label="ホームへ戻る"
        title="ホームへ戻る"
        onClick={onHome}
      >
        <Wordmark label="" />
      </button>
      {!narrow && <span className="toolbar-title">{title}</span>}

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

        {!narrow && (
          <>
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
          </>
        )}
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
