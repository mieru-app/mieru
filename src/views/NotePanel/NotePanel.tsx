import { useEffect, useState } from "react";

import type { MapNode } from "../../core/types.js";

/**
 * ノートパネル。
 *
 * ラベル（短いキーワード）とノート（説明文）の2層構造の後者を編集する（原則5）。
 * 選択中のノードがあるときだけ表示し、常時表示はしない（設計書 7.2）。
 */

interface Props {
  node: MapNode;
  onChange: (note: string) => void;
}

export function NotePanel({ node, onChange }: Props): React.JSX.Element {
  const [draft, setDraft] = useState(node.note ?? "");

  // 選択が変わったら編集中の内容を選択先のものに入れ替える
  useEffect(() => {
    setDraft(node.note ?? "");
  }, [node.uid, node.note]);

  return (
    <aside className="notepanel">
      <div className="notepanel-head">
        <span className="notepanel-label">
          {node.label === "" ? "（無題のノード）" : node.label}
        </span>
        <span className="notepanel-hint">ノート</span>
      </div>
      <textarea
        className="notepanel-input"
        value={draft}
        placeholder="このノードの説明。AI へ渡すときに本文段落として展開されます。"
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
      />
    </aside>
  );
}
