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
  // 行頭の `[foo]:` はリンク参照定義として解析され、**枝ごと消える**
  ["リンク参照定義にしない", B + "[foo]: /url"],
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

/**
 * 引用とコードブロックの逐語保持（2026-09-05）。
 *
 * **2026-09-04 まで、この2つは警告を積んで丸ごと破棄されていた。**
 * `.md` が正本である以上、開いて保存しただけで他人の書いたものが
 * 消えてはいけない。エスケープの取りこぼしと同じ入口の、同じ種類の損失である。
 */
describe("引用とコードブロックが失われない", () => {
  const F = String.fromCharCode(96).repeat(3);

  /** 入力そのままで往復すること（1周目から動かない） */
  const KEPT: [string, string][] = [
    ["箇条書きの引用", "# 根\n\n- 枝\n  > 引用文\n  > 2行目\n"],
    ["柵付きコード", "# 根\n\n- 枝\n  " + F + "js\n  const a = 1;\n\n  b\n  " + F + "\n"],
    ["インデントコード", "# 根\n\n- 枝\n\n      a\n      b\n"],
    ["中心テーマ直下の引用", "# 根\n\n> 引用文\n"],
    ["中心テーマ直下のコード", "# 根\n\n" + F + "js\nconst a = 1;\n" + F + "\n"],
    ["引用の次に子ノード", "# 根\n\n- 枝\n  > q\n  - 子\n"],
    ["文字としての引用記号", "# 根\n\n- 枝\n  " + B + "> not quote\n"],
    ["コードの中の行末空白", "# 根\n\n- 枝\n  " + F + "\n  a  \n  " + F + "\n"],
    ["コードの中の箇条書き", "# 根\n\n- 枝\n  " + F + "\n  - これは枝ではない\n  " + F + "\n"],
  ];

  for (const [name, md] of KEPT) {
    it(`${name}: 本文が1バイトも変わらない`, () => {
      const saved = openAndSave(md);
      expect(saved).toContain(md.replace(/^# 根\n\n/, ""));
      expect(openAndSave(saved)).toBe(saved);
    });
  }

  it("破棄の警告が出ない", () => {
    for (const [, md] of KEPT) {
      const kinds = parseMarkdown(md).warnings.map((warning) => warning.kind);
      expect(kinds).not.toContain("unsupported-element");
    }
  });

  it("コードの中の箇条書きは子ノードにならない", () => {
    // **枝が勝手に増えるのは、消えるのと同じくらい困る**
    const { doc } = parseMarkdown("# 根\n\n- 枝\n  " + F + "\n  - a\n  - b\n  " + F + "\n");
    expect(doc.root.children.length).toBe(1);
    expect(doc.root.children[0]?.children).toEqual([]);
  });

  /**
   * **閉じない柵は後続の行を飲み込む。**
   * 逐語で出すと `- 子` がコードの中身になって枝が1本消えるため、
   * 対の無い柵はエスケープして文字にする（2026-09-05 に実測して決めた）。
   */
  it("閉じない柵を逐語で出さない", () => {
    const saved = openAndSave("# 根\n\n- 枝\n\n  " + F + "js\n  a\n\n  - 子\n");
    expect(saved).toContain(B + F + "js");
    expect(openAndSave(saved)).toBe(saved);
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
         * **空ラベルの入れ子の除外は 2026-09-05 に外した。**
         * `-` の下の `  -` が兄弟2つとして読み戻る不具合を直したため
         * （`serialize.ts` の空行の条件。記録は
         * `docs/ideas/2026-09-05-empty-label-nesting.md`）。
         * 除外を外したまま25万件を通している。
         */
        expect(openAndSave(first)).toBe(first);
      }),
      { numRuns: 20_000 },
    );
  }, 120_000);

  /**
   * **どんなノートを書いても、枝の本数が変わらない。**
   *
   * 引用とコードを逐語で出すようにした以上、出した記号が構造として
   * 読み戻される危険が生まれた。閉じない柵は後続の行を——子ノードまで——
   * 飲み込み、**枝が黙って消える**（2026-09-05 に実測）。
   * ここが最も怖いので、本数そのものを性質として固定する。
   */
  it("ノートに何を書いても枝の本数が変わらない", () => {
    const count = (node: { children: { children: unknown[] }[] }): number =>
      node.children.length + node.children.reduce((sum, child) => sum + count(child as never), 0);

    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 12 }), { maxLength: 6 }), (raw) => {
        const note = raw.map((line) => line.replace(/[\r\n]/g, " ")).join("\n");
        const md = "# 根\n\n- 枝1\n- 枝2\n";
        const parsed = parseMarkdown(md).doc;
        const branch = parsed.root.children[0];
        if (branch === undefined) return;
        branch.note = note;

        const saved = serializeMarkdown(parsed);
        expect(count(parseMarkdown(saved).doc.root)).toBe(2);
        // 2周目で形が動かないことも同時に見る
        expect(openAndSave(saved)).toBe(saved);
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
