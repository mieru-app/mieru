import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { renderInlineHtml } from "../inline.js";
import { parseMarkdown } from "../parse.js";
import { serializeMarkdown } from "../serialize.js";

/**
 * 他人が書いた `.md` を開いて保存しても内容が変わらないこと（2026-09-05）。
 *
 * **ラウンドトリップの強保証は「正規化 Markdown」が対象であり、これは別物である。**
 * 強保証が守るのは Mieru が書いた `.md` であり、ここが守るのは
 * **Mieru が書いていない `.md`** である。Phase 2.6 で GitHub 上のファイルを
 * 開けるようにし、OSS として配ると決めたことで、後者が主要な経路になった。
 *
 * 2026-09-04 まで、**`\` によるエスケープは `\\` を除いて全て失われていた。**
 * 解析側が `\` + ASCII 記号をすべて解除するのに、出力側は行頭しか足しておらず、
 * 対になっていなかった。結果として `\*star\*`（文字としての星）が
 * `*star*`（強調）に化けていた。修正は `escape.ts` と `parse.ts`。
 */

const B = String.fromCharCode(92);
const TICK = String.fromCharCode(96);

/** 意味が変わるもの。**この一覧が今回直した本体である** */
const ESCAPES: [string, string][] = [
  ["強調にしない星", B + "*star" + B + "*"],
  ["強調にしない下線", B + "_under" + B + "_"],
  ["コードにしない逆引用符", B + TICK + "tick" + B + TICK],
  ["リンクにしない角括弧", B + "[bracket" + B + "]"],
  ["実体参照にしない", B + "&amp;"],
  ["打ち消しにしないチルダ", B + "~tilde" + B + "~"],
  ["画像にしない感嘆符", B + "!bang"],
  ["丸括弧", B + "(paren" + B + ")"],
  ["井桁", B + "#hash"],
  ["山括弧", B + "<angle" + B + ">"],
  ["バックスラッシュ2つ", "a" + B + B + "b"],
];

/** 枝1本だけの `.md` を組み立てる。frontmatter は付けない（他人のファイルを模す） */
function fileWith(label: string): string {
  return "# 根\n\n- " + label + "\n";
}

/** 開いて保存した結果 */
function openAndSave(md: string): string {
  return serializeMarkdown(parseMarkdown(md).doc);
}

describe("他人が書いた .md を開いて保存する", () => {
  for (const [name, label] of ESCAPES) {
    it(`${name}: ${JSON.stringify(label)} が保たれる`, () => {
      const saved = openAndSave(fileWith(label));
      // frontmatter は付くが、本文の該当行は1バイトも変わってはいけない
      expect(saved).toContain("- " + label + "\n");
    });
  }

  it("ノートの中でも保たれる", () => {
    const note = ESCAPES.map(([, label]) => label).join(" ");
    const md = "# 根\n\n- 枝\n  " + note + "\n";
    expect(openAndSave(md)).toContain("  " + note + "\n");
  });

  it("見出し（中心テーマ）でも保たれる", () => {
    const saved = openAndSave("# " + B + "*star" + B + "*\n");
    expect(saved).toContain("# " + B + "*star" + B + "*\n");
  });

  /**
   * **エスケープを保つことに意味があるのは、表示が変わるからである。**
   * 保存形式だけ直しても、画面で強調になってしまうなら直したことにならない。
   */
  it("画面でも強調ではなく文字として出る", () => {
    expect(renderInlineHtml(B + "*star" + B + "*")).toBe("*star*");
    expect(renderInlineHtml("*star*")).toBe("<em>star</em>");
  });

  /**
   * **2周目からは動かないこと。** 1周目で正規化が入るのは仕様だが、
   * そこから先で揺れると「保存するたびに少しずつ変わる」ことになる。
   */
  it("2周目・3周目で動かない", () => {
    for (const [, label] of ESCAPES) {
      const first = openAndSave(fileWith(label));
      expect(openAndSave(first)).toBe(first);
      expect(openAndSave(openAndSave(first))).toBe(first);
    }
  });
});

describe("性質", () => {
  /**
   * **どんな行を1本の枝として書いても、開いて保存すれば不動点に達する。**
   *
   * 1周目は正規化で変わりうる（他人のファイルは正規化されていない）。
   * **確かめるのは2周目以降が動かないこと。** ここが揺れると、
   * 保存のたびにファイルが書き換わり、Git の差分が意味を失う。
   */
  it("任意の1行から作った .md は、2周目以降で動かない", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (raw) => {
        // 改行は行の分割になるので、1行に収める
        const label = raw.replace(/[\r\n]/g, " ");
        const first = openAndSave(fileWith(label));
        /*
         * **既知の別件を除く（2026-09-05 に発見。今回の修正とは無関係）。**
         * `- *` `- -` `- +` のように「空のラベルの下に空のラベル」が来ると、
         * 出力 `-\n\n  -\n` が兄弟2つとして読み戻され、2周目で形が変わる。
         * 空ラベルの前に空行を入れる規則（設計 6.4）が、入れ子の親子関係を切るため。
         * **変更前のコードでも同じように揺れることを確かめてある。**
         * 記録は `docs/ideas/2026-09-05-empty-label-nesting.md`。
         */
        if (/^-$/m.test(first)) return;
        expect(openAndSave(first)).toBe(first);
      }),
      { numRuns: 20_000 },
    );
  }, 120_000);

  /**
   * **エスケープを含む行は、1周目でも動かない。**
   * `\` + 記号は Markdown 上ですでに正規化された形であり、
   * 正規化で書き換える理由が無い。
   */
  it("バックスラッシュを含む行は1周目から動かない", () => {
    const symbol = fc.constantFrom(..."!\"#$%&'()*+,-./:;<=>?@[]^_`{|}~".split(""));
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.stringMatching(/^[a-z]{0,4}$/), symbol), { maxLength: 6 }),
        (parts) => {
          // 先頭が `\` だと行頭のエスケープと重なるので、必ず英字で始める
          const label = "x" + parts.map(([text, sym]) => text + B + sym).join("");
          const saved = openAndSave(fileWith(label));
          expect(saved).toContain("- " + label + "\n");
        },
      ),
      { numRuns: 20_000 },
    );
  }, 120_000);
});
