import type { FolderState } from "../state/workspace.js";

/**
 * フォルダを選ぶまでの画面と、非対応ブラウザへの案内（F-30 / 1-14）。
 *
 * File System Access API は Chromium 系デスクトップでしか動かない。
 * これは Phase 1 の制約であり、Phase 3 のクラウド同期で解消される（設計書 8.3）。
 */

interface Props {
  folder: FolderState;
  onChoose: () => void;
  onGrant: () => void;
}

export function StartScreen({ folder, onChoose, onGrant }: Props): React.JSX.Element | null {
  if (folder.kind === "ready") return null;

  if (folder.kind === "loading") {
    return <div className="startscreen">読み込み中…</div>;
  }

  if (folder.kind === "unsupported") {
    return (
      <div className="startscreen">
        <h1>このブラウザでは使えません</h1>
        <p>
          MindDeck はローカルフォルダの Markdown を直接読み書きします。 この仕組み（File System
          Access API）に対応しているのは、
          <strong>デスクトップ版の Microsoft Edge / Google Chrome</strong> です。
        </p>
        <p className="startscreen-note">
          Firefox・Safari・スマートフォンへの対応は、クラウド同期を入れる Phase 3 で行います。
        </p>
      </div>
    );
  }

  if (folder.kind === "needsPermission") {
    return (
      <div className="startscreen">
        <h1>フォルダへのアクセスを許可してください</h1>
        <p>
          前回使っていたフォルダ「{folder.folderName}」を開くには、
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

  return (
    <div className="startscreen">
      <h1>MindDeck</h1>
      <p>考えを整理し、そのまま AI に渡せるマインドマップツール。</p>
      <p>
        マップは選んだフォルダに <code>.md</code> ファイルとして保存されます。 Obsidian や VS Code
        でそのまま開けます。
      </p>
      <button type="button" className="primary" onClick={onChoose}>
        フォルダを選ぶ
      </button>
    </div>
  );
}
