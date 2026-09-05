import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseBlocks } from "../block.js";

/**
 * ノート本文のブロック記法の検証（2.10-4）。
 *
 * **最も守りたいのは「書いたものが消えないこと」である。**
 * 表として読めなかった塊を捨ててしまうと、画面から内容が消える。
 */

const TABLE = "| 列A | 列B |\n|---|---|\n| 1 | 2 |";

describe("表として読む", () => {
  it("見出しと本体に分ける", () => {
    expect(parseBlocks(TABLE)).toEqual([
      {
        kind: "table",
        header: ["列A", "列B"],
        align: ["left", "left"],
        rows: [["1", "2"]],
      },
    ]);
  });

  it("寄せの指定を読む", () => {
    const blocks = parseBlocks("| a | b | c |\n|:---|:---:|---:|\n| 1 | 2 | 3 |");
    expect(blocks[0]).toMatchObject({ align: ["left", "center", "right"] });
  });

  it("外側の縦棒が無くても読む", () => {
    const blocks = parseBlocks("a | b\n---|---\n1 | 2");
    expect(blocks[0]).toMatchObject({ header: ["a", "b"], rows: [["1", "2"]] });
  });

  it("区切り行の桁数が足りなければ残りは左寄せにする", () => {
    // 見出しより区切りが短い表は現実に書かれる。**桁の指定が1つずれると描画がずれる**
    const blocks = parseBlocks("| a | b | c |\n|:--|\n| 1 | 2 | 3 |");
    expect(blocks[0]).toMatchObject({ align: ["left", "left", "left"] });
  });

  it("桁数が合わない行は見出しに合わせる", () => {
    const blocks = parseBlocks("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |");
    expect(blocks[0]).toMatchObject({
      rows: [
        ["1", ""],
        ["1", "2"],
      ],
    });
  });

  it("2行目が区切り行でなければ表にしない", () => {
    // `A | B` と書いた普通の文を表にしてしまうと、書いた見た目と食い違う
    const blocks = parseBlocks("りんご | みかん\nどちらも果物");
    expect(blocks[0]?.kind).toBe("paragraph");
  });

  it("縦棒の無い行は表にしない", () => {
    expect(parseBlocks("見出し\n---")[0]?.kind).toBe("paragraph");
  });
});

describe("段落として読む", () => {
  it("空行で段落を分ける", () => {
    expect(parseBlocks("ひとつめ。\n\nふたつめ。")).toEqual([
      { kind: "paragraph", lines: ["ひとつめ。"] },
      { kind: "paragraph", lines: ["ふたつめ。"] },
    ]);
  });

  it("空行を挟まない改行は1つの段落の中に残す", () => {
    expect(parseBlocks("一行目\n二行目")).toEqual([
      { kind: "paragraph", lines: ["一行目", "二行目"] },
    ]);
  });

  it("表と段落が混ざっていても順序を保つ", () => {
    const blocks = parseBlocks("説明文。\n\n" + TABLE + "\n\nあとがき。");
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "table", "paragraph"]);
  });

  it("空の入力は空の並びになる", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("\n\n\n")).toEqual([]);
  });
});

/**
 * 引用とコードは 2026-09-05 まで破棄されていた。保存できるようにした以上、
 * **画面にも出さなければ直したことにならない。**
 */
describe("引用とコードとして読む", () => {
  const TICK = String.fromCharCode(96).repeat(3);

  it("引用は記号を外して中身を返す", () => {
    expect(parseBlocks("> 一行目\n> 二行目")).toEqual([
      { kind: "quote", lines: ["一行目", "二行目"] },
    ]);
  });

  it("記号だけの引用も空行として残す", () => {
    expect(parseBlocks(">")).toEqual([{ kind: "quote", lines: [""] }]);
  });

  it("柵付きコードは言語と中身に分ける", () => {
    expect(parseBlocks(TICK + "js\nconst a = 1;\n" + TICK)).toEqual([
      { kind: "code", lang: "js", text: "const a = 1;" },
    ]);
  });

  it("言語が無ければ lang を付けない", () => {
    expect(parseBlocks(TICK + "\na\n" + TICK)).toEqual([{ kind: "code", text: "a" }]);
  });

  it("インデントコードは半角4つを外す", () => {
    expect(parseBlocks("    a\n      b")).toEqual([{ kind: "code", text: "a\n  b" }]);
  });

  it("対になっていない柵は段落のまま残す", () => {
    // **逐語で出せない形は保存側もエスケープする。** 表示だけコードにすると食い違う
    expect(parseBlocks(TICK + "js\na")).toEqual([{ kind: "paragraph", lines: [TICK + "js", "a"] }]);
  });

  it("段落・引用・コードが混ざっても順序を保つ", () => {
    const note = "説明。\n\n> 引用\n\n" + TICK + "\nコード\n" + TICK + "\n\nあとがき。";
    expect(parseBlocks(note).map((block) => block.kind)).toEqual([
      "paragraph",
      "quote",
      "code",
      "paragraph",
    ]);
  });
});

describe("性質", () => {
  /** ブロックに現れる全ての文字列を集める */
  function textsIn(note: string): string[] {
    return parseBlocks(note).flatMap((block) => {
      if (block.kind === "paragraph" || block.kind === "quote") return block.lines;
      if (block.kind === "code") return block.text.split("\n");
      return [...block.header, ...block.rows.flat()];
    });
  }

  it("どんなノートでも、中身のある行は必ずどこかへ現れる", () => {
    // **書いたものが消えるのが最も困る。** 表として読めなかった塊は
    // 段落として残さなければならない
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 12 }), (lines) => {
        const note = lines.join("\n");
        // 桁へ割るときに空白と縦棒は落ちうる。**両側から同じ文字を除いて比べる。**
        // 片側だけ正規化すると、段落として残った行を「消えた」と誤って数える
        const bare = (text: string): string => text.replace(/[|\s]/g, "");
        const seen = bare(textsIn(note).join(""));
        /*
         * 表の区切り行（`|---|:--:|`）は**構文であって内容ではない**ので、
         * どこにも現れなくてよい。罫線を引く文字だけで出来た行がそれに当たる。
         * 実装を写さずに見分けられる形にしてある
         */
        const isRule = (line: string): boolean => /^[|\-:\s]*$/.test(line);
        /*
         * 引用の `>` と柵の ``` も**構文であって内容ではない**（2026-09-05）。
         * 中身は残さなければならないが、記号そのものは残らなくてよい
         */
        const marker = (text: string): string =>
          text.replace(/^>[ \t]?/, "").replace(/^(`{3,}|~{3,}).*$/, "");
        for (const line of lines) {
          const content = bare(marker(line));
          if (content !== "" && !isRule(line)) expect(seen).toContain(content);
        }
      }),
      { numRuns: 5000 },
    );
  });

  it("決めた4種類以外を返さない", () => {
    fc.assert(
      fc.property(fc.string(), (note) => {
        for (const block of parseBlocks(note)) {
          expect(["paragraph", "table", "quote", "code"]).toContain(block.kind);
        }
      }),
      { numRuns: 5000 },
    );
  });

  it("表の寄せの数は必ず見出しの桁数と一致する", () => {
    // 食い違うと、描くときに桁の指定が1つずれる
    fc.assert(
      fc.property(fc.string(), (note) => {
        for (const block of parseBlocks(note)) {
          if (block.kind === "table") expect(block.align).toHaveLength(block.header.length);
        }
      }),
      { numRuns: 5000 },
    );
  });
});
