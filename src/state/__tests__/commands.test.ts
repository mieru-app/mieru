import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseMarkdown } from "../../core/parse.js";
import { exportForAi, runCommand } from "../commands.js";
import { useEditor } from "../editor.js";
import { flatten } from "../tree.js";

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

describe("AI 用の出力", () => {
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
    expect(useEditor.getState().mode).toBe("canvas");
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
