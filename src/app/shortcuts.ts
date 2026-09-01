import type { Command } from "./keymap.js";

/**
 * キー操作の一覧表示。
 *
 * 「全ての主要操作をキーボードで完結させる」（原則4）は、
 * **操作が見つけられて初めて成立する**。割り当てを実装しただけでは足りない。
 *
 * `keys` と `commands` は同じ長さで、要素どうしが1対1に対応する。
 * こうしておくと「表示しているキーが本当にその操作を起こすか」を
 * 機械的に検証できる。助けを求めて開いた一覧が嘘をつくのは、
 * 一覧が無いより悪い。
 */

export interface ShortcutEntry {
  /** 表示するキー。複数あれば「/」で並べて見せる */
  keys: string[];
  /** keys と同じ並びの操作 */
  commands: Command[];
  description: string;
}

export interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "枝を作る",
    entries: [
      { keys: ["Tab"], commands: ["addChild"], description: "子を追加する" },
      { keys: ["Enter"], commands: ["addSibling"], description: "兄弟を追加する" },
      { keys: ["Shift + Tab"], commands: ["outdent"], description: "階層を1つ上げる" },
      {
        keys: ["Space", "F2"],
        commands: ["beginEdit", "beginEdit"],
        description: "選択中のノードを書き換える",
      },
      { keys: ["Delete"], commands: ["remove"], description: "部分木ごと削除する" },
    ],
  },
  {
    title: "動かす・選ぶ",
    entries: [
      {
        keys: ["↑", "↓"],
        commands: ["moveUp", "moveDown"],
        description: "前後のノードへ移動する",
      },
      {
        keys: ["←", "→"],
        commands: ["moveLeft", "moveRight"],
        description: "親・最初の子へ移動する",
      },
      {
        keys: ["Ctrl + ↑", "Ctrl + ↓"],
        commands: ["reorderUp", "reorderDown"],
        description: "兄弟の順序を入れ替える",
      },
      { keys: ["Ctrl + /"], commands: ["toggleCollapse"], description: "折り畳む・展開する" },
    ],
  },
  {
    title: "元に戻す・表示",
    entries: [
      { keys: ["Ctrl + Z"], commands: ["undo"], description: "元に戻す" },
      { keys: ["Ctrl + Shift + Z"], commands: ["redo"], description: "やり直す" },
      { keys: ["Ctrl + E"], commands: ["toggleMode"], description: "キャンバス ⇄ アウトライン" },
    ],
  },
  {
    title: "AI へ渡す・保存",
    entries: [
      {
        keys: ["Ctrl + Shift + C"],
        commands: ["copyForAi"],
        description: "AI 用 Markdown をコピー（枝を選ぶとその部分だけ）",
      },
      {
        keys: ["Ctrl + S"],
        commands: ["saveNow"],
        description: "すぐ保存する（通常は自動保存）",
      },
      {
        keys: ["?", "F1"],
        commands: ["toggleHelp", "toggleHelp"],
        description: "この一覧を開閉する",
      },
    ],
  },
];
