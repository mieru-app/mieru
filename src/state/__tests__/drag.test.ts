import { describe, expect, it } from "vitest";

import { DRAG_START_PX, movedFar, resolveDropPosition } from "../drag.js";

/**
 * 掴んで落とす操作の判断の検証（2.9-3）。
 *
 * 描画層は自動テストを持たないため、「行のどこで離すと何が起きるか」は
 * ここで担保する。境目を変えたときに気付けるようにしておく。
 */

describe("落とす位置", () => {
  const HEIGHT = 20;

  it("上端は前へ、下端は後ろへ、中央は子にする", () => {
    expect(resolveDropPosition(1, HEIGHT)).toBe("before");
    expect(resolveDropPosition(10, HEIGHT)).toBe("inside");
    expect(resolveDropPosition(19, HEIGHT)).toBe("after");
  });

  it("行の外へ出ても、近い側の判定に留まる", () => {
    // 指は行の外まで滑る。はみ出した瞬間に判定が消えると狙いが定まらない
    expect(resolveDropPosition(-50, HEIGHT)).toBe("before");
    expect(resolveDropPosition(80, HEIGHT)).toBe("after");
  });

  it("高さが取れないときは子にしない", () => {
    // 子にすると階層が勝手に深くなる。兄弟なら見た目の位置は変わらない
    for (const broken of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveDropPosition(5, broken)).toBe("after");
    }
  });

  it("上下の帯は同じ幅である", () => {
    // 片方だけ広いと、同じ狙い方をしても行の上下で結果が変わる
    const height = 100;
    let before = 0;
    let after = 0;
    for (let y = 0; y < height; y += 1) {
      const at = resolveDropPosition(y + 0.5, height);
      if (at === "before") before += 1;
      if (at === "after") after += 1;
    }
    expect(before).toBe(after);
    expect(before).toBeGreaterThan(0);
  });

  it("どの位置でも3つのいずれかを返す", () => {
    for (let y = -10; y <= 30; y += 1) {
      expect(["before", "after", "inside"]).toContain(resolveDropPosition(y, HEIGHT));
    }
  });
});

describe("ドラッグに入るかの判定", () => {
  it("動いていなければ入らない", () => {
    // 押して離すだけでドラッグになると、掴み手を触るたびに木が動く
    expect(movedFar(0, 0)).toBe(false);
  });

  it("わずかな震えでは入らない", () => {
    expect(movedFar(1, 1)).toBe(false);
  });

  it("しきい値を超えれば入る", () => {
    expect(movedFar(DRAG_START_PX, 0)).toBe(true);
    expect(movedFar(0, -DRAG_START_PX)).toBe(true);
  });

  it("向きによらず距離で決まる", () => {
    // 斜めの移動を見落とすと、斜めに引いたときだけ掴めない
    expect(movedFar(3, 3)).toBe(movedFar(-3, -3));
    expect(movedFar(3, 3)).toBe(true);
  });
});
