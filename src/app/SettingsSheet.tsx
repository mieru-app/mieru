import { useState } from "react";

import { GITHUB_DISCONNECT_NOTE } from "../state/github-guide.js";
import { LANGUAGE_LABELS, useLanguage } from "../state/i18n.js";
import type { Language } from "../state/i18n.js";
import type { Strings } from "../state/strings/ja.js";
import type { Theme } from "../state/theme.js";
import { THEMES } from "../state/theme.js";
import type { BackendState, GitHubConnectResult } from "../state/workspace.js";
import { GitHubConnect } from "./GitHubConnect.js";

/**
 * 設定（2-12 / 2.6-4）。
 *
 * 置くのは「一度決めたら滅多に変えない」ものだけにしてある。
 * 設定項目を増やすほど、既定値のまま使えるという性質が失われる（原則4）。
 */

/** 配色の字。順序は `theme.ts`、言葉は文言表が持つ */
const THEME_LABEL: Record<Theme, (s: Strings) => string> = {
  system: (s) => s.settings.themeSystem,
  light: (s) => s.settings.themeLight,
  dark: (s) => s.settings.themeDark,
};

interface Props {
  backend: Extract<BackendState, { kind: "ready" }>;
  /** 接続済みの GitHub の表示名。未接続なら null */
  github: string | null;
  localAvailable: boolean;
  theme: Theme;
  onChangeTheme: (theme: Theme) => void;
  language: Language;
  onChangeLanguage: (language: Language) => void;
  onChooseFolder: () => void;
  onUseLocalFolder: () => void;
  onUseGitHub: () => void;
  onDisconnectGitHub: () => void;
  onConnect: (
    input: { token: string; repo: string; branch: string; directory: string },
    remember: boolean,
  ) => Promise<GitHubConnectResult>;
  /** 1ペインしか置けない画面か。出力を出すかどうかの判断に使う */
  narrow: boolean;
  /**
   * テキスト出力を開く。狭い画面ではツールバーから外れるため、
   * ここが唯一の行き先になる（`Toolbar.tsx`）
   */
  onShowExport: () => void;
  /**
   * 履歴を開く。**狭い画面ではここが唯一の行き先である**（2.8-4）。
   * `Ctrl+H` はブラウザの履歴に取られているため、キー割り当てを持たない
   */
  onShowHistory: () => void;
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
  language,
  onChangeLanguage,
  onChooseFolder,
  onUseLocalFolder,
  onUseGitHub,
  onDisconnectGitHub,
  onConnect,
  narrow,
  onShowExport,
  onShowHistory,
  canExport,
  onClose,
}: Props): React.JSX.Element {
  const s = useLanguage((state) => state.s);
  const [connecting, setConnecting] = useState(false);
  const usingGitHub = backend.backend === "github";

  return (
    <aside className="sheet" aria-label={s.settings.title}>
      <div className="sheet-head">
        <strong>{s.settings.title}</strong>
        <button type="button" aria-label={s.settings.close} onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="sheet-body">
        <p className="sheet-group">{s.settings.storage}</p>
        <p className="settings-value">
          {usingGitHub ? s.settings.storageGitHub : s.settings.storageFolder} — {backend.label}
        </p>

        {usingGitHub ? (
          <>
            <button type="button" onClick={() => setConnecting(true)}>
              {s.settings.changeConnection}
            </button>
            {localAvailable && (
              <button type="button" onClick={onUseLocalFolder}>
                {s.settings.backToLocal}
              </button>
            )}
            <button type="button" onClick={onDisconnectGitHub}>
              {s.settings.disconnect}
            </button>
            <p className="sheet-note">{GITHUB_DISCONNECT_NOTE}</p>
          </>
        ) : (
          <>
            <button type="button" onClick={onChooseFolder}>
              {s.settings.changeFolder}
            </button>
            {github === null ? (
              <button type="button" onClick={() => setConnecting(true)}>
                {s.settings.connectGitHub}
              </button>
            ) : (
              <button type="button" onClick={onUseGitHub}>
                {s.settings.switchToGitHub(github)}
              </button>
            )}
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

        {/*
         * **言語を先頭に置く。** englishの画面に迷い込んだ人が最初に探すのはこれで、
         * 下の方にあると設定を開いても戻れない
         */}
        <p className="sheet-group">{s.settings.language}</p>
        <div className="segmented" role="group" aria-label={s.settings.language}>
          {LANGUAGE_LABELS.map((choice) => (
            <button
              type="button"
              key={choice.language}
              aria-pressed={language === choice.language}
              onClick={() => onChangeLanguage(choice.language)}
            >
              {choice.label}
            </button>
          ))}
        </div>

        <p className="sheet-group">{s.settings.theme}</p>
        <div className="segmented" role="group" aria-label={s.settings.theme}>
          {THEMES.map((choice) => (
            <button
              type="button"
              key={choice}
              aria-pressed={theme === choice}
              onClick={() => onChangeTheme(choice)}
            >
              {THEME_LABEL[choice](s)}
            </button>
          ))}
        </div>

        {/*
         * **出力は狭い画面でだけ出す**（2.12）。広い画面ではツールバーに
         * 同じものがあり、重ねる意味が無い。狭い画面ではツールバーから外れるため、
         * ここを消すと `Ctrl+Shift+C` しか道が残らず、**指しか無い端末で出力できなくなる**
         */}
        {narrow && (
          <>
            <p className="sheet-group">{s.settings.export}</p>
            <button type="button" onClick={onShowExport} disabled={!canExport}>
              {s.settings.openExport}
            </button>
          </>
        )}

        <p className="sheet-group">{s.settings.history}</p>
        <button type="button" onClick={onShowHistory} disabled={!canExport}>
          {s.settings.openHistory}
        </button>
      </div>
    </aside>
  );
}
