import { useEffect, useRef } from "react";

import type { MapNode } from "../../core/types.js";
import { useEditor } from "../../state/editor.js";
import { visibleNodes } from "../../state/tree.js";

/**
 * アウトライン表示。
 *
 * キャンバスと同じ場所で入れ替わり、選択ノードは切替後も維持される（設計書 7.2・F-22）。
 * 木の操作は全て `state/` にあり、ここは描画と入力の受け渡しに徹する。
 */

/** 深さは構造パスの区切り数で決まる。ルートは 0 */
function depthOf(node: MapNode): number {
  return node.path === "" ? 0 : node.path.split(".").length;
}

interface RowProps {
  node: MapNode;
  selected: boolean;
  editing: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onBeginEdit: () => void;
  onRename: (label: string) => void;
  onEndEdit: () => void;
  onToggleCollapse: () => void;
}

function Row({
  node,
  selected,
  editing,
  collapsed,
  onSelect,
  onBeginEdit,
  onRename,
  onEndEdit,
  onToggleCollapse,
}: RowProps): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  return (
    <div
      className={`outline-row${selected ? " is-selected" : ""}`}
      style={{ paddingLeft: `${depthOf(node) * 1.5 + 0.5}rem` }}
      onClick={onSelect}
      onDoubleClick={onBeginEdit}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={node.children.length === 0 ? undefined : !collapsed}
      tabIndex={-1}
    >
      <button
        type="button"
        className="outline-twisty"
        aria-label={collapsed ? "展開" : "折り畳み"}
        disabled={node.children.length === 0}
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapse();
        }}
      >
        {node.children.length === 0 ? "·" : collapsed ? "▸" : "▾"}
      </button>

      {editing ? (
        <input
          ref={input}
          className="outline-input"
          value={node.label}
          onChange={(event) => onRename(event.target.value)}
          onBlur={onEndEdit}
          onKeyDown={(event) => {
            // 確定は Enter、取り消しは Escape。どちらも入力欄の中だけで完結させる
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onEndEdit();
            }
          }}
        />
      ) : (
        <span className="outline-label">
          {node.label === "" ? <span className="outline-empty">（空）</span> : node.label}
          {node.emoji !== undefined && <span className="outline-emoji"> {node.emoji}</span>}
          {node.note !== undefined && <span className="outline-hasnote" title="ノートあり" />}
        </span>
      )}
    </div>
  );
}

export function Outline(): React.JSX.Element | null {
  const root = useEditor((state) => state.root);
  const collapsedUids = useEditor((state) => state.collapsedUids);
  const selectedUid = useEditor((state) => state.selectedUid);
  const editingUid = useEditor((state) => state.editingUid);
  const actions = useEditor.getState();

  if (root === null) return null;

  return (
    <div className="outline" role="tree" aria-label="アウトライン">
      {visibleNodes(root, collapsedUids).map((node) => (
        <Row
          key={node.uid}
          node={node}
          selected={node.uid === selectedUid}
          editing={node.uid === editingUid}
          collapsed={collapsedUids.has(node.uid)}
          onSelect={() => actions.select(node.uid)}
          onBeginEdit={() => actions.beginEdit(node.uid)}
          onRename={(label) => actions.rename(label)}
          onEndEdit={() => actions.endEdit()}
          onToggleCollapse={() => {
            actions.select(node.uid);
            useEditor.getState().toggleCollapse();
          }}
        />
      ))}
    </div>
  );
}
