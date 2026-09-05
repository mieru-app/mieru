import { describe, expect, it } from "vitest";

import { LANGUAGE_LABELS, readLanguage } from "../i18n.js";
import { EN } from "../strings/en.js";
import { JA } from "../strings/ja.js";
import type { Strings } from "../strings/ja.js";
import { VIEW_MODES } from "../view-mode.js";

/**
 * 表示言語（2.12）。
 *
 * **鍵の抜けは型検査が捉えるので、ここでは確かめない。**
 * ここが見るのは型では捉えられないもの——空文字、収まらない長さ、
 * そして「保存された値が壊れていても画面が出ること」である。
 */

const TABLES: [string, Strings][] = [
  ["ja", JA],
  ["en", EN],
];

/** 全角を2、半角を1として数えたおおよその幅 */
function width(text: string): number {
  return [...text].reduce((sum, ch) => sum + (/[ -ÿ]/.test(ch) ? 1 : 2), 0);
}

/** 表の中の文字列を全て集める。関数は引数を埋めて呼ぶ */
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    return [String((value as (...args: unknown[]) => string)("x", "y"))];
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

describe("readLanguage", () => {
  it("設定されていればそれに従う", () => {
    expect(readLanguage("ja", ["en-US"])).toBe("ja");
    expect(readLanguage("en", ["ja-JP"])).toBe("en");
  });

  it("設定が無ければブラウザの言語を見る", () => {
    expect(readLanguage(null, ["ja-JP", "en-US"])).toBe("ja");
    expect(readLanguage(null, ["ja"])).toBe("ja");
    expect(readLanguage(null, ["fr-FR"])).toBe("en");
  });

  /**
   * **既定は英語。** 公開先は世界であり、
   * 日本語話者だけが読みに来るわけではない。
   */
  it("手掛かりが何も無ければ英語", () => {
    expect(readLanguage(null, [])).toBe("en");
  });

  /**
   * `localStorage` は利用者や他のツールが書き換えられる場所である。
   * **壊れた値で画面が真っ白になってはいけない**（`theme.ts` と同じ考え方）。
   */
  it("知らない値は既定へ倒す", () => {
    for (const broken of ["", "JA", "ja-JP", "{}", "null"]) {
      expect(readLanguage(broken, [])).toBe("en");
    }
  });
});

describe("文言表", () => {
  for (const [name, table] of TABLES) {
    it(`${name}: 空の文言が無い`, () => {
      // 空の押しボタンは、押す前に何が起きるか分からない
      for (const text of allStrings(table)) expect(text.trim()).not.toBe("");
    });

    it(`${name}: 表示の名前と短い字がある`, () => {
      for (const mode of VIEW_MODES) {
        expect(table.viewMode[mode]).not.toBe("");
      }
    });

    /**
     * **360px の画面に3つ並ぶ上限**（`view-mode.ts` の見積り）。
     * 文字数ではなく幅で測る。**英語の4文字は日本語の3文字より狭い。**
     */
    it(`${name}: 短い字は狭い画面に収まり、互いに紛れない`, () => {
      const short = [
        table.viewMode.canvasShort,
        table.viewMode.outlineShort,
        table.viewMode.sourceShort,
      ];
      for (const label of short) expect(width(label)).toBeLessThanOrEqual(6);
      expect(new Set(short).size).toBe(short.length);
    });
  }

  it("選択肢はどちらもその言語自身で書かれている", () => {
    // **読めない言語で書かれた選択肢は選べない。**
    // 英語の画面から日本語へ戻れなくなるのが最も困る
    expect(LANGUAGE_LABELS.map((each) => each.language).sort()).toEqual(["en", "ja"]);
    expect(LANGUAGE_LABELS.find((each) => each.language === "ja")?.label).toBe("日本語");
    expect(LANGUAGE_LABELS.find((each) => each.language === "en")?.label).toBe("English");
  });
});
