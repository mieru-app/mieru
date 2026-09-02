import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../../core/parse.js";
import { serializeMarkdown } from "../../core/serialize.js";
import { IMPORT_EXAMPLE, IMPORT_PROMPT } from "../import-prompt.js";
import { flatten } from "../tree.js";

/**
 * AI への取り込み指示の検証。
 *
 * **この指示文が嘘をつくと、AI の出力が取り込めない。** 変換規則を変えたときに
 * 指示文だけが古くなるのを防ぐため、例文を実際にパーサへ通して確かめる。
 * 文書ではなくコードに置いてあるのはこのためである。
 */

describe("例文がそのまま取り込める", () => {
  const { doc, warnings } = parseMarkdown(IMPORT_EXAMPLE, { id: "取り込み.md" });

  it("警告が1件も出ない", () => {
    // 警告が出るなら、指示に従った出力が欠けるということである
    expect(warnings).toEqual([]);
  });

  it("中心テーマが取れている", () => {
    expect(doc.root.label).toBe("新規事業の論点整理");
  });

  it("階層が意図どおりに組まれている", () => {
    expect(doc.root.children.map((node) => node.label)).toEqual(["市場", "リスク"]);
    expect(doc.root.children[0]?.children.map((node) => node.label)).toEqual([
      "TAM試算",
      "競合の空白地帯",
    ]);
  });

  it("ノートがラベルと分かれている", () => {
    const tam = flatten(doc.root).find((node) => node.label === "TAM試算");
    expect(tam?.note).toBe("既存レポートでは1,200億円。ただし定義が広すぎる疑いがある。");
  });

  it("保存してからは1バイトも変わらない", () => {
    const saved = serializeMarkdown(doc);
    expect(serializeMarkdown(parseMarkdown(saved).doc)).toBe(saved);
  });
});

describe("例文が指示に違反していない", () => {
  const lines = IMPORT_EXAMPLE.split("\n");

  it("`# ` の見出しは1つだけ", () => {
    expect(lines.filter((line) => line.startsWith("# "))).toHaveLength(1);
  });

  it("インデントは半角スペース2の倍数で、タブを使わない", () => {
    for (const line of lines) {
      if (line === "") continue;
      expect(line).not.toContain("\t");
      expect((line.length - line.trimStart().length) % 2).toBe(0);
    }
  });

  it("取り込めない要素を例に出していない", () => {
    for (const forbidden of ["|", "```", "> ", "---"]) {
      expect(IMPORT_EXAMPLE).not.toContain(forbidden);
    }
  });
});

describe("指示文", () => {
  it("例文を含んでいる", () => {
    expect(IMPORT_PROMPT).toContain(IMPORT_EXAMPLE);
  });

  it("貼り付けて使える長さに収まっている", () => {
    // 長い指示は読まれずに削られる。1画面に収まる範囲を保つ
    expect(IMPORT_PROMPT.split("\n").length).toBeLessThan(30);
  });
});

/**
 * 指示文は「これを使うと失われる」と言い切っている。
 * 言い切る以上、根拠を実測で押さえておく。前提の思い込みで書いた指示は、
 * 変換規則を変えた日から静かに嘘になる。
 */
describe("使うなと書いた要素が、実際にどうなるか", () => {
  it("引用とコードブロックは破棄される", () => {
    for (const source of ["# R\n\n- 枝\n\n> 引用\n", "# R\n\n- 枝\n\n```\nコード\n```\n"]) {
      const { warnings } = parseMarkdown(source);
      expect(warnings.map((warning) => warning.kind)).toContain("unsupported-element");
    }
  });

  it("表は失われないが、枝には分かれず説明文の塊になる", () => {
    const { doc, warnings } = parseMarkdown(
      "# R\n\n- 枝\n  | 見出し | 値 |\n  | --- | --- |\n  | a | 1 |\n",
    );

    expect(warnings).toEqual([]);
    const branch = doc.root.children[0];
    expect(branch?.label).toBe("枝");
    expect(branch?.children).toEqual([]);
    expect(branch?.note).toContain("| 見出し | 値 |");
  });
});
