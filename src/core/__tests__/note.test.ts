import { describe, expect, it } from "vitest";

import {
  classifyNoteLines,
  escapeNote,
  normalizeQuote,
  startsWithIndentedCode,
  unescapeNote,
} from "../note.js";

/**
 * ノート行の分類（2026-09-05）。
 *
 * **ここの判断を、保存側・読み込み側・表示側の3箇所が使う。**
 * 取り違えると「枝が消える」「保存はできているのに画面に出ない」の
 * どちらかが起きるため、境目の形を1つずつ固定する。
 *
 * 仕様の正本: `docs/design/data-format.md` 6.4
 */

const B = String.fromCharCode(92);
const TICK = String.fromCharCode(96);
const F = TICK.repeat(3);

/** 分類を1文字ずつの並びで見る。`t` が本文行、`v` が逐語行 */
function kinds(lines: string[]): string {
  return classifyNoteLines(lines)
    .map((line) => (line.kind === "text" ? "t" : "v"))
    .join("");
}

/** 塊の番号だけを取り出す。番号が同じ行は同じ塊 */
function blocks(lines: string[]): number[] {
  return classifyNoteLines(lines).map((line) => line.block);
}

describe("コードフェンス", () => {
  it("対になっていれば逐語で出す", () => {
    expect(kinds([F + "js", "a", F])).toBe("vvv");
  });

  /**
   * **対が無い柵を逐語で出してはいけない。**
   * 閉じない柵は後続の行を——子ノードまで——飲み込む（2026-09-05 に実測）。
   */
  it("対が無ければ本文行として扱う", () => {
    expect(kinds([F + "js", "a"])).toBe("tt");
  });

  it("違う文字では閉じない", () => {
    expect(kinds([F, "a", "~~~"])).toBe("ttt");
  });

  it("開きより短い柵では閉じない", () => {
    expect(kinds([TICK.repeat(4), "a", F])).toBe("ttt");
  });

  it("情報文字列が付いた柵は閉じ柵にならない", () => {
    expect(kinds([F, "a", F + "js"])).toBe("ttt");
  });

  it("逆引用符の柵は情報文字列に逆引用符を持てない（CommonMark）", () => {
    expect(kinds([F + "a" + TICK, "b", F])).toBe("ttt");
  });

  it("チルダの柵も対になる", () => {
    expect(kinds(["~~~", "a", "~~~"])).toBe("vvv");
  });

  it("開きより長い柵で閉じてよい", () => {
    expect(kinds([F, "a", TICK.repeat(5)])).toBe("vvv");
  });

  it("柵の中の空行も同じ塊に入れる", () => {
    expect(kinds([F, "a", "", "b", F])).toBe("vvvvv");
    expect(blocks([F, "a", "", "b", F])).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("引用", () => {
  it("続く `>` の行までが1つの塊", () => {
    expect(kinds(["> a", "> b", "c"])).toBe("vvt");
    expect(blocks(["> a", "> b", "c"])).toEqual([0, 0, 1]);
  });

  it("記号だけの行も引用として扱う", () => {
    expect(kinds([">"])).toBe("v");
  });

  it("柵の中の `>` は引用にしない", () => {
    expect(blocks([F, "> a", F])).toEqual([0, 0, 0]);
  });
});

describe("インデントコード", () => {
  it("先頭なら逐語で出す", () => {
    expect(kinds(["    a"])).toBe("v");
  });

  it("空行の後なら逐語で出す", () => {
    expect(kinds(["x", "", "    a"])).toBe("ttv");
  });

  /**
   * **インデントコードは段落を中断できない。**
   * 直前が本文行ならそれは遅延継続行であり、逐語で出すと段落へ吸われる。
   */
  it("直前が本文行なら段落の続きとして扱う", () => {
    expect(kinds(["x", "    a"])).toBe("tt");
  });

  it("途中の空行では途切れない", () => {
    expect(kinds(["    a", "", "    b", "", "x"])).toBe("vvvtt");
  });

  it("半角3つでは足りない", () => {
    expect(kinds(["   a"])).toBe("t");
  });

  it("先頭がインデントコードかどうかを答える", () => {
    expect(startsWithIndentedCode("    a")).toBe(true);
    expect(startsWithIndentedCode("x")).toBe(false);
    // 逐語ではあるが、インデントコードではない
    expect(startsWithIndentedCode("> a")).toBe(false);
    expect(startsWithIndentedCode("")).toBe(false);
  });
});

describe("段落の塊", () => {
  it("空行で分かれる", () => {
    expect(blocks(["a", "", "b"])).toEqual([0, -1, 1]);
  });

  it("空行を挟まない行は同じ塊", () => {
    expect(blocks(["a", "b"])).toEqual([0, 0]);
  });

  /**
   * **本文行は必ず段落の続きになる。**
   * 行頭が `#` でも `- ` でもエスケープされるため、そこで塊は切れない。
   */
  it("行頭が記号でも段落は切れない", () => {
    expect(blocks(["a", "- b", "# c"])).toEqual([0, 0, 0]);
  });

  it("逐語の塊が段落を切る", () => {
    const lines = ["a", "> q", "b"];
    expect(kinds(lines)).toBe("tvt");
    const [first, quote, last] = blocks(lines);
    expect(first).not.toBe(quote);
    expect(quote).not.toBe(last);
    expect(first).not.toBe(last);
  });

  it("空の入力を受け付ける", () => {
    expect(blocks([])).toEqual([]);
  });
});

describe("引用の行を揃える", () => {
  /**
   * CommonMark は `> q` の次行が `lazy` でも同じ引用として読む。
   * **揃えておかないと、行だけを見て引用と判断できない。**
   */
  it("遅延継続行に `>` を足す", () => {
    expect(normalizeQuote("> q\nlazy")).toBe("> q\n> lazy");
  });

  it("すでに `>` で始まる行は触らない", () => {
    expect(normalizeQuote("> a\n>> b")).toBe("> a\n>> b");
  });
});

describe("エスケープ", () => {
  it("本文行だけにエスケープを足す", () => {
    expect(escapeNote(["- a", "> q", F, "- b", F])).toEqual([B + "- a", "> q", F, "- b", F]);
  });

  /**
   * **`\> q` は外さない。** 外すと引用になり、
   * 他人が書いた「文字としての `>`」が化ける。
   */
  it("引用に化ける `\\>` は外さない", () => {
    expect(unescapeNote([B + "> q"])).toEqual([B + "> q"]);
  });

  /**
   * **対の無い `\```  ` は外す。** モデルでは裸の柵、ファイルでは `\``` ` と、
   * どちらも動かない。
   */
  it("対の無い柵のエスケープは外す", () => {
    expect(unescapeNote([B + F + "js", "a"])).toEqual([F + "js", "a"]);
  });

  it("箇条書きのエスケープは外す", () => {
    expect(unescapeNote([B + "- a"])).toEqual(["- a"]);
  });

  /**
   * **外せる行と外せない行が混ざっても、1行ずつ正しく決める。**
   * まとめて外すと全体が元に戻らないため、1行ずつ確かめる経路に落ちる。
   */
  it("外せる行と外せない行が混ざっても取り違えない", () => {
    expect(unescapeNote([B + "> q", B + "- x"])).toEqual([B + "> q", "- x"]);
  });

  /**
   * **守るのは `md → モデル → md` である。**
   * `モデル → md → モデル` ではない（正規化で寄る。設計 6.4）。
   * よってファイル上の姿から始めて、読み戻して書き直すと元へ戻ることを見る。
   */
  it("ファイル上の姿は、読み戻して書き直しても動かない", () => {
    for (const lines of [
      [B + "- a", "> q"],
      [B + "> q", B + "- x"],
      [F, "- a", F],
      ["    code", "", "本文"],
      [B + "# h", "1" + B + ". n", B + "---"],
      [B + F + "js", "対が無い柵"],
    ]) {
      expect(escapeNote(unescapeNote(lines))).toEqual(lines);
    }
  });
});
