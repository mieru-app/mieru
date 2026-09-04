import { describe, expect, it } from "vitest";

import {
  clampPaneWidth,
  defaultPaneWidth,
  PANE_KEYS,
  readPaneWidth,
  resizePane,
} from "../pane-size.js";
import type { Pane } from "../pane-size.js";

const PANES: Pane[] = ["sidebar", "panel"];

describe("clampPaneWidth", () => {
  it("可動域の中はそのまま通す", () => {
    expect(clampPaneWidth("sidebar", 18)).toBe(18);
    expect(clampPaneWidth("panel", 22)).toBe(22);
  });

  it("下限と上限で止まる", () => {
    for (const pane of PANES) {
      const narrow = clampPaneWidth(pane, 0);
      const wide = clampPaneWidth(pane, 999);
      expect(narrow).toBeGreaterThan(0);
      expect(wide).toBeLessThan(999);
      // 既定は必ず可動域の中にある
      expect(clampPaneWidth(pane, defaultPaneWidth(pane))).toBe(defaultPaneWidth(pane));
    }
  });

  it("両方を最大にしても主表示が残る", () => {
    // 一覧と欄で画面を埋め尽くせてしまうと、地図が見えない状態を作れる
    const total = clampPaneWidth("sidebar", 999) + clampPaneWidth("panel", 999);
    expect(total).toBeLessThan(80);
  });

  it("数でない値は既定へ倒す", () => {
    expect(clampPaneWidth("sidebar", Number.NaN)).toBe(defaultPaneWidth("sidebar"));
    expect(clampPaneWidth("panel", Number.POSITIVE_INFINITY)).toBe(defaultPaneWidth("panel"));
  });
});

describe("readPaneWidth", () => {
  it("保存が無ければ既定を返す", () => {
    for (const pane of PANES) {
      expect(readPaneWidth(pane, null)).toBe(defaultPaneWidth(pane));
    }
  });

  it("保存された値を読む", () => {
    expect(readPaneWidth("sidebar", "22.5")).toBe(22.5);
  });

  it("壊れた値でも既定へ倒す", () => {
    // localStorage は利用者や他のツールが書き換えられる（`theme.ts` と同じ方針）
    for (const broken of ["", "abc", "{}", "NaN"]) {
      expect(readPaneWidth("sidebar", broken)).toBe(defaultPaneWidth("sidebar"));
    }
  });

  it("可動域の外に保存されていても収める", () => {
    expect(readPaneWidth("sidebar", "999")).toBe(clampPaneWidth("sidebar", 999));
    expect(readPaneWidth("panel", "-5")).toBe(clampPaneWidth("panel", -5));
  });
});

describe("resizePane", () => {
  it("一覧は右へ動かすと広がる", () => {
    expect(resizePane("sidebar", 15, 32)).toBe(17);
  });

  it("欄は左へ動かすと広がる", () => {
    // 欄は画面の右端にある。符号を取り違えると、掴んだ向きと逆に伸びる
    expect(resizePane("panel", 20, -32)).toBe(22);
    expect(resizePane("panel", 20, 32)).toBe(18);
  });

  it("動かさなければ変わらない", () => {
    for (const pane of PANES) {
      expect(resizePane(pane, 16, 0)).toBe(16);
    }
  });

  it("引きすぎても可動域で止まる", () => {
    // **広がる向きは欄ごとに逆である。** 一覧は右、欄は左へ引くと広がる
    for (const pane of PANES) {
      const toWide = pane === "sidebar" ? 100_000 : -100_000;
      const start = defaultPaneWidth(pane);

      const grew = resizePane(pane, start, toWide);
      const shrank = resizePane(pane, start, -toWide);

      expect(grew).toBe(clampPaneWidth(pane, 999));
      expect(shrank).toBe(clampPaneWidth(pane, 0));
      expect(grew).toBeGreaterThan(shrank);
    }
  });

  it("`1rem` の画素数が違っても比が保たれる", () => {
    // 利用者がブラウザの文字サイズを変えていることがある
    expect(resizePane("sidebar", 15, 40, 20)).toBe(17);
  });

  it("`1rem` が 0 でも壊れない", () => {
    expect(Number.isFinite(resizePane("sidebar", 15, 32, 0))).toBe(true);
  });
});

describe("PANE_KEYS", () => {
  it("接頭辞が付いていて、互いに違う", () => {
    const keys = PANES.map((pane) => PANE_KEYS[pane]);
    for (const key of keys) expect(key.startsWith("mieru.")).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
