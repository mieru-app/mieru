import { describe, expect, it } from "vitest";

import { readTheme, THEMES } from "../theme.js";

/**
 * 配色の設定（2-12）の検証。
 * localStorage は他のツールや利用者が書き換えられる場所なので、
 * 壊れた値で画面が読めなくならないことを確かめる。
 */

describe("保存された配色の読み取り", () => {
  it("保存された値をそのまま使う", () => {
    expect(readTheme("dark")).toBe("dark");
    expect(readTheme("light")).toBe("light");
    expect(readTheme("system")).toBe("system");
  });

  it("未設定は OS に従う", () => {
    expect(readTheme(null)).toBe("system");
  });

  it("知らない値は OS に従う", () => {
    expect(readTheme("")).toBe("system");
    expect(readTheme("sepia")).toBe("system");
    expect(readTheme("DARK")).toBe("system");
  });
});

describe("選択肢", () => {
  it("読み取れる値と表示の選択肢が一致する", () => {
    // 押しボタンに出ているのに読み戻せない値があると、選んだ設定が消える
    for (const choice of THEMES) expect(readTheme(choice)).toBe(choice);
  });

  it("既定を先頭に置く", () => {
    expect(THEMES[0]).toBe("system");
  });

  // 押しボタンの字は言語ごとに変わるため、確かめるのは `i18n.test.ts`
});
