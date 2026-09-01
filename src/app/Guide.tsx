/**
 * 何をすればよいかを、その場に出す。
 *
 * キーボードで完結する道具は、操作を知らないと1手も進めない。
 * 「使い方が分からない」は利用者の問題ではなく作りの問題として扱う（原則4）。
 */

interface NoMapProps {
  hasMaps: boolean;
  onNewMap: () => void;
}

/** フォルダは選んだが、まだマップを開いていないとき */
export function NoMapGuide({ hasMaps, onNewMap }: NoMapProps): React.JSX.Element {
  return (
    <div className="guide">
      <h2>{hasMaps ? "マップを開いてください" : "最初のマップを作りましょう"}</h2>
      <p>
        {hasMaps
          ? "左の一覧から選ぶか、新しく作成します。"
          : "選んだフォルダに .md ファイルとして保存されます。Obsidian や VS Code でもそのまま開けます。"}
      </p>
      <button type="button" className="primary" onClick={onNewMap}>
        新規作成
      </button>
    </div>
  );
}

/** マップは開いたが、まだ枝が1本も無いとき */
export function FirstBranchGuide(): React.JSX.Element {
  return (
    <div className="guide guide-overlay">
      <h2>中心テーマから枝を伸ばします</h2>
      <dl className="guide-keys">
        <div>
          <dt>
            <kbd>Tab</kbd>
          </dt>
          <dd>子を追加する</dd>
        </div>
        <div>
          <dt>
            <kbd>Enter</kbd>
          </dt>
          <dd>兄弟を追加する</dd>
        </div>
        <div>
          <dt>
            <kbd>Space</kbd>
          </dt>
          <dd>選択中のノードを書き換える</dd>
        </div>
      </dl>
      <p className="guide-note">
        <kbd>?</kbd> でキー操作の一覧を開けます。
      </p>
    </div>
  );
}
