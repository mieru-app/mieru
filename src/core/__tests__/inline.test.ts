import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  inlineToPlainText,
  parseInline,
  renderInlineHtml,
  safeHref,
} from "../inline.js";

/**
 * インライン記法の表示の検証（2.10-1）。
 *
 * **Phase 2.6 以降、描くのは自分が書いた `.md` とは限らない。**
 * したがってここでの主眼は「見た目が正しいか」より
 * **「出してはいけない物が出ていないか」**にある。
 */

describe("記法を見える形にする", () => {
  it("強調・斜体・コード・打ち消し", () => {
    expect(renderInlineHtml("**強調**")).toBe("<strong>強調</strong>");
    expect(renderInlineHtml("*斜体*")).toBe("<em>斜体</em>");
    expect(renderInlineHtml("`コード`")).toBe("<code>コード</code>");
    // `remark-gfm` を入れていないので text で届く。自前で切っている
    expect(renderInlineHtml("~~打ち消し~~")).toBe("<del>打ち消し</del>");
  });

  it("入れ子を保つ", () => {
    expect(renderInlineHtml("**外*内***")).toBe("<strong>外<em>内</em></strong>");
  });

  it("対になっていない記号は文字として出す", () => {
    expect(renderInlineHtml("~~片方だけ")).toBe("~~片方だけ");
    expect(renderInlineHtml("**閉じ忘れ")).toBe("**閉じ忘れ");
  });

  it("コードの中は記法として解釈しない", () => {
    expect(renderInlineHtml("`**これは強調ではない**`")).toBe(
      "<code>**これは強調ではない**</code>",
    );
  });

  it("横断リンクの記法には触れない", () => {
    // `[[対象]]` は矢印として描く物であり、ここで消してはいけない（F-17）
    expect(renderInlineHtml("見出し [[対象]]")).toBe("見出し [[対象]]");
  });

  it("空文字列は何も出さない", () => {
    expect(parseInline("")).toEqual([]);
    expect(renderInlineHtml("")).toBe("");
  });
});

describe("出してはいけない物を出さない", () => {
  it("HTML は文字として出す", () => {
    expect(renderInlineHtml("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("スクリプトを組み立てられない", () => {
    // **要素にならず、文字になる。** 字面が残ること自体は正しい。
    // 「その文字列を含まない」で確かめると、書いた物を見せる仕様と衝突する
    expect(renderInlineHtml("<img src=x onerror=alert(1)>")).toBe(
      "&lt;img src=x onerror=alert(1)&gt;",
    );
  });

  it("`javascript:` のリンクはリンクにしない", () => {
    const html = renderInlineHtml("[危険](javascript:alert(1))");
    expect(tagsIn(html)).toEqual([]);
    // 書いてあった文字は見せる。黙って消すと何が書かれていたか分からない
    expect(html).toBe("[危険](javascript:alert(1))");
  });

  it("画像は読み込まない（外部への通信口を作らない）", () => {
    // NF-43: 第三者のリソースを読み込まない
    const html = renderInlineHtml("![画像](https://example.com/x.png)");
    expect(tagsIn(html)).toEqual([]);
    expect(html).toBe("![画像](https://example.com/x.png)");
  });

  it("引用符で属性から抜け出せない", () => {
    const html = renderInlineHtml('[x](https://example.com/" onmouseover="alert(1))');
    // 属性の外へ出た印は「タグが増えること」に現れる。数と形で確かめる
    for (const href of hrefsIn(html)) expect(safeHref(href)).not.toBeNull();
  });
});

describe("開いてよい URL の判定", () => {
  it("http / https / mailto と頁内位置は通す", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com");
    expect(safeHref("#section")).toBe("#section");
  });

  it("危険なスキームを落とす", () => {
    for (const raw of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "file:///etc/passwd",
    ]) {
      expect(safeHref(raw)).toBeNull();
    }
  });

  it("空白や制御文字を挟んだ抜け道を塞ぐ", () => {
    // ブラウザは詰めて解釈する。素朴な前方一致だけでは擦り抜ける
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
    expect(safeHref("java\nscript:alert(1)")).toBeNull();
    expect(safeHref(" javascript:alert(1)")).toBeNull();
    expect(safeHref("java script:alert(1)")).toBeNull();
    expect(safeHref("java\u0000script:alert(1)")).toBeNull();
  });

  it("スキームの無い相対パスは通さない", () => {
    expect(safeHref("../secret")).toBeNull();
    expect(safeHref("//example.com")).toBeNull();
    expect(safeHref("")).toBeNull();
  });

  it("通す URL には必ず noopener を付ける", () => {
    // 付けないと開いた先から window.opener 経由でこちらを操作できる
    const html = renderInlineHtml("[x](https://example.com)");
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe("ブロック記法を描かない", () => {
  it("段落1つに収まらない入力は文字として返す", () => {
    // ラベルに書かれた `# 見出し` を見出しとして描くと、木の形と表示が食い違う
    for (const text of ["# 見出し", "- 項目", "> 引用", "```\nコード\n```"]) {
      expect(inlineToPlainText(text)).toBe(text);
    }
  });

  it("1行の三連バッククォートはインラインコードである（CommonMark の定義）", () => {
    // ブロックだと思い込んで検査を書くと、テストの側が間違う
    expect(renderInlineHtml("```コード```")).toBe("<code>コード</code>");
  });
});

/**
 * 出力に現れるタグを全て取り出す。
 *
 * **「危ないものが含まれていない」ではなく「現れたものが全て許可リストの中にある」で
 * 確かめる**（規約 `.claude/rules/core-engine.md`）。前者は、思い付かなかった
 * 字面をそのまま見逃す。
 */
function tagsIn(html: string): string[] {
  return [...html.matchAll(/<[^>]*>?/g)].map((match) => match[0]);
}

/** 出力に現れた href を、逃がしを戻した形で取り出す */
function hrefsIn(html: string): string[] {
  return [...html.matchAll(/<a href="([^"]*)"/g)].map((match) =>
    (match[1] ?? "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&"),
  );
}

/** 出しても構わないタグ。これ以外が1つでも現れたら失敗させる */
const ALLOWED_TAGS = new Set([
  "<strong>",
  "</strong>",
  "<em>",
  "</em>",
  "<del>",
  "</del>",
  "<code>",
  "</code>",
  "</a>",
]);

/** 開始タグ `<a ...>` は href が変わるので形で照合する */
const ANCHOR =
  /^<a href="[^"<>&]*(?:&(?:amp|quot|#39|lt|gt);[^"<>&]*)*" target="_blank" rel="noopener noreferrer">$/;

describe("性質", () => {
  it("どんな文字列でも、出力に現れるタグは許可した物だけである", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        for (const tag of tagsIn(renderInlineHtml(text))) {
          expect(ALLOWED_TAGS.has(tag) || ANCHOR.test(tag)).toBe(true);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it("記法を含む文字列を混ぜても、現れるタグは許可した物だけである", () => {
    // 素の乱数列では `**` や `](` がまず生まれない。記法の断片を混ぜて狙い撃つ
    const pieces = fc.constantFrom(
      "**",
      "*",
      "_",
      "`",
      "~~",
      "[",
      "](",
      ")",
      "<",
      ">",
      '"',
      "'",
      "&",
      "\\",
      "javascript:",
      "https://a",
      "a",
      " ",
    );
    fc.assert(
      fc.property(fc.array(pieces, { maxLength: 24 }), (parts) => {
        const html = renderInlineHtml(parts.join(""));
        for (const tag of tagsIn(html)) {
          expect(ALLOWED_TAGS.has(tag) || ANCHOR.test(tag)).toBe(true);
        }
        // **字面ではなく置き場所で確かめる。** `javascript:` が文字として
        // 見えているのは正しい。危ないのは href の中にあるときだけである
        for (const href of hrefsIn(html)) expect(safeHref(href)).not.toBeNull();
      }),
      { numRuns: 20000 },
    );
    /*
     * **上限を明示する。** 2万件でおよそ5秒かかり、既定の 5000ms に張り付いていた。
     * 機械の混み具合だけで落ちる状態になっており、**反例が出たのか遅かったのかを
     * 見分けられなかった**（2026-09-05 に3回中2回落ちて発覚）。
     * 件数を減らすと守りが薄くなるので、上限の方を上げる。
     */
  }, 60_000);

  it("見た目の文字列に記号は足されない", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        // 記法を外した文字列が元より長くなることはない
        expect(inlineToPlainText(text).length).toBeLessThanOrEqual(text.length);
      }),
      { numRuns: 2000 },
    );
  });
});

describe("HTML の逃がし", () => {
  it("5つの文字を実体参照へ変える", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("二重に逃がさない順序になっている", () => {
    // & を先に処理しないと &lt; が &amp;lt; になる
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});
