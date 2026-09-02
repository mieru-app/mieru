import { normalizeForSearch, splitTerms } from "../state/search.js";
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
    title: "マップを探す",
    entries: [
      { keys: ["Ctrl + B"], commands: ["toggleSidebar"], description: "サイドバーを開閉する" },
      {
        keys: ["Ctrl + F"],
        commands: ["focusSearch"],
        description: "全マップを横断して検索する",
      },
      {
        keys: ["Ctrl + K"],
        commands: ["openPalette"],
        description: "コマンドパレット（操作とマップを名前で呼ぶ）",
      },
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

/**
 * コマンドパレット（`Ctrl+K`）に並べる操作。
 *
 * 方向キーによる移動は載せない。あれは押して動かすものであり、
 * 名前で呼び出す対象ではない。載せると一覧が長くなり、探す速度が落ちる。
 */
export interface CommandItem {
  command: Command;
  title: string;
  /** 表示するキー。割り当てが無ければ空文字列 */
  keys: string;
}

const PALETTE_COMMANDS: { command: Command; title: string }[] = [
  { command: "addChild", title: "子を追加する" },
  { command: "addSibling", title: "兄弟を追加する" },
  { command: "outdent", title: "階層を1つ上げる" },
  { command: "beginEdit", title: "選択中のノードを書き換える" },
  { command: "remove", title: "部分木ごと削除する" },
  { command: "toggleCollapse", title: "折り畳む・展開する" },
  { command: "undo", title: "元に戻す" },
  { command: "redo", title: "やり直す" },
  { command: "toggleMode", title: "キャンバス ⇄ アウトライン" },
  { command: "copyForAi", title: "AI 用 Markdown をコピーする" },
  { command: "toggleExport", title: "AI 用に出力する（モードを選ぶ）" },
  { command: "saveNow", title: "すぐ保存する" },
  { command: "toggleSidebar", title: "サイドバーを開閉する" },
  { command: "focusSearch", title: "全マップを検索する" },
  { command: "toggleHelp", title: "キー操作の一覧を開く" },
];

/** その操作に割り当てられたキーの表示。一覧と食い違わないよう同じ表から引く */
export function keysFor(command: Command): string {
  for (const group of SHORTCUT_GROUPS) {
    for (const entry of group.entries) {
      const at = entry.commands.indexOf(command);
      if (at !== -1) return entry.keys[at] ?? "";
    }
  }
  return "";
}

export const COMMAND_ITEMS: CommandItem[] = PALETTE_COMMANDS.map(({ command, title }) => ({
  command,
  title,
  keys: keysFor(command),
}));

/**
 * 入力で操作を絞り込む。
 *
 * 正規化と語の分け方は全マップ検索と同じ関数を使う。2か所で当たり方が違うと、
 * 利用者が使い分けを覚える羽目になる。
 */
export function filterCommands(query: string): CommandItem[] {
  const terms = splitTerms(query);
  if (terms.length === 0) return COMMAND_ITEMS;

  return COMMAND_ITEMS.filter((item) => {
    const haystack = normalizeForSearch(`${item.title} ${item.keys} ${item.command}`);
    return terms.every((term) => haystack.includes(term));
  });
}
