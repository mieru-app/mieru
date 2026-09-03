import type { Command } from "./keymap.js";

/**
 * 狭い画面に出す編集バーの中身（2.7-5）。
 *
 * **これは飾りではなく、指しか無い端末での唯一の入口である。**
 * 子や兄弟の追加・改名・削除・取り消しはすべてキーボードに割り当てられており
 * （`keymap.ts`）、`mind-elixir` の右クリックメニューとツールバーも切ってある
 * （設計書 7.4）。実機で確かめるまで、スマートフォンでは**読むことしかできなかった。**
 *
 * この一覧が嘘をつくと操作そのものが失われるため、`keymap.ts`・`shortcuts.ts`・
 * `command-palette.ts` と同じく、描画層にありながら自動テストを持つ（規約「層の分け方」）。
 *
 * **6つを超えないこと。** 360px の画面に 44px の当たり判定で並ぶ上限である。
 */

export interface EditBarItem {
  command: Command;
  /** 押しボタンの字。5つ並ぶので短く保つ */
  label: string;
  /** 読み上げと吹き出しに使う説明 */
  title: string;
  /**
   * 選択中のノードを要するか。
   * 取り消しだけは選択と関係なく効く（消した直後は選択が消えている）
   */
  needsSelection: boolean;
  /**
   * 取り返しの付きにくい操作か。字の色を変えて他と区別する。
   *
   * **並び順ではなくこの印で決める。** CSS 側で「右から2番目」と書くと、
   * 並べ替えた瞬間に無関係な押しボタンが警告色になる。
   */
  danger?: boolean;
}

export const EDIT_BAR_ITEMS: readonly EditBarItem[] = [
  { command: "addChild", label: "＋子", title: "子を追加する", needsSelection: true },
  { command: "addSibling", label: "＋兄弟", title: "兄弟を追加する", needsSelection: true },
  {
    command: "beginEdit",
    label: "名前",
    title: "選択中のノードを書き換える",
    needsSelection: true,
  },
  {
    command: "remove",
    label: "削除",
    title: "部分木ごと削除する",
    needsSelection: true,
    danger: true,
  },
  { command: "undo", label: "↶", title: "元に戻す", needsSelection: false },
];

/** その押しボタンを今押せるか */
export function isEnabled(item: EditBarItem, state: { hasSelection: boolean; canUndo: boolean }) {
  if (item.command === "undo") return state.canUndo;
  return item.needsSelection ? state.hasSelection : true;
}
