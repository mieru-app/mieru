import MindElixir from "mind-elixir";
import type { MindElixirInstance, NodeObj, Topic } from "mind-elixir";
import { useEffect, useRef } from "react";
import "mind-elixir/style";

import type { MapNode } from "../../core/types.js";
import { useEditor } from "../../state/editor.js";
import type { MindElixirData } from "./adapter.js";
import { fromMindElixir, toMindElixir } from "./adapter.js";

/**
 * キャンバス表示。mind-elixir への依存はこのフォルダの中だけに閉じる（不変条件4）。
 *
 * 本ツールのモデルが正であり、mind-elixir は描画と操作の面にすぎない。
 * mind-elixir 側で編集が起きたら木ごと取り込み直す（`adapter.ts`）。
 */

/** 選択やインライン編集のために、描画済みのノード要素を引く */
function topicElement(mind: MindElixirInstance, uid: string): Topic | null {
  return MindElixir.E.call(mind, uid) ?? null;
}

export function Canvas(): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<MindElixirInstance | null>(null);
  /** 自分が書き戻した内容を、利用者の編集として取り込み直さないための印 */
  const applying = useRef(false);
  /**
   * mind-elixir 側から取り込んだ木。
   * これと同じものを描画へ戻すと、操作のたびに全体が再描画されて
   * 入力中のノードからフォーカスが外れるため、その往復を止めるために覚えておく。
   */
  const absorbed = useRef<MapNode | null>(null);

  const root = useEditor((state) => state.root);
  const collapsedUids = useEditor((state) => state.collapsedUids);
  const selectedUid = useEditor((state) => state.selectedUid);
  const editingUid = useEditor((state) => state.editingUid);

  useEffect(() => {
    const element = container.current;
    if (element === null) return;

    const mind = new MindElixir({
      el: element,
      direction: MindElixir.SIDE,
      editable: true,
      contextMenu: false,
      toolBar: false,
      // キー操作は本ツールが一手に引き受ける（設計書 7.4）。
      // mind-elixir にも持たせると同じキーが二重に効く
      keypress: false,
      // Undo も本ツール側で50段持つ（F-18）。二重に持たせない
      allowUndo: false,
    });

    const current = useEditor.getState();
    if (current.root !== null) {
      mind.init(toMindElixir(current.root, current.collapsedUids));
    }

    /** mind-elixir 側の変更を本ツールのモデルへ取り込む */
    const absorb = (): void => {
      if (applying.current) return;
      const editor = useEditor.getState();
      if (editor.root === null) return;
      const data = mind.getData() as unknown as MindElixirData;
      const { root: nextRoot, collapsedUids: nextCollapsed } = fromMindElixir(data, editor.root);
      absorbed.current = nextRoot;
      editor.replaceTree(nextRoot, nextCollapsed);
    };

    mind.bus.addListener("operation", absorb);
    mind.bus.addListener("expandNode", absorb);
    mind.bus.addListener("selectNodes", (nodes: NodeObj[]) => {
      const id = nodes[0]?.id;
      if (typeof id === "string") useEditor.getState().select(id);
    });

    instance.current = mind;
    return () => {
      mind.destroy();
      instance.current = null;
    };
  }, []);

  // ストア側の変更（Undo、アウトラインでの編集、外部変更の取り込み）を描画へ反映する
  useEffect(() => {
    const mind = instance.current;
    if (mind === null || root === null) return;
    // mind-elixir 自身の操作で生まれた木は、既に描画されている
    if (root === absorbed.current) return;
    applying.current = true;
    try {
      mind.refresh(toMindElixir(root, collapsedUids));
    } finally {
      applying.current = false;
    }
  }, [root, collapsedUids]);

  // 選択を描画側へ伝える。アウトラインから切り替えても選択が保たれる（F-22）
  useEffect(() => {
    const mind = instance.current;
    if (mind === null || selectedUid === null) return;
    const element = topicElement(mind, selectedUid);
    if (element !== null) mind.selectNode(element);
  }, [selectedUid, root]);

  // インライン編集の開始をキャンバス側の編集に繋ぐ（F-11）
  useEffect(() => {
    const mind = instance.current;
    if (mind === null || editingUid === null) return;
    const element = topicElement(mind, editingUid);
    if (element !== null) mind.editTopic(element);
  }, [editingUid]);

  return <div className="canvas" ref={container} />;
}
