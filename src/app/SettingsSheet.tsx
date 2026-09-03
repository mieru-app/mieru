import { useState } from "react";

import { GITHUB_DISCONNECT_NOTE } from "../state/github-guide.js";
import type { Theme } from "../state/theme.js";
import { THEME_LABELS } from "../state/theme.js";
import type { BackendState, GitHubConnectResult } from "../state/workspace.js";
import { GitHubConnect } from "./GitHubConnect.js";

/**
 * 設定（2-12 / 2.6-4）。
 *
 * 置くのは「一度決めたら滅多に変えない」ものだけにしてある。
 * 設定項目を増やすほど、既定値のまま使えるという性質が失われる（原則4）。
 */

interface Props {
  backend: Extract<BackendState, { kind: "ready" }>;
  /** 接続済みの GitHub の表示名。未接続なら null */
  github: string | null;
  localAvailable: boolean;
  theme: Theme;
  onChangeTheme: (theme: Theme) => void;
  onChooseFolder: () => void;
  onUseLocalFolder: () => void;
  onUseGitHub: () => void;
  onDisconnectGitHub: () => void;
  onConnect: (
    input: { token: string; repo: string; branch: string; directory: string },
    remember: boolean,
  ) => Promise<GitHubConnectResult>;
  onShowShortcuts: () => void;
  /**
   * テキスト出力を開く。狭い画面ではツールバーから外れるため、
   * ここが唯一の行き先になる（`Toolbar.tsx`）
   */
  onShowExport: () => void;
  /** マップを開いていなければ出力するものが無い */
  canExport: boolean;
  onClose: () => void;
}

export function SettingsSheet({
  backend,
  github,
  localAvailable,
  theme,
  onChangeTheme,
  onChooseFolder,
  onUseLocalFolder,
  onUseGitHub,
  onDisconnectGitHub,
  onConnect,
  onShowShortcuts,
  onShowExport,
  canExport,
  onClose,
}: Props): React.JSX.Element {
  const [connecting, setConnecting] = useState(false);
  const usingGitHub = backend.backend === "github";

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
        <p className="settings-value">
          {usingGitHub ? "GitHub" : "フォルダ"} — {backend.label}
        </p>

        {usingGitHub ? (
          <>
            <button type="button" onClick={() => setConnecting(true)}>
              接続先を変更…
            </button>
            {localAvailable && (
              <button type="button" onClick={onUseLocalFolder}>
                このパソコンのフォルダに戻す
              </button>
            )}
            <button type="button" onClick={onDisconnectGitHub}>
              接続を解除する
            </button>
            <p className="sheet-note">{GITHUB_DISCONNECT_NOTE}</p>
          </>
        ) : (
          <>
            <button type="button" onClick={onChooseFolder}>
              フォルダを変更…
            </button>
            {github === null ? (
              <button type="button" onClick={() => setConnecting(true)}>
                GitHub に接続する…
              </button>
            ) : (
              <button type="button" onClick={onUseGitHub}>
                GitHub に切り替える（{github}）
              </button>
            )}
            <p className="sheet-note">
              このフォルダ直下の <code>.md</code> がマップです。Obsidian や VS Code
              でも同じファイルを開けます。
            </p>
          </>
        )}

        {connecting && (
          <GitHubConnect
            onConnect={async (input, remember) => {
              const result = await onConnect(input, remember);
              if (result.ok) setConnecting(false);
              return result;
            }}
            onCancel={() => setConnecting(false)}
          />
        )}

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

        <p className="sheet-group">テキスト出力</p>
        <button type="button" onClick={onShowExport} disabled={!canExport}>
          出力を開く（Ctrl+Shift+C）
        </button>

        <p className="sheet-group">キー操作</p>
        <button type="button" onClick={onShowShortcuts}>
          一覧を開く（?）
        </button>
      </div>
    </aside>
  );
}
