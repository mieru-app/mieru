import { create } from "zustand";

import type { MapDoc, MapNode } from "../core/types.js";
import {
  addChild,
  addSibling,
  collapsedPathsToUids,
  collapsedUidsToPaths,
  cloneTree,
  indent,
  locate,
  moveSibling,
  moveNode,
  moveTo,
  navigate,
  outdent,
  swapWithParent,
  removeNode,
  setEmoji,
  setLabel,
  setNote,
  toggleCollapsed,
} from "./tree.js";
import type { Direction, DropPosition } from "./tree.js";
import type { EditorSnapshot, OpenMap, SaveStatus, ViewMode } from "./types.js";
import { isEditableMode } from "./view-mode.js";

/**
 * 編集中のマップの状態。
 *
 * 永続化には関与しない。保存の段取りは `src/state/session.ts` が受け持ち、
 * このストアは「今どういう木か」だけを持つ。分けているのは、
 * UI が MapStore を意識しないという境界（設計原則3）をここでも保つためである。
 */

/** Undo の段数（設計書 7.1 の F-18） */
const HISTORY_LIMIT = 50;

/** 同じ種類の操作を1つの undo にまとめる猶予。文字入力を1打鍵ずつ戻さないため */
const COALESCE_MS = 800;

export interface EditorActions {
  /** 読み込んだマップを開く */
  open(map: OpenMap, doc: MapDoc): void;
  /** マップを閉じる */
  close(): void;

  /** 選択を移す。`null` で選択を外す（狭い画面でノート欄を閉じるのに使う） */
  select(uid: string | null): void;
  beginEdit(uid: string): void;
  endEdit(): void;
  setMode(mode: ViewMode): void;
  move(direction: Direction): void;

  addSibling(): void;
  addChild(): void;
  remove(): void;
  rename(label: string): void;
  writeNote(note: string): void;
  /** 絵文字を付ける。空文字列で外す（F-15） */
  setEmoji(emoji: string): void;
  /** 選択中のノードのラベル末尾へ `[[対象]]` を足す（F-17） */
  addLink(target: string): void;
  outdent(): void;
  indent(): void;
  /** 親子を反転する（2.9-2）。選択中のノードが親の位置へ上がる */
  swapWithParent(): void;
  reorder(delta: -1 | 1): void;
  reparent(uid: string, newParentUid: string): void;
  /** 掴んで落とした結果を反映する（2.9-3）。位置の意味は `tree.ts` の `DropPosition` */
  dropNode(uid: string, targetUid: string, position: DropPosition): void;
  toggleCollapse(): void;
  /**
   * 木ごと差し替える。キャンバス（mind-elixir）側での編集を取り込むために使う。
   * 個々の操作へ翻訳せず木ごと受け取るのは、描画ライブラリの操作が増えても
   * 追随せずに済むようにするためである（docs/design.md 12.1）。
   */
  replaceTree(root: MapNode, collapsedUids: ReadonlySet<string>): void;

  undo(): void;
  redo(): void;

  /** 保存状態の更新。自動保存（`src/state/autosave.ts`）から呼ぶ */
  setStatus(status: SaveStatus): void;
  markSaved(version: string, at: number): void;
  /** 楽観ロックの基準版を差し替える。空文字列は「次は新規作成」を意味する */
  setVersion(version: string): void;

  /** 現在の状態を保存可能な形にまとめる */
  buildDoc(): MapDoc | null;
}

export interface EditorState extends EditorActions {
  map: OpenMap | null;
  root: MapNode | null;
  collapsedUids: ReadonlySet<string>;
  selectedUid: string | null;
  /** インライン編集中のノード。null なら編集していない */
  editingUid: string | null;
  mode: ViewMode;
  status: SaveStatus;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  /** 直前の操作の種類と時刻。undo のまとめ判定に使う */
  lastEdit: { key: string; at: number } | null;
}

/** 現在の状態からスナップショットを取る */
function snapshot(state: EditorState): EditorSnapshot | null {
  if (state.root === null || state.selectedUid === null) return null;
  return {
    root: cloneTree(state.root),
    collapsedUids: new Set(state.collapsedUids),
    selectedUid: state.selectedUid,
  };
}

/** 履歴を上限で切り詰める。古いものから捨てる */
function pushHistory(past: EditorSnapshot[], entry: EditorSnapshot): EditorSnapshot[] {
  const next = [...past, entry];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

export const useEditor = create<EditorState>((set, get) => {
  /**
   * 木を変更する操作の共通処理。
   *
   * @param coalesceKey 同じ鍵の操作が続けて起きたら1つの undo にまとめる。
   *   null を渡すと必ず新しい履歴を積む
   */
  function change(
    apply: (root: MapNode, uid: string) => { root: MapNode; selectUid: string },
    coalesceKey: string | null = null,
  ): void {
    const state = get();
    const { root, selectedUid } = state;
    if (root === null || selectedUid === null) return;

    const result = apply(root, selectedUid);
    // 木が変わらなかった操作は履歴を汚さない（端での移動など）
    if (result.root === root && result.selectUid === selectedUid) return;

    const now = Date.now();
    const merge =
      coalesceKey !== null &&
      state.lastEdit !== null &&
      state.lastEdit.key === coalesceKey &&
      now - state.lastEdit.at < COALESCE_MS;

    const taken = snapshot(state);
    set({
      root: result.root,
      selectedUid: result.selectUid,
      past: merge || taken === null ? state.past : pushHistory(state.past, taken),
      // 新しい編集をしたら redo は捨てる。分岐した履歴は持たない
      future: [],
      lastEdit: coalesceKey === null ? null : { key: coalesceKey, at: now },
      status: { kind: "dirty" },
    });
  }

  /** 履歴を1つ移動する。undo と redo で向きだけが違う */
  function travel(from: "past" | "future"): void {
    const state = get();
    const stack = state[from];
    const entry = stack[stack.length - 1];
    if (entry === undefined) return;

    const current = snapshot(state);
    if (current === null) return;
    const to = from === "past" ? "future" : "past";

    set({
      root: entry.root,
      collapsedUids: entry.collapsedUids,
      selectedUid: entry.selectedUid,
      editingUid: null,
      [from]: stack.slice(0, -1),
      [to]: [...state[to], current],
      lastEdit: null,
      status: { kind: "dirty" },
    });
  }

  return {
    map: null,
    root: null,
    collapsedUids: new Set<string>(),
    selectedUid: null,
    editingUid: null,
    mode: "canvas",
    status: { kind: "empty" },
    past: [],
    future: [],
    lastEdit: null,

    open(map, doc) {
      set({
        map,
        root: doc.root,
        collapsedUids: collapsedPathsToUids(doc.root, doc.view.collapsed),
        selectedUid: doc.root.uid,
        editingUid: null,
        status: { kind: "saved", at: Date.now() },
        // 別のマップの履歴を引き継がない
        past: [],
        future: [],
        lastEdit: null,
      });
    },

    close() {
      set({
        map: null,
        root: null,
        collapsedUids: new Set(),
        selectedUid: null,
        editingUid: null,
        status: { kind: "empty" },
        past: [],
        future: [],
        lastEdit: null,
      });
    },

    select(uid) {
      set({ selectedUid: uid, editingUid: null });
    },
    beginEdit(uid) {
      // Markdown 表示には入力欄が無い。ここで編集中にすると、以後どのキーも
      // 「入力中」として無視され（`useKeymap`）、抜ける手段が無くなる
      if (!isEditableMode(get().mode)) return;
      set({ selectedUid: uid, editingUid: uid });
    },
    endEdit() {
      set({ editingUid: null, lastEdit: null });
    },
    setMode(mode) {
      // 書き換えられない画面へ移るときは、書きかけの入力欄ごと閉じる
      set({ mode, editingUid: isEditableMode(mode) ? get().editingUid : null });
    },

    move(direction) {
      const { root, selectedUid, collapsedUids } = get();
      if (root === null || selectedUid === null) return;
      set({ selectedUid: navigate(root, selectedUid, direction, collapsedUids), editingUid: null });
    },

    addSibling() {
      change((root, uid) => addSibling(root, uid));
      const { selectedUid } = get();
      // 追加したノードはすぐ入力できる状態にする（原則4）
      if (selectedUid !== null) set({ editingUid: selectedUid });
    },

    addChild() {
      change((root, uid) => addChild(root, uid));
      const { selectedUid } = get();
      if (selectedUid !== null) set({ editingUid: selectedUid });
    },

    remove() {
      change((root, uid) => removeNode(root, uid));
      set({ editingUid: null });
    },

    rename(label) {
      // 連続した打鍵を1つの undo にまとめる
      change((root, uid) => setLabel(root, uid, label), `label:${get().selectedUid ?? ""}`);
    },

    writeNote(note) {
      change((root, uid) => setNote(root, uid, note), `note:${get().selectedUid ?? ""}`);
    },

    setEmoji(emoji) {
      // 1回の選択で1つの操作。まとめると「付けた」「外した」が1度に戻る
      change((root, uid) => setEmoji(root, uid, emoji));
    },

    addLink(target) {
      const node = selectedNode(get());
      if (node === null || target === "" || node.links.includes(target)) return;
      // リンクはラベルの中に書く。ラベルが正で links はそこから集めた派生である
      const label = node.label === "" ? `[[${target}]]` : `${node.label} [[${target}]]`;
      change((root, uid) => setLabel(root, uid, label));
    },

    outdent() {
      change((root, uid) => outdent(root, uid));
    },
    indent() {
      change((root, uid) => indent(root, uid));
    },
    swapWithParent() {
      change((root, uid) => swapWithParent(root, uid));
    },
    reorder(delta) {
      change((root, uid) => moveSibling(root, uid, delta));
    },
    reparent(uid, newParentUid) {
      change((root) => moveTo(root, uid, newParentUid));
    },
    dropNode(uid, targetUid, position) {
      const before = get().root;
      change((root) => moveNode(root, uid, targetUid, position));
      // 成立しない移動では木が変わらない。畳みにも触らない
      if (get().root === before) return;

      // **畳まれた枝の中へ落としたら開く。** そのままだと落とした行が
      // 画面から消え、移動できなかったのか隠れたのかが区別できない
      if (position === "inside" && get().collapsedUids.has(targetUid)) {
        const opened = new Set(get().collapsedUids);
        opened.delete(targetUid);
        set({ collapsedUids: opened });
      }
    },

    toggleCollapse() {
      const state = get();
      const { root, selectedUid } = state;
      if (root === null || selectedUid === null) return;

      const next = toggleCollapsed(root, selectedUid, state.collapsedUids);
      if (next.size === state.collapsedUids.size) return;
      // 折り畳みは表示状態だが frontmatter に保存されるため、変更は未保存として扱う
      set({ collapsedUids: next, status: { kind: "dirty" } });
    },

    replaceTree(root, collapsedUids) {
      const state = get();
      if (state.root === null) return;
      const taken = snapshot(state);
      // 差し替え後に残っているノードを選び直す。消えていたらルートへ寄せる
      const selected =
        state.selectedUid !== null && locate(root, state.selectedUid) !== null
          ? state.selectedUid
          : root.uid;
      set({
        root,
        collapsedUids,
        selectedUid: selected,
        past: taken === null ? state.past : pushHistory(state.past, taken),
        future: [],
        lastEdit: null,
        status: { kind: "dirty" },
      });
    },

    undo() {
      travel("past");
    },
    redo() {
      travel("future");
    },

    setStatus(status) {
      set({ status });
    },
    setVersion(version) {
      const { map } = get();
      if (map !== null) set({ map: { ...map, version } });
    },
    markSaved(version, at) {
      const { map } = get();
      set({
        map: map === null ? null : { ...map, version },
        status: { kind: "saved", at },
      });
    },

    buildDoc() {
      const { map, root, collapsedUids } = get();
      if (map === null || root === null) return null;
      return {
        meta: map.meta,
        root,
        view: { collapsed: collapsedUidsToPaths(root, collapsedUids), colors: map.colors },
      };
    },
  };
});

/** 選択中のノード。UI から使う */
export function selectedNode(state: EditorState): MapNode | null {
  if (state.root === null || state.selectedUid === null) return null;
  return locate(state.root, state.selectedUid)?.node ?? null;
}
