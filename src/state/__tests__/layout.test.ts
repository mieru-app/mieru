import { describe, expect, it } from "vitest";

import type { LayoutInput } from "../layout.js";
import { keepSidebarAfterOpen, NARROW_MAX_WIDTH, resolveLayout } from "../layout.js";

/** 既定は「広い画面・一覧あり・欄なし・選択なし・マップを開いている」 */
function input(overrides: Partial<LayoutInput> = {}): LayoutInput {
  return {
    narrow: false,
    sidebarOpen: true,
    sheet: null,
    hasSelection: false,
    editing: true,
    ...overrides,
  };
}

describe("resolveLayout（広い画面）", () => {
  it("一覧・欄なしを列として並べる", () => {
    expect(resolveLayout(input())).toEqual({ sidebar: true, panel: null, editBar: false });
  });

  it("一覧を畳める", () => {
    expect(resolveLayout(input({ sidebarOpen: false })).sidebar).toBe(false);
  });

  it("選択があればノート欄を出す", () => {
    expect(resolveLayout(input({ hasSelection: true })).panel).toBe("note");
  });

  it("明示的に開いた欄はノートより優先する", () => {
    // 並べると主表示が狭くなるため、右の欄は常に1つに限る（設計書 7.2）
    for (const sheet of ["export", "settings", "help"] as const) {
      expect(resolveLayout(input({ hasSelection: true, sheet })).panel).toBe(sheet);
    }
  });

  it("一覧と欄は同時に出せる", () => {
    const layout = resolveLayout(input({ sheet: "export" }));
    expect(layout).toEqual({ sidebar: true, panel: "export", editBar: false });
  });
});

describe("resolveLayout（狭い画面）", () => {
  it("明示的に開いた欄は一覧より優先する", () => {
    // 一覧を開いたまま設定を押しても何も出ない、という死んだ操作を作らない
    const layout = resolveLayout(input({ narrow: true, sidebarOpen: true, sheet: "settings" }));
    expect(layout).toEqual({ sidebar: false, panel: "settings", editBar: false });
  });

  it("一覧はノートより優先する", () => {
    // ノートは選択に付随して開く。勝たせると一覧に辿り着けなくなる
    const layout = resolveLayout(input({ narrow: true, sidebarOpen: true, hasSelection: true }));
    expect(layout).toEqual({ sidebar: true, panel: null, editBar: false });
  });

  it("一覧を畳めば欄が出る", () => {
    const layout = resolveLayout(input({ narrow: true, sidebarOpen: false, sheet: "export" }));
    expect(layout).toEqual({ sidebar: false, panel: "export", editBar: false });
  });

  it("一覧を畳んで選択があればノートを出す", () => {
    const layout = resolveLayout(input({ narrow: true, sidebarOpen: false, hasSelection: true }));
    expect(layout.panel).toBe("note");
  });

  it("何も開いていなければ主表示だけになる", () => {
    const layout = resolveLayout(input({ narrow: true, sidebarOpen: false }));
    expect(layout).toEqual({ sidebar: false, panel: null, editBar: true });
  });
});

describe("編集バー（2.7-5）", () => {
  it("広い画面には出さない。キーボードがある", () => {
    expect(resolveLayout(input({ sidebarOpen: false })).editBar).toBe(false);
  });

  it("狭い画面でマップを編集していれば出す", () => {
    expect(resolveLayout(input({ narrow: true, sidebarOpen: false })).editBar).toBe(true);
  });

  it("ホーム・作成画面では出さない。編集する木が無い", () => {
    const layout = resolveLayout(input({ narrow: true, sidebarOpen: false, editing: false }));
    expect(layout.editBar).toBe(false);
  });

  it("一覧や欄が覆っている間は出さない", () => {
    // 押す相手が見えていない
    expect(resolveLayout(input({ narrow: true, sidebarOpen: true })).editBar).toBe(false);
    const withSheet = resolveLayout(input({ narrow: true, sidebarOpen: false, sheet: "export" }));
    expect(withSheet.editBar).toBe(false);
  });

  it("ノート欄が出ていても残す。下半分しか覆わないのでマップは見えている", () => {
    const layout = resolveLayout(
      input({ narrow: true, sidebarOpen: false, hasSelection: true }),
    );
    expect(layout).toEqual({ sidebar: false, panel: "note", editBar: true });
  });
});

describe("keepSidebarAfterOpen", () => {
  it("狭い画面では畳む。残すと開いた先が見えない", () => {
    expect(keepSidebarAfterOpen(true)).toBe(false);
  });

  it("広い画面では残す。列として並んでいるので閉じる理由がない", () => {
    expect(keepSidebarAfterOpen(false)).toBe(true);
  });
});

describe("NARROW_MAX_WIDTH", () => {
  it("一覧 15rem と欄 20rem を足した 35rem より広い", () => {
    // 境目がこれより狭いと、3列が成立しない幅で3列のまま出てしまう
    expect(Number.parseFloat(NARROW_MAX_WIDTH)).toBeGreaterThan(35);
  });
});
