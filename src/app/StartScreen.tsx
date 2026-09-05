import { useLanguage } from "../state/i18n.js";
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
  const s = useLanguage((state) => state.s);
  const [connecting, setConnecting] = useState(false);

  if (backend.kind === "ready") return null;

  if (backend.kind === "loading") {
    return <div className="startscreen">{s.start.loading}</div>;
  }

  if (backend.kind === "needsPermission") {
    return (
      <div className="startscreen">
        <h1>{s.start.permissionTitle}</h1>
        <p>{s.start.permissionBody(backend.folderName)}</p>
        <button type="button" className="primary" onClick={onGrant}>
          {s.start.grant}
        </button>
        <button type="button" onClick={onChoose}>
          {s.start.pickAnother}
        </button>
      </div>
    );
  }

  if (connecting) {
    return (
      <div className="startscreen">
        <h1>{s.start.connectTitle}</h1>
        <p>{s.start.connectBody}</p>
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
      <p className="startscreen-tagline">{s.start.tagline}</p>

      {/*
       * **保存先を決めずに入れる道を先に出す**（2.12）。
       * 何も見ないうちにフォルダの許可を求められるのが、
       * 初めての利用者に最も不信感を与える（NN/g のアクセス許可の指針）
       */}
      <div className="startscreen-guest">
        <button type="button" className="primary" onClick={onStartGuest}>
          {s.start.guest}
        </button>
        <p className="startscreen-note">{s.start.guestNote}</p>
      </div>

      <p className="startscreen-lead">{s.start.storage}</p>

      <div className="startscreen-choices">
        <section>
          <h2>{s.start.localFolder}</h2>
          {backend.localAvailable ? (
            <>
              {/*
               * **どこまで触るのかを、押す前に言う**（2.12）。
               * ここを黙ったまま許可を求めるのが、初めての利用者に
               * 最も不信感を与える（NN/g のアクセス許可の指針）。
               * 実装は `LocalFolderStore` が直下の `.md` だけを列挙しており、
               * 下位フォルダには入らない。**書ける以上の範囲を名乗らない**
               */}
              <p className="startscreen-scope">{s.start.localScope}</p>
              <button type="button" onClick={onChoose}>
                {s.start.pickFolder}
              </button>
            </>
          ) : (
            <p className="startscreen-note">{s.start.localUnsupported}</p>
          )}
        </section>

        <section>
          <h2>{s.start.githubRepo}</h2>
          <p>{s.start.githubNeedsToken}</p>
          <button
            type="button"

            onClick={() => {
              setConnecting(true);
            }}
          >
            {s.start.connect}
          </button>
        </section>
      </div>
    </div>
  );
}
