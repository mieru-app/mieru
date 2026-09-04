/**
 * キーボード操作の割り当て。
 *
 * 「全ての主要操作をキーボードで完結させる」という原則4の実装。
 * どのキーが何になるかを純粋関数として切り出しているのは、
 * 画面を動かさずに割り当てを検証できるようにするためである。
 *
 * 仕様の正本: docs/design.md 7.4
 */

export type Command =
  | "addSibling"
  | "addChild"
  | "outdent"
  | "beginEdit"
  | "remove"
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "reorderUp"
  | "reorderDown"
  /** 親子を反転する（2.9-2、設計書 7.4）。選択ノードが親の位置へ上がる */
  | "swapWithParent"
  | "toggleCollapse"
  | "undo"
  | "redo"
  | "toggleMode"
  | "copyForAi"
  | "saveNow"
  | "toggleHelp"
  | "toggleSidebar"
  | "focusSearch"
  | "openPalette"
  /** キー割り当てを持たない。ツールバーとコマンドパレットから呼ぶ */
  | "toggleExport"
  /**
   * 履歴を開く（2.8-4）。キー割り当てを持たない。
   *
   * `Ctrl+H` はブラウザの履歴に取られており、奪うと利用者の他の操作を壊す。
   * ツールバー・コマンドパレット・設定シートから呼ぶ
   */
  | "toggleHistory";

/** `KeyboardEvent` のうち割り当ての判定に使う部分 */
export interface KeyStroke {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** 修飾キー。macOS でも同じ操作になるよう Ctrl と Command を同一視する */
function isCommand(stroke: KeyStroke): boolean {
  return stroke.ctrlKey || stroke.metaKey;
}

/**
 * 押されたキーに対応する操作を返す。割り当てが無ければ null。
 *
 * @param editing 文字入力中か。編集中は木の操作を横取りしない
 */
export function resolveShortcut(stroke: KeyStroke, editing: boolean): Command | null {
  if (stroke.altKey) return null;

  if (isCommand(stroke)) {
    const key = stroke.key.toLowerCase();
    if (key === "z") return stroke.shiftKey ? "redo" : "undo";
    if (key === "y") return "redo";
    if (key === "s") return "saveNow";
    if (key === "e") return "toggleMode";
    // サイドバーと検索は入力中でも効かせる。探し物は入力の途中で始まる
    if (key === "b") return "toggleSidebar";
    if (key === "f") return "focusSearch";
    if (key === "k") return "openPalette";
    if (key === "c" && stroke.shiftKey) return "copyForAi";
    if (key === "/") return "toggleCollapse";
    // Shift の有無で分ける。見落とすと反転のつもりで並べ替えが起きる
    if (key === "arrowup") return stroke.shiftKey ? "swapWithParent" : "reorderUp";
    if (key === "arrowdown") return "reorderDown";
    return null;
  }

  // ヘルプは文字入力中でも開ける。操作が分からなくなるのは入力の途中が多い
  if (stroke.key === "F1") return "toggleHelp";

  // ここから先は木そのものへの操作。文字入力中は割り当てない
  if (editing) return null;

  switch (stroke.key) {
    case "Enter":
      return "addSibling";
    case "Tab":
      return stroke.shiftKey ? "outdent" : "addChild";
    case " ":
    case "F2":
      return "beginEdit";
    case "?":
      return "toggleHelp";
    case "Delete":
      return "remove";
    case "ArrowUp":
      return "moveUp";
    case "ArrowDown":
      return "moveDown";
    case "ArrowLeft":
      return "moveLeft";
    case "ArrowRight":
      return "moveRight";
    default:
      return null;
  }
}

/**
 * 入力欄の中でキーが押されたか。
 * 中であれば、確定・取り消し以外はブラウザに任せる。
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
