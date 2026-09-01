import { describe, expect, it } from "vitest";

import type { Command, KeyStroke } from "../keymap.js";
import { resolveShortcut } from "../keymap.js";
import { SHORTCUT_GROUPS } from "../shortcuts.js";

/**
 * 一覧表示と実際の割り当てが食い違っていないことの検証。
 *
 * **助けを求めて開いた一覧が嘘をついているのは、一覧が無いより悪い。**
 * 表示の追加漏れ・割り当ての変更漏れをここで落とす。
 */

const entries = SHORTCUT_GROUPS.flatMap((group) => group.entries);

const SPECIAL_KEYS: Record<string, string> = {
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  "←": "ArrowLeft",
  "→": "ArrowRight",
  Space: " ",
};

/** 表示文字列（"Ctrl + Shift + Z" など）を1つの打鍵に読み替える */
function toStroke(keys: string): KeyStroke {
  const parts = keys.split("+").map((part) => part.trim());
  const label = parts[parts.length - 1] ?? "";
  return {
    key: SPECIAL_KEYS[label] ?? (label.length === 1 ? label.toLowerCase() : label),
    ctrlKey: parts.includes("Ctrl"),
    metaKey: false,
    shiftKey: parts.includes("Shift"),
    altKey: false,
  };
}

describe("キー操作一覧", () => {
  for (const entry of entries) {
    it(`${entry.keys.join(" / ")} は表示どおりの操作を起こす`, () => {
      expect(entry.keys).toHaveLength(entry.commands.length);
      for (const [index, keys] of entry.keys.entries()) {
        expect(resolveShortcut(toStroke(keys), false)).toBe(entry.commands[index]);
      }
    });
  }

  it("Phase 1 の操作を漏れなく載せている", () => {
    // 載せていない操作があるなら、それは「見つけられない機能」である
    const listed = new Set(entries.flatMap((entry) => entry.commands));
    const expected: Command[] = [
      "addChild",
      "addSibling",
      "outdent",
      "beginEdit",
      "remove",
      "moveUp",
      "moveDown",
      "moveLeft",
      "moveRight",
      "reorderUp",
      "reorderDown",
      "toggleCollapse",
      "undo",
      "redo",
      "toggleMode",
      "copyForAi",
      "saveNow",
      "toggleHelp",
    ];
    for (const command of expected) expect(listed).toContain(command);
  });

  it("同じキーを2か所に載せない", () => {
    const keys = entries.flatMap((entry) => entry.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("説明文が空でない", () => {
    for (const entry of entries) expect(entry.description.length).toBeGreaterThan(0);
  });
});
