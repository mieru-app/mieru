import { useState } from "react";

import type { BackendState, GitHubConnectResult } from "../state/workspace.js";
import { GitHubConnect } from "./GitHubConnect.js";
import { Wordmark } from "./Wordmark.js";

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
  onStartGuest: () => void;
  onGrant: () => void;
  onConnect: (
    input: { token: string; repo: string; branch: string; directory: string },
    remember: boolean,
  ) => Promise<GitHubConnectResult>;
}

export function StartScreen({
  backend,
  onChoose,
  onStartGuest,
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
        <p>「{backend.folderName}」を開くには、ブラウザの制約でもう一度だけ許可が要ります。</p>
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
        <p>あなたのリポジトリの Markdown として保存されます。</p>
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
      <h1 className="startscreen-title">
        {/* 見出しの中身がロゴなので、読み上げ名はロゴ側が持つ */}
        <Wordmark />
      </h1>
      <p className="startscreen-tagline">マインドマップで広げた考えが、そのまま Markdown。</p>

      {/*
       * **保存先を決めずに入れる道を先に出す**（2.12）。
       * 何も見ないうちにフォルダの許可を求められるのが、
       * 初めての利用者に最も不信感を与える（NN/g のアクセス許可の指針）
       */}
      <div className="startscreen-guest">
        <button type="button" className="primary" onClick={onStartGuest}>
          ゲストモードで試す
        </button>
        <p className="startscreen-note">保存されません。あとから保存先を選べます。</p>
      </div>

      <p className="startscreen-lead">保存先</p>

      <div className="startscreen-choices">
        <section>
          <h2>ローカルフォルダ</h2>
          {backend.localAvailable ? (
            <>
              {/*
               * **どこまで触るのかを、押す前に言う**（2.12）。
               * ここを黙ったまま許可を求めるのが、初めての利用者に
               * 最も不信感を与える（NN/g のアクセス許可の指針）。
               * 実装は `LocalFolderStore` が直下の `.md` だけを列挙しており、
               * 下位フォルダには入らない。**書ける以上の範囲を名乗らない**
               */}
              <p className="startscreen-scope">
                選んだフォルダの直下にある <code>.md</code> だけを読み書きします
              </p>
              <button type="button" onClick={onChoose}>
                フォルダを選ぶ
              </button>
            </>
          ) : (
            <p className="startscreen-note">
              <strong>デスクトップ版の Chrome か Edge</strong> が要ります。
            </p>
          )}
        </section>

        <section>
          <h2>GitHub リポジトリ</h2>
          <p>トークンが必要です</p>
          <button
            type="button"

            onClick={() => {
              setConnecting(true);
            }}
          >
            接続する
          </button>
        </section>
      </div>
    </div>
  );
}
