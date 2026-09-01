import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../parse.js";
import { serializeMarkdown } from "../serialize.js";
import { docArb } from "./arbitraries.js";

/**
 * ラウンドトリップの強保証（docs/design.md 6.5）。
 *
 * 「正規化 Markdown → モデル → Markdown がバイト単位で一致する」ことを検証する。
 * これが本ツールの信頼性の生命線であり、この性質を壊す変更は
 * 他のテストが通っていても入れてはいけない。
 */

/** 一度シリアライズしたものは正規化済み Markdown である。そこから先は不動点でなければならない */
function assertIdempotent(md: string): void {
  const { doc } = parseMarkdown(md);
  const again = serializeMarkdown(doc);
  expect(again).toBe(md);
}

describe("ラウンドトリップの強保証", () => {
  it("ランダム生成した木構造 10,000 件で md → モデル → md が一致する", () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const md = serializeMarkdown(doc);
        assertIdempotent(md);
      }),
      { numRuns: 10_000 },
    );
    // 10,000 件の生成と往復には数秒かかるため既定の 5 秒では足りない
  }, 120_000);

  it("2周目・3周目も同じ結果になる（不動点であること）", () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const md1 = serializeMarkdown(doc);
        const md2 = serializeMarkdown(parseMarkdown(md1).doc);
        const md3 = serializeMarkdown(parseMarkdown(md2).doc);
        expect(md2).toBe(md1);
        expect(md3).toBe(md1);
      }),
      { numRuns: 2_000 },
    );
  }, 60_000);

  it("出力は必ず改行1つで終端する", () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const md = serializeMarkdown(doc);
        expect(md.endsWith("\n")).toBe(true);
        expect(md.endsWith("\n\n")).toBe(false);
      }),
      { numRuns: 1_000 },
    );
  });

  it("行末に空白を残さない", () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const md = serializeMarkdown(doc);
        expect(md).not.toMatch(/[ \t]+$/m);
      }),
      { numRuns: 1_000 },
    );
  });

  it("表示状態を本文へ書き出さない（設計原則2）", () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const md = serializeMarkdown(doc);
        const body = md.slice(md.indexOf("\n---\n") + 5);
        expect(body).not.toContain("collapsed:");
        expect(body).not.toContain("mm:");
      }),
      { numRuns: 1_000 },
    );
  });
});

describe("ルートラベル（見出し行）の個別ケース", () => {
  // 子ラベルは箇条書き行に出るが、ルートだけは ATX 見出し行に出る。
  // 見出し特有の落とし穴（閉じシーケンス）はここでしか踏まない
  const cases = [
    "! #",
    "a #",
    "a ##",
    "#",
    "見出し #",
    "a#",
    "a \\#",
    "# 先頭も末尾も #",
    "**太字**",
    "",
  ];

  for (const label of cases) {
    it(`ルートラベル ${JSON.stringify(label)}`, () => {
      const md = serializeMarkdown({
        meta: { id: "", title: "T", tags: [], created: "", updated: "", version: "" },
        root: { uid: "r", path: "", label, links: [], children: [] },
        view: { collapsed: [], colors: "auto" },
      });
      assertIdempotent(md);
      // ラベルが意味的にも復元されること
      expect(parseMarkdown(md).doc.root.label).toBe(label.trim());
    });
  }
});

describe("往復を壊しやすい個別ケース", () => {
  const cases: { name: string; label: string }[] = [
    { name: "行頭の見出し記号", label: "# 見出しに見える" },
    { name: "行頭の箇条書き記号", label: "- 箇条書きに見える" },
    { name: "行頭の引用記号", label: "> 引用に見える" },
    { name: "番号付き箇条書き", label: "1. 番号付きに見える" },
    { name: "水平線", label: "---" },
    { name: "コードフェンス", label: "```js" },
    { name: "バックスラッシュ単体", label: "\\" },
    { name: "エスケープ済みの見出し記号", label: "\\# すでにエスケープ済み" },
    { name: "バックスラッシュとアスタリスク", label: "a\\*b" },
    { name: "強調記法", label: "**太字のまま保持**" },
    { name: "横断リンク", label: "規制動向 → [[市場]]" },
    { name: "空文字列", label: "" },
  ];

  for (const { name, label } of cases) {
    it(name, () => {
      const md = serializeMarkdown({
        meta: { id: "", title: "T", tags: [], created: "", updated: "", version: "" },
        root: { uid: "r", path: "", label: "根", links: [], children: [] },
        view: { collapsed: [], colors: "auto" },
      });
      expect(md).toContain("# 根");

      const withLabel = serializeMarkdown({
        meta: { id: "", title: "T", tags: [], created: "", updated: "", version: "" },
        root: {
          uid: "r",
          path: "",
          label: "根",
          links: [],
          children: [{ uid: "c", path: "0", label, links: [], children: [] }],
        },
        view: { collapsed: [], colors: "auto" },
      });
      assertIdempotent(withLabel);

      // ラベルが意味的にも復元されること（エスケープが利用者に見えてはいけない）
      const restored = parseMarkdown(withLabel).doc.root.children[0];
      expect(restored?.label).toBe(label.trim());
    });
  }
});
