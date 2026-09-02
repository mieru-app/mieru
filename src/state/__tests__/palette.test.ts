import { describe, expect, it } from "vitest";

import { branchColors, DEFAULT_PALETTE } from "../palette.js";

/**
 * ブランチ自動配色（F-24）の検証。
 * 「色が付かないブランチができる」と、どの論点の話か見分けられなくなる。
 */

describe("ブランチの配色", () => {
  it("auto なら既定パレットを順に割り当てる", () => {
    expect(branchColors("auto", 3)).toEqual(DEFAULT_PALETTE.slice(0, 3));
  });

  it("パレットより多いブランチには色が巡る。無色にはしない", () => {
    const colors = branchColors("auto", DEFAULT_PALETTE.length + 2);
    expect(colors).toHaveLength(DEFAULT_PALETTE.length + 2);
    expect(colors.every((color) => color !== "")).toBe(true);
    expect(colors[DEFAULT_PALETTE.length]).toBe(DEFAULT_PALETTE[0]);
  });

  it("frontmatter の色があればそれを使う", () => {
    expect(branchColors(["#111111", "#222222"], 3)).toEqual(["#111111", "#222222", "#111111"]);
  });

  it("空の配列は既定パレットとして扱う", () => {
    expect(branchColors([], 2)).toEqual(DEFAULT_PALETTE.slice(0, 2));
  });

  it("ブランチが無ければ空", () => {
    expect(branchColors("auto", 0)).toEqual([]);
  });

  it("隣り合う既定色は同じにならない", () => {
    const colors = branchColors("auto", DEFAULT_PALETTE.length);
    for (let index = 1; index < colors.length; index += 1) {
      expect(colors[index]).not.toBe(colors[index - 1]);
    }
  });
});
