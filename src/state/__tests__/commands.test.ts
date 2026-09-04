import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseMarkdown } from "../../core/parse.js";
import type { MapNode } from "../../core/types.js";
import { exportAs, exportForAi, runCommand } from "../commands.js";
import { useEditor } from "../editor.js";
import { flatten } from "../tree.js";
import type { ViewMode } from "../view-mode.js";

/**
 * キー操作の実体の検証。
 * 「このキーを押すと何が起きるか」を画面を動かさずに確かめる。
 */

const SOURCE = `---
title: 論点整理
---

# 論点整理

- 市場
  - TAM試算
    既存レポートでは1,200億円。
- 強み
`;

function openSource(): void {
  const { doc } = parseMarkdown(SOURCE);
  useEditor
    .getState()
    .open({ id: "a.md", meta: doc.meta, colors: doc.view.colors, version: "v1" }, doc);
}

function uidOf(label: string): string {
  const root = useEditor.getState().root;
  const node = root === null ? undefined : flatten(root).find((item) => item.label === label);
  if (node === undefined) throw new Error(`ラベルが見つかりません: ${label}`);
  return node.uid;
}

const noop = { copyText: () => Promise.resolve() };

beforeEach(() => {
  useEditor.getState().close();
  openSource();
});

describe("テキスト出力（Ctrl+Shift+C）", () => {
  it("中心テーマを選んでいれば全体を出す", async () => {
    const copyText = vi.fn((_text: string) => Promise.resolve());
    const notify = vi.fn();
    await runCommand("copyForAi", { copyText, notify });

    const copied = copyText.mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("# 論点整理");
    expect(copied).toContain("## 市場");
    expect(copied).toContain("## 強み");
    // 表示状態を AI に渡さない（設計原則2）
    expect(copied).not.toContain("---");
    expect(notify).toHaveBeenCalledWith("全体を Markdown でコピーしました");
  });

  it("枝を選んでいればその部分木だけを出す", async () => {
    useEditor.getState().select(uidOf("市場"));
    const copyText = vi.fn((_text: string) => Promise.resolve());
    await runCommand("copyForAi", { copyText, notify: vi.fn() });

    const copied = copyText.mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("# 市場");
    expect(copied).toContain("## TAM試算");
    expect(copied).not.toContain("強み");
  });

  it("ノートを本文段落として展開する", () => {
    useEditor.getState().select(uidOf("TAM試算"));
    expect(exportForAi()?.md).toContain("既存レポートでは1,200億円。");
  });

  it("クリップボードに失敗しても黙らない", async () => {
    const notify = vi.fn();
    await runCommand("copyForAi", {
      copyText: () => Promise.reject(new Error("拒否されました")),
      notify,
    });
    expect(notify).toHaveBeenCalledWith("クリップボードへコピーできませんでした");
  });

  it("マップを開いていなければ何もしない", async () => {
    useEditor.getState().close();
    const copyText = vi.fn((_text: string) => Promise.resolve());
    await runCommand("copyForAi", { copyText });
    expect(copyText).not.toHaveBeenCalled();
    expect(exportForAi()).toBeNull();
  });
});

describe("形式と範囲の選択（F-33 / F-35）", () => {
  it("箇条書きは箇条書きのまま、見出しは見出しにする", () => {
    expect(exportAs("bullet")?.md).toContain("- 市場");
    expect(exportAs("bullet")?.md).not.toContain("## 市場");
    expect(exportAs("heading")?.md).toContain("## 市場");
  });

  it("どの組み合わせでも frontmatter を渡さない（設計原則2）", () => {
    for (const format of ["heading", "bullet"] as const) {
      for (const scope of ["whole", "selection"] as const) {
        expect(exportAs(format, scope)?.md).not.toContain("title:");
      }
    }
  });

  it("選択部分は選んだ枝から下だけを出し、対象を名前で示す", () => {
    useEditor.getState().select(uidOf("市場"));
    const result = exportAs("heading", "selection");

    expect(result?.scope).toBe("市場");
    expect(result?.md).toContain("# 市場");
    expect(result?.md).not.toContain("強み");
    expect(result?.fileName).toBe("論点整理 - 市場.md");
  });

  it("中心テーマを選んでいるときの選択部分は全体になる", () => {
    const result = exportAs("heading", "selection");
    expect(result?.scope).toBe("全体");
    expect(result?.fileName).toBe("論点整理.md");
  });

  it("ファイル名に使えない文字は畳む", () => {
    const { doc } = parseMarkdown("---\ntitle: A/B の比較\n---\n\n# A/B の比較\n\n- 枝\n");
    useEditor
      .getState()
      .open({ id: "x.md", meta: doc.meta, colors: doc.view.colors, version: "v1" }, doc);

    expect(exportAs("heading")?.fileName).toBe("A-B の比較.md");
  });

  it("マップを開いていなければ null", () => {
    useEditor.getState().close();
    expect(exportAs("heading")).toBeNull();
  });

  it("箇条書き × 選択部分も選べる（2軸に分けた副産物）", () => {
    useEditor.getState().select(uidOf("市場"));
    const result = exportAs("bullet", "selection");

    expect(result?.scope).toBe("市場");
    expect(result?.md).toContain("# 市場");
    expect(result?.md).toContain("- TAM試算");
    expect(result?.md).not.toContain("## TAM試算");
  });

  it("既定の範囲は全体。枝を選んでいても全体が出る", () => {
    useEditor.getState().select(uidOf("市場"));
    expect(exportAs("heading")?.scope).toBe("全体");
    expect(exportAs("heading")?.md).toContain("強み");
  });
});

describe("木の操作", () => {
  it("兄弟と子を追加する", async () => {
    useEditor.getState().select(uidOf("市場"));
    await runCommand("addChild", noop);
    expect(useEditor.getState().root?.children[0]?.children).toHaveLength(2);

    await runCommand("addSibling", noop);
    expect(useEditor.getState().root?.children[0]?.children).toHaveLength(3);
  });

  it("削除・階層上げ・並べ替えが効く", async () => {
    useEditor.getState().select(uidOf("TAM試算"));
    await runCommand("outdent", noop);
    expect(useEditor.getState().root?.children).toHaveLength(3);

    await runCommand("remove", noop);
    expect(useEditor.getState().root?.children).toHaveLength(2);

    useEditor.getState().select(uidOf("強み"));
    await runCommand("reorderUp", noop);
    expect(useEditor.getState().root?.children[0]?.label).toBe("強み");
  });

  it("方向キーで選択が移る", async () => {
    await runCommand("moveDown", noop);
    expect(useEditor.getState().selectedUid).toBe(uidOf("市場"));
    await runCommand("moveRight", noop);
    expect(useEditor.getState().selectedUid).toBe(uidOf("TAM試算"));
    await runCommand("moveLeft", noop);
    expect(useEditor.getState().selectedUid).toBe(uidOf("市場"));
    await runCommand("moveUp", noop);
    expect(useEditor.getState().selectedUid).toBe(useEditor.getState().root?.uid);
  });

  it("折り畳みと Undo / Redo", async () => {
    useEditor.getState().select(uidOf("市場"));
    await runCommand("toggleCollapse", noop);
    expect(useEditor.getState().collapsedUids.size).toBe(1);

    await runCommand("addChild", noop);
    await runCommand("undo", noop);
    expect(useEditor.getState().root?.children[0]?.children).toHaveLength(1);
    await runCommand("redo", noop);
    expect(useEditor.getState().root?.children[0]?.children).toHaveLength(2);
  });

  it("編集の開始と表示の切り替え", async () => {
    useEditor.getState().select(uidOf("市場"));
    await runCommand("beginEdit", noop);
    expect(useEditor.getState().editingUid).toBe(uidOf("市場"));

    await runCommand("toggleMode", noop);
    expect(useEditor.getState().mode).toBe("outline");
    await runCommand("toggleMode", noop);
    expect(useEditor.getState().mode).toBe("source");
    await runCommand("toggleMode", noop);
    expect(useEditor.getState().mode).toBe("canvas");
  });

  it("Markdown 表示へ移ると書きかけの入力欄を閉じる（2.8-1）", async () => {
    // 入力欄が無い画面で editingUid が残ると、以後どのキーも「入力中」として
    // 無視され（`useKeymap`）、抜ける手段が無くなる
    useEditor.getState().select(uidOf("市場"));
    await runCommand("beginEdit", noop);
    expect(useEditor.getState().editingUid).not.toBeNull();

    useEditor.getState().setMode("source");
    expect(useEditor.getState().editingUid).toBeNull();

    await runCommand("beginEdit", noop);
    expect(useEditor.getState().editingUid).toBeNull();
  });
});

describe("残りの操作", () => {
  it("下へ並べ替える", async () => {
    useEditor.getState().select(uidOf("市場"));
    await runCommand("reorderDown", noop);
    expect(useEditor.getState().root?.children[1]?.label).toBe("市場");
  });

  it("保存はワークスペースへ委ねる（フォルダ未選択でも落ちない）", async () => {
    await expect(runCommand("saveNow", noop)).resolves.toBeUndefined();
  });
});

describe("キー操作一覧の開閉", () => {
  it("UI 側の開閉処理を呼ぶ", async () => {
    const toggleHelp = vi.fn();
    await runCommand("toggleHelp", { ...noop, toggleHelp });
    expect(toggleHelp).toHaveBeenCalledTimes(1);
  });

  it("開閉処理が渡されていなくても落ちない", async () => {
    await expect(runCommand("toggleHelp", noop)).resolves.toBeUndefined();
  });
});

describe("サイドバーと検索", () => {
  it("開閉と入力位置の移動を UI 側へ委ねる", async () => {
    const toggleSidebar = vi.fn();
    const focusSearch = vi.fn();

    const toggleExport = vi.fn();
    const openPalette = vi.fn();

    await runCommand("toggleSidebar", { ...noop, toggleSidebar });
    await runCommand("focusSearch", { ...noop, focusSearch });
    await runCommand("toggleExport", { ...noop, toggleExport });
    await runCommand("openPalette", { ...noop, openPalette });

    expect(toggleSidebar).toHaveBeenCalledTimes(1);
    expect(focusSearch).toHaveBeenCalledTimes(1);
    expect(toggleExport).toHaveBeenCalledTimes(1);
    expect(openPalette).toHaveBeenCalledTimes(1);
  });

  it("渡されていなくても落ちない", async () => {
    await expect(runCommand("toggleSidebar", noop)).resolves.toBeUndefined();
    await expect(runCommand("focusSearch", noop)).resolves.toBeUndefined();
    await expect(runCommand("toggleExport", noop)).resolves.toBeUndefined();
    await expect(runCommand("openPalette", noop)).resolves.toBeUndefined();
  });
});

describe("親子の反転（Ctrl+Shift+↑、2.9-2）", () => {
  /** 木の形をラベルの入れ子で表す */
  function shape(node: MapNode): unknown {
    return node.children.length === 0 ? node.label : [node.label, node.children.map(shape)];
  }

  /** 指定した表示で反転を実行し、できた木の形を返す */
  async function swapUnder(mode: ViewMode, label: string): Promise<unknown> {
    useEditor.getState().close();
    openSource();
    useEditor.getState().setMode(mode);
    useEditor.getState().select(uidOf(label));
    await runCommand("swapWithParent", noop);
    const root = useEditor.getState().root;
    return root === null ? null : shape(root);
  }

  it("キャンバスとアウトラインで同じ結果になる（Phase 2.9 の完了条件）", async () => {
    // **表示ごとに別の状態を持たせない**という規約（.claude/rules/ui.md「状態」）の検査。
    // 判断は `src/state/tree.ts` にあり、描画層はそれを呼ぶだけなので一致するはずである
    const onCanvas = await swapUnder("canvas", "TAM試算");
    const onOutline = await swapUnder("outline", "TAM試算");
    expect(onCanvas).toEqual(onOutline);
    expect(onCanvas).toEqual(["論点整理", [["TAM試算", ["市場"]], "強み"]]);
  });

  it("取り消せる", async () => {
    // 構造を大きく変える操作ほど、戻せることが効いてくる
    openSource();
    const before = shape(useEditor.getState().root as MapNode);
    useEditor.getState().select(uidOf("TAM試算"));
    await runCommand("swapWithParent", noop);
    expect(shape(useEditor.getState().root as MapNode)).not.toEqual(before);

    await runCommand("undo", noop);
    expect(shape(useEditor.getState().root as MapNode)).toEqual(before);
  });

  it("親がルートのノードでは何も起きず、履歴も汚さない", async () => {
    openSource();
    useEditor.getState().select(uidOf("市場"));
    const before = shape(useEditor.getState().root as MapNode);
    await runCommand("swapWithParent", noop);

    expect(shape(useEditor.getState().root as MapNode)).toEqual(before);
    // 何も起きていないのに undo が1回分積まれると、
    // 利用者は「押したのに戻らない」と感じる
    expect(useEditor.getState().past).toHaveLength(0);
  });
});
