import { describe, expect, it } from "vitest";

import { fileNameFor, isValidMapId, toFileNameBase } from "../file-name.js";

/** バックスラッシュ。ソースへ直接書かず符号位置から作る */
const BS = String.fromCharCode(92);

/**
 * ファイル名の規則。
 * 「作れるが保存できない名前」が生まれると保存に失敗し続けるため、
 * 生成した名前が必ず妥当と判定されることまで確かめる。
 */

describe("id の妥当性", () => {
  it("md ファイル名を受け入れる", () => {
    expect(isValidMapId("新規事業の論点整理.md")).toBe(true);
    expect(isValidMapId("a-b c_d.md")).toBe(true);
  });

  it("拡張子・隠しファイル・空名を拒む", () => {
    for (const id of ["a.txt", ".md", ".hidden.md", "", "md"]) {
      expect(isValidMapId(id)).toBe(false);
    }
  });

  it("パス区切りと予約文字を拒む", () => {
    for (const id of [
      "sub/a.md",
      `..${BS}a.md`,
      "a:b.md",
      'a"b.md',
      "a|b.md",
      "a?b.md",
      "a*b.md",
    ]) {
      expect(isValidMapId(id)).toBe(false);
    }
  });
});

describe("表題からファイル名を作る", () => {
  it("使えない文字を置き換える", () => {
    expect(toFileNameBase("市場/競合:分析")).toBe("市場-競合-分析");
  });

  it("空になる表題は無題にする", () => {
    expect(toFileNameBase("   ")).toBe("無題");
    expect(toFileNameBase("...")).toBe("無題");
  });

  it("長すぎる表題を切り詰める", () => {
    expect(toFileNameBase("あ".repeat(200)).length).toBe(60);
  });

  it("既存と重ならない名前を返す", () => {
    expect(fileNameFor("メモ", [])).toBe("メモ.md");
    expect(fileNameFor("メモ", ["メモ.md"])).toBe("メモ 2.md");
    expect(fileNameFor("メモ", ["メモ.md", "メモ 2.md"])).toBe("メモ 3.md");
  });

  it("生成した名前は必ず id として妥当である", () => {
    for (const title of ["市場/競合", "   ", "...", "あ".repeat(200), '"引用"', `a${BS}b`]) {
      expect(isValidMapId(fileNameFor(title, []))).toBe(true);
    }
  });
});
