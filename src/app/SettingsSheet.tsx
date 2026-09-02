import type { Theme } from "../state/theme.js";
import { THEME_LABELS } from "../state/theme.js";

/**
 * 設定（2-12）。
 *
 * 置くのは「一度決めたら滅多に変えない3つ」だけにしてある。
 * 設定項目を増やすほど、既定値のまま使えるという性質が失われる（原則4）。
 */

interface Props {
  folderName: string;
  theme: Theme;
  onChangeTheme: (theme: Theme) => void;
  onChooseFolder: () => void;
  onShowShortcuts: () => void;
  onClose: () => void;
}

export function SettingsSheet({
  folderName,
  theme,
  onChangeTheme,
  onChooseFolder,
  onShowShortcuts,
  onClose,
}: Props): React.JSX.Element {
  return (
    <aside className="sheet" aria-label="設定">
      <div className="sheet-head">
        <strong>設定</strong>
        <button type="button" aria-label="閉じる" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="sheet-body">
        <p className="sheet-group">保存先</p>
        <p className="settings-value">{folderName}</p>
        <button type="button" onClick={onChooseFolder}>
          フォルダを変更…
        </button>
        <p className="sheet-note">
          このフォルダ直下の <code>.md</code> がマップです。Obsidian や VS Code
          でも同じファイルを開けます。
        </p>

        <p className="sheet-group">配色</p>
        <div className="segmented" role="group" aria-label="配色">
          {THEME_LABELS.map((choice) => (
            <button
              type="button"
              key={choice.theme}
              aria-pressed={theme === choice.theme}
              onClick={() => onChangeTheme(choice.theme)}
            >
              {choice.label}
            </button>
          ))}
        </div>

        <p className="sheet-group">キー操作</p>
        <button type="button" onClick={onShowShortcuts}>
          一覧を開く（?）
        </button>
      </div>
    </aside>
  );
}
