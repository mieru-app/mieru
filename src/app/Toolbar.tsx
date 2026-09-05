import { useLanguage } from "../state/i18n.js";
import type { ViewMode } from "../state/types.js";
import type { Strings } from "../state/strings/ja.js";
import { VIEW_MODES } from "../state/view-mode.js";
import { Wordmark } from "./Wordmark.js";

/**
 * ツールバー1本。ここに機能を足したくなったら、まず設計書 2.2「対象外」を読むこと。
 *
 * **表示は3つある**（設計書 F-25、2.8-1）。並び順と字は `state/view-mode.ts` が持ち、
 * `Ctrl+E` の巡回も同じ配列から出す。ここで手書きすると、押しボタンには
 * 出ているのにキーでは辿り着けない表示が生まれる。
 *
 * **狭い画面では8個が入らない**（2.7-1）。残すのは
 * ☰・ロゴ・表示切替・⚙ の4つで、外した3つは行き先がある。
 *
 * | 外すもの | 行き先 |
 * |---|---|
 * | 出力 | 設定シート（`Ctrl+Shift+C` は狭い画面では押せない） |
 * | 新規作成 | サイドバーとホーム画面に元からある |
 * | ヘルプ | 出さない。物理キーボードが無ければキーの一覧は要らない |
 *
 * **履歴はツールバーから外した**（2.12）。設定シートが唯一の行き先である。
 * 押す頻度が低く、常時1枠を占めるだけの価値が無かった。
 *
 * マップ名も外す。切り替えの左右に挟まれて、数文字で切れて意味をなさない。
 */

/** 狭い画面用の短い字。`viewMode` の鍵は平らなので、ここで対応づける */
const SHORT: Record<ViewMode, (s: Strings) => string> = {
  canvas: (s) => s.viewMode.canvasShort,
  outline: (s) => s.viewMode.outlineShort,
  source: (s) => s.viewMode.sourceShort,
};

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
  const s = useLanguage((state) => state.s);
  return (
    <header className="toolbar">
      <button
        type="button"
        className="toolbar-icon"
        aria-pressed={sidebarOpen}
        aria-label={s.toolbar.sidebar}
        title="Ctrl+B"
        onClick={onToggleSidebar}
      >
        ☰
      </button>
      {/* ロゴがホームへの帰り道を兼ねる。置き場所を増やさずに導線を作る */}
      <button
        type="button"
        className="toolbar-home"
        aria-label={s.toolbar.home}
        title={s.toolbar.home}
        onClick={onHome}
      >
        <Wordmark label="" />
      </button>
      {!narrow && <span className="toolbar-title">{title}</span>}

      <div className="toolbar-actions">
        <div className="segmented" role="group" aria-label={s.toolbar.viewSwitch}>
          {VIEW_MODES.map((each) => (
            <button
              key={each}
              type="button"
              aria-pressed={mode === each}
              // 狭い画面では字を縮めるが、名前は読み上げに残す（`view-mode.ts`）
              aria-label={s.viewMode[each]}
              title={s.viewMode[each]}
              onClick={() => onChangeMode(each)}
              disabled={!canEdit}
            >
              {narrow ? SHORT[each](s) : s.viewMode[each]}
            </button>
          ))}
        </div>

        {!narrow && (
          <>
            <button
              type="button"
              onClick={onToggleExport}
              aria-pressed={exportOpen}
              disabled={!canEdit}
              title={s.toolbar.exportHint}
            >
              {s.toolbar.export}
            </button>
            <button type="button" onClick={onNewMap}>
              {s.toolbar.newMap}
            </button>
            <button type="button" onClick={onToggleHelp} aria-pressed={helpOpen} title="?">
              {s.toolbar.shortcuts}
            </button>
          </>
        )}
        <button
          type="button"
          className="toolbar-icon toolbar-settings"
          onClick={onToggleSettings}
          aria-pressed={settingsOpen}
          aria-label={s.toolbar.settings}
          title={s.toolbar.settings}
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
