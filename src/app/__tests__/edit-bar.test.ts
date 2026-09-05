import { describe, expect, it } from "vitest";

import { EDIT_BAR_ITEMS, isEnabled } from "../edit-bar.js";
import { JA } from "../../state/strings/ja.js";
import { EN } from "../../state/strings/en.js";
import { commandItems } from "../shortcuts.js";

describe("EDIT_BAR_ITEMS", () => {
  it("6つを超えない", () => {
    // 360px の画面に 44px の当たり判定で並ぶ上限
    expect(EDIT_BAR_ITEMS.length).toBeLessThanOrEqual(6);
  });

  it("同じ操作を二度並べない", () => {
    const commands = EDIT_BAR_ITEMS.map((item) => item.command);
    expect(new Set(commands).size).toBe(commands.length);
  });

  it("すべて実在する操作である", () => {
    // 綴りを間違えた操作を並べると、押しても何も起きないボタンになる。
    // 狭い画面ではそれが唯一の入口なので、操作そのものが失われる
    const known = new Set(commandItems(JA).map((item) => item.command));
    for (const item of EDIT_BAR_ITEMS) expect(known).toContain(item.command);
  });

  it("説明はコマンドパレットと同じ言い回しを使う", () => {
    // 同じ操作が場所によって違う名前で呼ばれると、一覧が案内にならない。
    // **両方の言語で確かめる。** 片方だけずれるのが最も見つけにくい
    for (const table of [JA, EN]) {
      for (const item of EDIT_BAR_ITEMS) {
        const inPalette = commandItems(table).find((other) => other.command === item.command);
        expect(inPalette?.title).toBe(item.title(table));
      }
    }
  });

  it("字は短い", () => {
    // 全角を2、半角を1として数える。**英語の6文字は日本語の3文字より狭い**
    const width = (text: string): number =>
      [...text].reduce((sum, ch) => sum + (/[ -ÿ]/.test(ch) ? 1 : 2), 0);
    for (const table of [JA, EN]) {
      for (const item of EDIT_BAR_ITEMS) expect(width(item.label(table))).toBeLessThanOrEqual(8);
    }
  });

  it("構造編集の一式が揃っている", () => {
    // スマートフォンではここが唯一の入口である。欠けるとその操作ができなくなる
    const commands = new Set(EDIT_BAR_ITEMS.map((item) => item.command));
    for (const required of ["addChild", "addSibling", "beginEdit", "remove", "undo"]) {
      expect(commands).toContain(required);
    }
  });
});

describe("isEnabled", () => {
  const item = (command: string) => {
    const found = EDIT_BAR_ITEMS.find((entry) => entry.command === command);
    if (found === undefined) throw new Error(`${command} が編集バーに無い`);
    return found;
  };

  it("選択が要る操作は、選択が無いと押せない", () => {
    const state = { hasSelection: false, canUndo: true };
    expect(isEnabled(item("addChild"), state)).toBe(false);
    expect(isEnabled(item("remove"), state)).toBe(false);
  });

  it("選択があれば押せる", () => {
    const state = { hasSelection: true, canUndo: false };
    expect(isEnabled(item("addChild"), state)).toBe(true);
  });

  it("取り消しは選択と関係なく、戻せるものがあるかで決まる", () => {
    // 部分木を消した直後は選択が消えている。そこで押せないと戻す手段が無くなる
    expect(isEnabled(item("undo"), { hasSelection: false, canUndo: true })).toBe(true);
    expect(isEnabled(item("undo"), { hasSelection: true, canUndo: false })).toBe(false);
  });
});

describe("警告色", () => {
  it("取り返しの付かない操作にだけ印が付く", () => {
    // 消したノードは取り消しでしか戻らない。押す前に見分けが付く必要がある
    const danger = EDIT_BAR_ITEMS.filter((item) => item.danger === true);
    expect(danger.map((item) => item.command)).toEqual(["remove"]);
  });
});
