import { useCallback, useEffect, useRef, useState } from "react";

import type { MapNode } from "../../core/types.js";
import { movedFar, resolveDropPosition } from "../../state/drag.js";
import { useEditor } from "../../state/editor.js";
import type { DropPosition } from "../../state/tree.js";
import { canDrop, visibleNodes } from "../../state/tree.js";
import { InlineText } from "../Inline/InlineText.js";

/**
 * アウトライン表示。
 *
 * キャンバスと同じ場所で入れ替わり、選択ノードは切替後も維持される（設計書 7.2・F-22）。
 * 木の操作は全て `state/` にあり、ここは描画と入力の受け渡しに徹する。
 *
 * **掴んで落とす操作（2.9-3）はグリップから始める。** 行そのものを掴む方式にすると
 * 指での縦送りと競合する。判断は `state/drag.ts`（どこへ落ちるか）と
 * `state/tree.ts`（その移動が成立するか）にあり、ここは座標を渡すだけにする。
 */

/** 深さは構造パスの区切り数で決まる。ルートは 0 */
function depthOf(node: MapNode): number {
  return node.path === "" ? 0 : node.path.split(".").length;
}

/** いま掴んでいるもの。落とす先が決まっていなければ `target` は null */
interface DragState {
  pointerId: number;
  uid: string;
  startX: number;
  startY: number;
  /** 実際に動き始めたか。押しただけの状態と区別する */
  active: boolean;
  target: { uid: string; position: DropPosition } | null;
}

interface RowProps {
  node: MapNode;
  selected: boolean;
  editing: boolean;
  collapsed: boolean;
  /** 掴まれて動いている行。薄く見せる */
  dragging: boolean;
  /** この行が落とし先のとき、その位置。そうでなければ null */
  dropping: DropPosition | null;
  onSelect: () => void;
  onBeginEdit: () => void;
  onRename: (label: string) => void;
  onEndEdit: () => void;
  onToggleCollapse: () => void;
  onGrab: (event: React.PointerEvent<HTMLElement>) => void;
}

function Row({
  node,
  selected,
  editing,
  collapsed,
  dragging,
  dropping,
  onSelect,
  onBeginEdit,
  onRename,
  onEndEdit,
  onToggleCollapse,
  onGrab,
}: RowProps): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const marks = [
    selected ? " is-selected" : "",
    dragging ? " is-dragging" : "",
    dropping === null ? "" : ` is-drop-${dropping}`,
  ].join("");

  return (
    <div
      className={`outline-row${marks}`}
      style={{ paddingLeft: `${depthOf(node) * 1.5 + 0.5}rem` }}
      data-uid={node.uid}
      onClick={onSelect}
      onDoubleClick={onBeginEdit}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={node.children.length === 0 ? undefined : !collapsed}
      tabIndex={-1}
    >
      <span
        className="outline-grip"
        // 中心テーマは動かせない。掴めない物に掴み手を出さない
        hidden={depthOf(node) === 0}
        aria-hidden="true"
        title="掴んで階層を変える"
        onPointerDown={onGrab}
        onClick={(event) => event.stopPropagation()}
      >
        ⠿
      </span>

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
          {node.label === "" ? (
            <span className="outline-empty">（空）</span>
          ) : (
            <InlineText text={node.label} />
          )}
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

  const [drag, setDrag] = useState<DragState | null>(null);
  // 掴んでいる間だけ参照する。購読し直さずに最新を読むため ref に持つ
  const latest = useRef<DragState | null>(null);
  latest.current = drag;

  /** 座標の下にある行から落とし先を決める。成立しない相手は選ばない */
  const targetAt = useCallback(
    (uid: string, x: number, y: number): DragState["target"] => {
      if (root === null) return null;
      const under = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-uid]");
      const targetUid = under?.dataset["uid"];
      if (under === null || under === undefined || targetUid === undefined) return null;

      const box = under.getBoundingClientRect();
      const position = resolveDropPosition(y - box.top, box.height);
      return canDrop(root, uid, targetUid, position) ? { uid: targetUid, position } : null;
    },
    [root],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = latest.current;
      if (state === null || state.pointerId !== event.pointerId) return;

      if (!state.active) {
        if (!movedFar(event.clientX - state.startX, event.clientY - state.startY)) return;
        // 動き始めた時点で選ぶ。掴んだ物が選択されていないと、
        // 落とした後にどれを動かしたのか分からなくなる
        useEditor.getState().select(state.uid);
      }
      setDrag({
        ...state,
        active: true,
        target: targetAt(state.uid, event.clientX, event.clientY),
      });
    },
    [targetAt],
  );

  const onPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = latest.current;
    if (state === null || state.pointerId !== event.pointerId) return;
    setDrag(null);

    // 押しただけ・落とし先が無いまま離した場合は何もしない
    if (!state.active || state.target === null) return;
    if (event.type === "pointercancel") return;
    useEditor.getState().dropNode(state.uid, state.target.uid, state.target.position);
  }, []);

  if (root === null) return null;

  return (
    <div
      className="outline"
      role="tree"
      aria-label="アウトライン"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {visibleNodes(root, collapsedUids).map((node) => (
        <Row
          key={node.uid}
          node={node}
          selected={node.uid === selectedUid}
          editing={node.uid === editingUid}
          collapsed={collapsedUids.has(node.uid)}
          dragging={drag !== null && drag.active && drag.uid === node.uid}
          dropping={drag?.target?.uid === node.uid ? (drag.target?.position ?? null) : null}
          onSelect={() => actions.select(node.uid)}
          onBeginEdit={() => actions.beginEdit(node.uid)}
          onRename={(label) => actions.rename(label)}
          onEndEdit={() => actions.endEdit()}
          onToggleCollapse={() => {
            actions.select(node.uid);
            useEditor.getState().toggleCollapse();
          }}
          onGrab={(event) => {
            if (event.button !== 0 && event.pointerType === "mouse") return;
            // 掴んでいる間の move / up を1か所で受けるため、一覧側で捕まえる
            event.currentTarget.closest(".outline")?.setPointerCapture(event.pointerId);
            setDrag({
              pointerId: event.pointerId,
              uid: node.uid,
              startX: event.clientX,
              startY: event.clientY,
              active: false,
              target: null,
            });
          }}
        />
      ))}
    </div>
  );
}
