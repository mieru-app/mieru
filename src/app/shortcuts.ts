import { normalizeForSearch, splitTerms } from "../state/search.js";
import type { Strings } from "../state/strings/ja.js";
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
  /** 言語で変わるので、字ではなく引き方を持つ */
  description: (s: Strings) => string;
}

export interface ShortcutGroup {
  title: (s: Strings) => string;
  entries: ShortcutEntry[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: (s) => s.keys.groupCreate,
    entries: [
      { keys: ["Tab"], commands: ["addChild"], description: (s) => s.keys.addChild },
      { keys: ["Enter"], commands: ["addSibling"], description: (s) => s.keys.addSibling },
      { keys: ["Shift + Tab"], commands: ["outdent"], description: (s) => s.keys.outdent },
      {
        keys: ["Space", "F2"],
        commands: ["beginEdit", "beginEdit"],
        description: (s) => s.keys.beginEdit,
      },
      { keys: ["Delete"], commands: ["remove"], description: (s) => s.keys.remove },
    ],
  },
  {
    title: (s) => s.keys.groupMove,
    entries: [
      {
        keys: ["↑", "↓"],
        commands: ["moveUp", "moveDown"],
        description: (s) => s.keys.moveUpDown,
      },
      {
        keys: ["←", "→"],
        commands: ["moveLeft", "moveRight"],
        description: (s) => s.keys.moveLeftRight,
      },
      {
        keys: ["Ctrl + ↑", "Ctrl + ↓"],
        commands: ["reorderUp", "reorderDown"],
        description: (s) => s.keys.reorder,
      },
      {
        keys: ["Ctrl + Shift + ↑"],
        commands: ["swapWithParent"],
        description: (s) => s.keys.swapWithParent,
      },
      {
        keys: ["Ctrl + /"],
        commands: ["toggleCollapse"],
        description: (s) => s.keys.toggleCollapse,
      },
    ],
  },
  {
    title: (s) => s.keys.groupUndo,
    entries: [
      { keys: ["Ctrl + Z"], commands: ["undo"], description: (s) => s.keys.undo },
      { keys: ["Ctrl + Shift + Z"], commands: ["redo"], description: (s) => s.keys.redo },
      {
        keys: ["Ctrl + E"],
        commands: ["toggleMode"],
        description: (s) => s.keys.toggleMode,
      },
    ],
  },
  {
    title: (s) => s.keys.groupFind,
    entries: [
      { keys: ["Ctrl + B"], commands: ["toggleSidebar"], description: (s) => s.keys.toggleSidebar },
      {
        keys: ["Ctrl + F"],
        commands: ["focusSearch"],
        description: (s) => s.keys.focusSearchLong,
      },
      {
        keys: ["Ctrl + K"],
        commands: ["openPalette"],
        description: (s) => s.keys.palette,
      },
    ],
  },
  {
    title: (s) => s.keys.groupShare,
    entries: [
      {
        keys: ["Ctrl + Shift + C"],
        commands: ["copyForAi"],
        description: (s) => s.keys.copyForAiLong,
      },
      {
        keys: ["Ctrl + S"],
        commands: ["saveNow"],
        description: (s) => s.keys.saveNowLong,
      },
      {
        keys: ["?", "F1"],
        commands: ["toggleHelp", "toggleHelp"],
        description: (s) => s.keys.toggleHelpLong,
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

const PALETTE_COMMANDS: { command: Command; title: (s: Strings) => string }[] = [
  { command: "addChild", title: (s) => s.keys.addChild },
  { command: "addSibling", title: (s) => s.keys.addSibling },
  { command: "outdent", title: (s) => s.keys.outdent },
  { command: "swapWithParent", title: (s) => s.keys.swapWithParent },
  { command: "beginEdit", title: (s) => s.keys.beginEdit },
  { command: "remove", title: (s) => s.keys.remove },
  { command: "toggleCollapse", title: (s) => s.keys.toggleCollapse },
  { command: "undo", title: (s) => s.keys.undo },
  { command: "redo", title: (s) => s.keys.redo },
  { command: "toggleMode", title: (s) => s.keys.toggleMode },
  { command: "copyForAi", title: (s) => s.keys.copyForAi },
  { command: "toggleExport", title: (s) => s.keys.toggleExport },
  { command: "toggleHistory", title: (s) => s.keys.toggleHistory },
  { command: "saveNow", title: (s) => s.keys.saveNow },
  { command: "toggleSidebar", title: (s) => s.keys.toggleSidebar },
  { command: "focusSearch", title: (s) => s.keys.focusSearch },
  { command: "toggleHelp", title: (s) => s.keys.toggleHelp },
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

/** いまの言語での一覧。**言語が変わると字も変わるので、その場で組み立てる** */
export function commandItems(s: Strings): CommandItem[] {
  return PALETTE_COMMANDS.map(({ command, title }) => ({
    command,
    title: title(s),
    keys: keysFor(command),
  }));
}

/**
 * 入力で操作を絞り込む。
 *
 * 正規化と語の分け方は全マップ検索と同じ関数を使う。2か所で当たり方が違うと、
 * 利用者が使い分けを覚える羽目になる。
 */
export function filterCommands(query: string, s: Strings): CommandItem[] {
  const items = commandItems(s);
  const terms = splitTerms(query);
  if (terms.length === 0) return items;

  return items.filter((item) => {
    const haystack = normalizeForSearch(`${item.title} ${item.keys} ${item.command}`);
    return terms.every((term) => haystack.includes(term));
  });
}
