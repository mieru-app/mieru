import { useState } from "react";

import type { BackendState, GitHubConnectResult } from "../state/workspace.js";
import { GitHubConnect } from "./GitHubConnect.js";

/**
 * 保存先を選ぶまでの画面（F-30 / 1-14 / 2.6-4）。
 *
 * **Phase 2.6 で「非対応ブラウザです」で終わる画面をやめた。** GitHub を
 * 保存先に選べるようになったため、File System Access API が無いことは
 * 行き止まりではなくなった（設計書 8.7）。
 */

interface Props {
  backend: BackendState;
  onChoose: () => void;
  onGrant: () => void;
  onConnect: (
    input: { token: string; repo: string; branch: string; directory: string },
    remember: boolean,
  ) => Promise<GitHubConnectResult>;
}

export function StartScreen({
  backend,
  onChoose,
  onGrant,
  onConnect,
}: Props): React.JSX.Element | null {
  const [connecting, setConnecting] = useState(false);

  if (backend.kind === "ready") return null;

  if (backend.kind === "loading") {
    return <div className="startscreen">読み込み中…</div>;
  }

  if (backend.kind === "needsPermission") {
    return (
      <div className="startscreen">
        <h1>フォルダへのアクセスを許可してください</h1>
        <p>
          前回使っていたフォルダ「{backend.folderName}」を開くには、
          ブラウザの制約により、もう一度だけ許可の操作が必要です。
        </p>
        <button type="button" className="primary" onClick={onGrant}>
          アクセスを許可する
        </button>
        <button type="button" onClick={onChoose}>
          別のフォルダを選ぶ
        </button>
      </div>
    );
  }

  if (connecting) {
    return (
      <div className="startscreen">
        <h1>GitHub に接続</h1>
        <p>マップは、あなたのリポジトリの Markdown として保存されます。</p>
        <GitHubConnect
          onConnect={onConnect}
          onCancel={() => {
            setConnecting(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="startscreen">
      <h1>Mieru</h1>
      <p>考えを整理し、そのまま AI に渡せるマインドマップツール。</p>

      <p className="startscreen-lead">まず、マップの保存先を決めます。</p>

      <div className="startscreen-choices">
        <section>
          <h2>このパソコンのフォルダ</h2>
          <p>
            選んだフォルダ直下に <code>.md</code> として保存します。 Obsidian や VS Code
            でもそのまま開けます。
          </p>
          {backend.localAvailable ? (
            <button type="button" className="primary" onClick={onChoose}>
              フォルダを選ぶ
            </button>
          ) : (
            <p className="startscreen-note">
              このブラウザでは選べません。フォルダを直接読み書きする仕組み（File System Access
              API）に対応しているのは <strong>デスクトップ版の Edge / Chrome</strong> だけです。
            </p>
          )}
        </section>

        <section>
          <h2>GitHub のリポジトリ</h2>
          <p>
            あなたのリポジトリに保存します。
            <strong>どの端末からでも同じマップを開けます。</strong>
            GitHub のアカウントとアクセストークンが要ります。
          </p>
          <button
            type="button"
            className={backend.localAvailable ? "" : "primary"}
            onClick={() => {
              setConnecting(true);
            }}
          >
            GitHub に接続する
          </button>
        </section>
      </div>

      <p className="startscreen-note">
        保存先は後から設定で変えられます。保存ボタンはありません（入力が止まると自動保存）。
      </p>
    </div>
  );
}
