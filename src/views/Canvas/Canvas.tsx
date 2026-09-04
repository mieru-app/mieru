import MindElixir from "mind-elixir";
import type { MindElixirInstance, NodeObj, Topic } from "mind-elixir";
import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * 拡大縮小の刻みと範囲（2.7-4）。
 *
 * 指しか無い端末に拡大縮小の手段を用意する。ライブラリ自身の
 * `scale()` / `scaleFit()` を押しボタンに繋ぐだけで、手勢は横取りしない。
 *
 * **移動（パン）には手を出さない。** 2.7-6 で自前のパンを足したが、
 * ライブラリのパンは指も受け付けており、**両方が走って指の移動量の2倍だけ
 * 地図が動いていた**（2026-09-04 に実機で確認して撤去）。詳細は設計書 7.2.1。
 *
 * 範囲はライブラリ既定の `scaleMin` 0.2 / `scaleMax` 1.4 に合わせてある。
 * `scale()` は範囲外を黙って捨てるため、押しても何も起きないボタンを
 * 出さないよう、こちら側でも同じ値を持って `disabled` にする。
 */
const SCALE_MIN = 0.2;
const SCALE_MAX = 1.4;
const SCALE_STEP = 0.2;

function clampScale(value: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(value * 100) / 100));
}

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
  /**
   * 利用者が自分で動かしたか（2.11-2）。
   *
   * **動かした後は、こちらから位置を戻さない。** 見ていた場所へ戻る道が無いまま
   * 画面が飛ぶのは、余白より困る。マップを開き直すと解除する。
   */
  const touched = useRef(false);

  const mapId = useEditor((state) => state.map?.id ?? null);
  const root = useEditor((state) => state.root);
  const colors = useEditor((state) => state.map?.colors ?? "auto");
  const collapsedUids = useEditor((state) => state.collapsedUids);
  const selectedUid = useEditor((state) => state.selectedUid);
  const editingUid = useEditor((state) => state.editingUid);
  /** 押しボタンの有効・無効に使う。描画は mind-elixir 側が持つ */
  const [scale, setScale] = useState(1);

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
      mind.init(toMindElixir(current.root, current.collapsedUids, current.map?.colors ?? "auto"));
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

    mind.bus.addListener("scale", (value: number) => {
      touched.current = true;
      setScale(value);
    });
    mind.bus.addListener("move", () => {
      touched.current = true;
    });
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

  /*
   * 入れ物の大きさが変わったら中央へ戻す（2.11-2）。
   *
   * **`init()` の中央寄せは、そのときの入れ物の大きさで決まる。** 起動直後は
   * まだ最終的な高さになっておらず、地図が上へ寄ったまま残っていた。
   * 一覧や欄を開閉したときも幅が変わるので、同じ理由で寄る。
   *
   * **ただし利用者が動かした後は戻さない。** 見ていた場所を奪う方が困る。
   */
  useEffect(() => {
    const element = container.current;
    if (element === null || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const mind = instance.current;
      if (mind === null || touched.current) return;
      mind.toCenter();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // 別のマップを開いたら、動かした印を解く。前のマップでの操作を引きずらない
  useEffect(() => {
    touched.current = false;
  }, [mapId]);

  // ストア側の変更（Undo、アウトラインでの編集、外部変更の取り込み）を描画へ反映する
  useEffect(() => {
    const mind = instance.current;
    if (mind === null || root === null) return;
    // mind-elixir 自身の操作で生まれた木は、既に描画されている
    if (root === absorbed.current) return;
    applying.current = true;
    try {
      mind.refresh(toMindElixir(root, collapsedUids, colors));
    } finally {
      applying.current = false;
    }
  }, [root, collapsedUids, colors]);

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

  const zoom = useCallback((delta: number) => {
    const mind = instance.current;
    if (mind === null) return;
    const next = clampScale(mind.scaleVal + delta);
    mind.scale(next);
    // scale() は範囲外を黙って捨てる。捨てられた場合に印だけ動かさないよう、
    // 実際に反映された値を読み直す
    setScale(mind.scaleVal);
  }, []);

  const fit = useCallback(() => {
    const mind = instance.current;
    const element = container.current;
    if (mind === null || element === null) return;

    mind.scaleFit();
    /*
     * **`scaleFit()` は入れ物の scroll を戻さない。** `toCenter()` は
     * `scrollTop = scrollLeft = 0` を明示しており、こちらだけ抜けている。
     * scroll が付くのは内容が入れ物より大きいときだけなので、
     * 「畳めば中央に来るのに、広げると来ない」という形で出る（2.11-2）。
     *
     * ここを揃えるのは、原因がこれだと確かめたからではなく、
     * **揃っていない状態が正しいとは考えにくい**ためである。
     */
    element.scrollTop = 0;
    element.scrollLeft = 0;
    setScale(mind.scaleVal);
  }, []);

  return (
    <div className="canvas">
      {/*
       * **クラス名を付けない。** mind-elixir はこの要素の className を
       * "map-container" で上書きするため、付けても消える。
       * 大きさ（100%）・touch-action: none・font-size: 16px は
       * 向こうの .map-container が持っている（mind-elixir/style）
       */}
      <div ref={container} />
      <div className="canvas-zoom" role="group" aria-label="拡大縮小">
        <button
          type="button"
          aria-label="拡大"
          onClick={() => zoom(SCALE_STEP)}
          disabled={scale >= SCALE_MAX}
        >
          ＋
        </button>
        <button
          type="button"
          aria-label="縮小"
          onClick={() => zoom(-SCALE_STEP)}
          disabled={scale <= SCALE_MIN}
        >
          －
        </button>
        <button type="button" aria-label="全体を表示" onClick={fit}>
          ⛶
        </button>
      </div>
    </div>
  );
}
