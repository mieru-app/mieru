import { describe, expect, it } from "vitest";

import type { MapMeta } from "../../core/types.js";
import { buildMapIndex } from "../../state/search.js";
import { TEMPLATES, templateMarkdown } from "../../state/templates.js";
import { buildPaletteItems } from "../command-palette.js";
import { resolveShortcut } from "../keymap.js";
import { COMMAND_ITEMS, filterCommands, keysFor } from "../shortcuts.js";

/**
 * コマンドパレット（`Ctrl+K`）の検証。
 *
 * ここもキー操作一覧と同じで、**表示が実際の割り当てと食い違ってはいけない。**
 * パレットは「操作の名前を思い出せないとき」に開くものなので、
 * そこに嘘があると復帰する手立てが無くなる。
 */

function meta(id: string, updated = "2026-09-01T00:00:00Z"): MapMeta {
  return { id, title: id.replace(/\.md$/, ""), tags: [], created: "", updated, version: "v1" };
}

const indexes = [
  buildMapIndex(meta("論点整理.md"), "---\ntitle: 論点整理\n---\n\n# 論点整理\n\n- 市場\n"),
  buildMapIndex(
    meta("読書メモ.md", "2026-08-01T00:00:00Z"),
    "---\ntitle: 読書メモ\n---\n\n# 読書メモ\n\n- 枝\n",
  ),
];

/** 表示文字列を1つの打鍵に読み替える。記号キーは `KeyboardEvent.key` の名前に直す */
const SPECIAL_KEYS: Record<string, string> = {
  Space: " ",
  // 矢印を落とすと、矢印を使う操作だけが検査を素通りする（2.9-2 で実際に起きた）
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  "←": "ArrowLeft",
  "→": "ArrowRight",
};

describe("操作の一覧", () => {
  it("載せた操作のキー表示は実際の割り当てと一致する", () => {
    for (const item of COMMAND_ITEMS) {
      if (item.keys === "") continue;
      const parts = item.keys.split("+").map((part) => part.trim());
      const label = parts[parts.length - 1] ?? "";
      const stroke = {
        key: SPECIAL_KEYS[label] ?? (label.length === 1 ? label.toLowerCase() : label),
        ctrlKey: parts.includes("Ctrl"),
        metaKey: false,
        shiftKey: parts.includes("Shift"),
        altKey: false,
      };
      expect(resolveShortcut(stroke, false)).toBe(item.command);
    }
  });

  it("キー割り当ての無い操作も載せる。パレットが唯一の入口になる", () => {
    const exportItem = COMMAND_ITEMS.find((item) => item.command === "toggleExport");
    expect(exportItem?.keys).toBe("");
  });

  it("方向キーの移動は載せない", () => {
    const commands = COMMAND_ITEMS.map((item) => item.command);
    expect(commands).not.toContain("moveUp");
    expect(commands).not.toContain("reorderUp");
  });

  it("割り当てが無ければ空文字列を返す", () => {
    expect(keysFor("toggleExport")).toBe("");
    expect(keysFor("undo")).toBe("Ctrl + Z");
  });
});

describe("絞り込み", () => {
  it("入力が無ければ全件", () => {
    expect(filterCommands("  ")).toEqual(COMMAND_ITEMS);
  });

  it("説明でもキーでも当たる", () => {
    expect(filterCommands("元に戻す").map((item) => item.command)).toEqual(["undo"]);
    expect(filterCommands("ctrl + z").map((item) => item.command)).toContain("undo");
  });

  it("全角で打っても当たる", () => {
    expect(filterCommands("ＡＩ").map((item) => item.command)).toContain("copyForAi");
  });
});

describe("パレットの項目", () => {
  it("入力が無ければ操作とマップだけを出す", () => {
    const items = buildPaletteItems("", indexes);
    const groups = new Set(items.map((item) => item.group));

    expect(groups).toEqual(new Set(["操作", "マップを開く"]));
    // 下敷きは新規作成のたびに使う物ではない。開いた直後の一覧を占めさせない
    expect(items.some((item) => item.kind === "template")).toBe(false);
  });

  it("マップは新しい順に並ぶ", () => {
    const maps = buildPaletteItems("", indexes).filter((item) => item.kind === "map");
    expect(maps.map((item) => item.title)).toEqual(["論点整理", "読書メモ"]);
  });

  it("操作・マップ・下敷きを1つの入力で引ける", () => {
    const items = buildPaletteItems("整理", indexes);
    expect(items.some((item) => item.kind === "map" && item.title === "論点整理")).toBe(true);

    const withTemplate = buildPaletteItems("振返り", indexes);
    expect(withTemplate.some((item) => item.kind === "template")).toBe(true);
  });

  it("項目の鍵は重ならない。上下キーの位置がずれないため", () => {
    const keys = buildPaletteItems("", indexes).map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("一致が無ければ空", () => {
    expect(buildPaletteItems("該当しない語", indexes)).toEqual([]);
  });
});

describe("下敷き（2-10）", () => {
  it("空のマップを先頭に置く。多くの場合はこれで足りる", () => {
    expect(TEMPLATES[0]?.id).toBe("blank");
    expect(TEMPLATES[0]?.markdown).toBeNull();
  });

  it("下敷きの Markdown は H1 と枝だけを持つ", () => {
    for (const template of TEMPLATES) {
      if (template.markdown === null) continue;
      expect(template.markdown.startsWith("# ")).toBe(true);
      expect(template.markdown).not.toContain("---");
    }
  });

  it("id から下敷きを引ける", () => {
    expect(templateMarkdown("swot")).toContain("- 強み");
  });

  it("空のマップと知らない id はどちらも「下敷き無し」になる", () => {
    // createMap は undefined を受けたときに初期内容を作る。null と分けても意味が無い
    expect(templateMarkdown("blank")).toBeUndefined();
    expect(templateMarkdown("存在しない")).toBeUndefined();
  });
});
