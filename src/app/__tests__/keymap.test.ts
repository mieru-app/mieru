import { describe, expect, it } from "vitest";

import type { Command, KeyStroke } from "../keymap.js";
import { resolveShortcut } from "../keymap.js";

/**
 * キー割り当ての検証（docs/design.md 7.4）。
 * 割り当ての取り違えは操作の学習をやり直させるため、表と1対1で確かめる。
 */

function stroke(key: string, modifiers: Partial<KeyStroke> = {}): KeyStroke {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
}

describe("設計書 7.4 の割り当て", () => {
  const cases: [KeyStroke, Command][] = [
    [stroke("Enter"), "addSibling"],
    [stroke("Tab"), "addChild"],
    [stroke("Tab", { shiftKey: true }), "outdent"],
    [stroke(" "), "beginEdit"],
    [stroke("F2"), "beginEdit"],
    [stroke("Delete"), "remove"],
    [stroke("ArrowUp"), "moveUp"],
    [stroke("ArrowDown"), "moveDown"],
    [stroke("ArrowLeft"), "moveLeft"],
    [stroke("ArrowRight"), "moveRight"],
    [stroke("ArrowUp", { ctrlKey: true }), "reorderUp"],
    [stroke("ArrowDown", { ctrlKey: true }), "reorderDown"],
    [stroke("/", { ctrlKey: true }), "toggleCollapse"],
    [stroke("z", { ctrlKey: true }), "undo"],
    [stroke("z", { ctrlKey: true, shiftKey: true }), "redo"],
    [stroke("e", { ctrlKey: true }), "toggleMode"],
    [stroke("c", { ctrlKey: true, shiftKey: true }), "copyForAi"],
    [stroke("s", { ctrlKey: true }), "saveNow"],
  ];

  for (const [input, expected] of cases) {
    const label = [input.ctrlKey && "Ctrl", input.shiftKey && "Shift", input.key]
      .filter(Boolean)
      .join("+");
    it(`${label} は ${expected}`, () => {
      expect(resolveShortcut(input, false)).toBe(expected);
    });
  }
});

describe("修飾キーの扱い", () => {
  it("macOS の Command を Ctrl と同じに扱う", () => {
    expect(resolveShortcut(stroke("z", { metaKey: true }), false)).toBe("undo");
  });

  it("大文字でも同じ操作になる", () => {
    expect(resolveShortcut(stroke("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
  });

  it("Alt との組み合わせは受け付けない", () => {
    expect(resolveShortcut(stroke("Enter", { altKey: true }), false)).toBeNull();
  });

  it("割り当ての無いキーは null", () => {
    expect(resolveShortcut(stroke("a"), false)).toBeNull();
    expect(resolveShortcut(stroke("q", { ctrlKey: true }), false)).toBeNull();
  });
});

describe("文字入力中の扱い", () => {
  it("木を変える操作は横取りしない", () => {
    for (const key of ["Enter", "Tab", "Delete", "ArrowUp", " "]) {
      expect(resolveShortcut(stroke(key), true)).toBeNull();
    }
  });

  it("Undo と保存は入力中でも効く", () => {
    expect(resolveShortcut(stroke("z", { ctrlKey: true }), true)).toBe("undo");
    expect(resolveShortcut(stroke("s", { ctrlKey: true }), true)).toBe("saveNow");
    expect(resolveShortcut(stroke("c", { ctrlKey: true, shiftKey: true }), true)).toBe("copyForAi");
  });

  it("Ctrl+C は AI 出力に割り当てない（通常のコピーを壊さない）", () => {
    expect(resolveShortcut(stroke("c", { ctrlKey: true }), false)).toBeNull();
  });
});

describe("キー操作一覧の呼び出し", () => {
  it("? と F1 で開く", () => {
    expect(resolveShortcut(stroke("?", { shiftKey: true }), false)).toBe("toggleHelp");
    expect(resolveShortcut(stroke("F1"), false)).toBe("toggleHelp");
  });

  it("F1 は文字入力中でも効く（操作に迷うのは入力の途中が多い）", () => {
    expect(resolveShortcut(stroke("F1"), true)).toBe("toggleHelp");
  });

  it("? は文字入力中には奪わない（「?」を打てなくなるため）", () => {
    expect(resolveShortcut(stroke("?", { shiftKey: true }), true)).toBeNull();
  });
});
