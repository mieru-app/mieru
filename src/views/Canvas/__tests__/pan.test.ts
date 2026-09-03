import { describe, expect, it } from "vitest";

import { shouldStartPan } from "../pan.js";

describe("shouldStartPan", () => {
  it("指で地の部分に触れたら動かす", () => {
    // これが 2.7-6 で塞いだ穴そのものである
    expect(shouldStartPan({ pointerType: "touch", onEmptyArea: true })).toBe(true);
  });

  it("ペンでも動かす", () => {
    // マウス以外は向こうが受け持たない
    expect(shouldStartPan({ pointerType: "pen", onEmptyArea: true })).toBe(true);
  });

  it("マウスでは動かさない。mind-elixir 自身が持っている", () => {
    // 二重に動かすと速度が倍になる
    expect(shouldStartPan({ pointerType: "mouse", onEmptyArea: true })).toBe(false);
  });

  it("枝の上から始まった操作には触らない", () => {
    // あちらの並べ替えと取り合いになり、枝を掴めなくなる
    expect(shouldStartPan({ pointerType: "touch", onEmptyArea: false })).toBe(false);
  });
});
