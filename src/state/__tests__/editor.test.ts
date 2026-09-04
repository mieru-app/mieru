import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseMarkdown } from "../../core/parse.js";
import { serializeMarkdown } from "../../core/serialize.js";
import type { MapNode } from "../../core/types.js";
import { selectedNode, useEditor } from "../editor.js";
import { flatten, locate } from "../tree.js";

/**
 * 編集ストアの検証。とりわけ Undo / Redo は
 * 「戻したつもりが戻っていない」が最も損害の大きい不具合であるため厚く確かめる。
 */

const SOURCE = `---
title: 根
---

# 根

- A
  - A1
- B
`;

function openSource(): void {
  const { doc } = parseMarkdown(SOURCE);
  useEditor.getState().open(
    {
      id: "a.md",
      meta: doc.meta,
      colors: doc.view.colors,
      version: "v1",
    },
    doc,
  );
}

function uidOf(label: string): string {
  const root = useEditor.getState().root;
  if (root === null) throw new Error("マップが開かれていません");
  const node = flatten(root).find((item) => item.label === label);
  if (node === undefined) throw new Error(`ラベルが見つかりません: ${label}`);
  return node.uid;
}

function shape(node: MapNode): unknown {
  return node.children.length === 0 ? node.label : [node.label, node.children.map(shape)];
}

function currentShape(): unknown {
  const { root } = useEditor.getState();
  return root === null ? null : shape(root);
}

beforeEach(() => {
  useEditor.getState().close();
  openSource();
});

describe("マップを開く", () => {
  it("開いた直後はルートを選択し、保存済みとして扱う", () => {
    const state = useEditor.getState();
    expect(state.selectedUid).toBe(state.root?.uid);
    expect(state.status.kind).toBe("saved");
  });

  it("折り畳みはパスから uid へ変換して取り込む", () => {
    const { doc } = parseMarkdown(
      `---\ntitle: 根\nmm:\n  collapsed: ["0"]\n---\n\n# 根\n\n- A\n  - A1\n`,
    );
    useEditor
      .getState()
      .open({ id: "a.md", meta: doc.meta, colors: doc.view.colors, version: "v1" }, doc);

    const state = useEditor.getState();
    expect(state.collapsedUids.size).toBe(1);
    expect(locate(state.root!, [...state.collapsedUids][0]!)?.node.label).toBe("A");
  });

  it("閉じると履歴も選択も消える", () => {
    useEditor.getState().addChild();
    useEditor.getState().close();

    const state = useEditor.getState();
    expect(state.root).toBeNull();
    expect(state.past).toEqual([]);
    expect(state.status.kind).toBe("empty");
  });
});

describe("絵文字と横断リンク", () => {
  it("絵文字を付け外しでき、それぞれ Undo で戻せる", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().setEmoji("⭐");
    expect(selectedNode(useEditor.getState())?.emoji).toBe("⭐");

    useEditor.getState().setEmoji("");
    expect(selectedNode(useEditor.getState())?.emoji).toBeUndefined();

    // まとめずに1操作ずつ積む。付けたのと外したのが1度に戻ると混乱する
    useEditor.getState().undo();
    expect(selectedNode(useEditor.getState())?.emoji).toBe("⭐");
  });

  it("横断リンクはラベルの中に書き込まれる", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().addLink("B");

    const node = selectedNode(useEditor.getState());
    expect(node?.label).toBe("A [[B]]");
    expect(node?.links).toEqual(["B"]);
  });

  it("同じ宛先を重ねて張らない", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().addLink("B");
    useEditor.getState().addLink("B");

    expect(selectedNode(useEditor.getState())?.label).toBe("A [[B]]");
  });

  it("ラベルが空なら括弧だけを置く", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().rename("");
    useEditor.getState().addLink("B");

    expect(selectedNode(useEditor.getState())?.label).toBe("[[B]]");
  });

  it("マップを開いていなければ何もしない", () => {
    useEditor.getState().close();
    useEditor.getState().setEmoji("⭐");
    useEditor.getState().addLink("B");
    expect(useEditor.getState().root).toBeNull();
  });
});

describe("編集すると未保存になる", () => {
  it("ノード追加で dirty になる", () => {
    useEditor.getState().addChild();
    expect(useEditor.getState().status.kind).toBe("dirty");
  });

  it("折り畳みも未保存にする（frontmatter に保存されるため）", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().toggleCollapse();
    expect(useEditor.getState().status.kind).toBe("dirty");
  });

  it("選択の移動だけでは未保存にしない", () => {
    useEditor.getState().select(uidOf("A"));
    expect(useEditor.getState().status.kind).toBe("saved");
  });

  it("保存できたら保存済みに戻り、version を差し替える", () => {
    useEditor.getState().addChild();
    useEditor.getState().markSaved("v2", 1_700_000_000_000);

    const state = useEditor.getState();
    expect(state.map?.version).toBe("v2");
    expect(state.status).toEqual({ kind: "saved", at: 1_700_000_000_000 });
  });
});

describe("Undo と Redo", () => {
  it("追加を取り消せる", () => {
    const before = currentShape();
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().addChild();
    expect(currentShape()).not.toEqual(before);

    useEditor.getState().undo();
    expect(currentShape()).toEqual(before);
  });

  it("取り消したものをやり直せる", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().addChild();
    const after = currentShape();

    useEditor.getState().undo();
    useEditor.getState().redo();
    expect(currentShape()).toEqual(after);
  });

  it("削除した部分木を丸ごと復元できる", () => {
    const before = currentShape();
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().remove();
    expect(currentShape()).toEqual(["根", ["B"]]);

    useEditor.getState().undo();
    expect(currentShape()).toEqual(before);
  });

  it("折り畳み状態も一緒に巻き戻る", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().toggleCollapse();
    const collapsedBefore = new Set(useEditor.getState().collapsedUids);

    useEditor.getState().addChild();
    useEditor.getState().undo();
    expect(useEditor.getState().collapsedUids).toEqual(collapsedBefore);
  });

  it("選択位置も巻き戻る", () => {
    const rootUid = useEditor.getState().root?.uid;
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().addChild();

    useEditor.getState().undo();
    expect(useEditor.getState().selectedUid).toBe(uidOf("A"));

    useEditor.getState().select(rootUid ?? "");
    expect(useEditor.getState().selectedUid).toBe(rootUid);
  });

  it("新しい編集をすると redo は捨てられる", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().addChild();
    useEditor.getState().undo();
    expect(useEditor.getState().future).toHaveLength(1);

    useEditor.getState().addSibling();
    expect(useEditor.getState().future).toEqual([]);
  });

  it("履歴が無ければ何も起きない", () => {
    const before = currentShape();
    useEditor.getState().undo();
    useEditor.getState().redo();
    expect(currentShape()).toEqual(before);
  });

  it("木が変わらない操作は履歴を積まない", () => {
    // 端での並べ替えや移動で undo が空振りするのを防ぐ
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().reorder(-1);
    useEditor.getState().outdent();
    expect(useEditor.getState().past).toEqual([]);
  });

  it("50段を超えると古い履歴から捨てる", () => {
    for (let i = 0; i < 60; i += 1) useEditor.getState().addChild();
    expect(useEditor.getState().past).toHaveLength(50);
  });
});

describe("連続した入力を1つの Undo にまとめる", () => {
  it("素早い改名は1回の undo で元に戻る", () => {
    useEditor.getState().select(uidOf("A"));
    for (const label of ["市", "市場", "市場規", "市場規模"]) {
      useEditor.getState().rename(label);
    }
    expect(useEditor.getState().past).toHaveLength(1);

    useEditor.getState().undo();
    expect(currentShape()).toEqual(["根", [["A", ["A1"]], "B"]]);
  });

  it("間が空いた入力は別の undo になる", () => {
    vi.useFakeTimers();
    try {
      useEditor.getState().select(uidOf("A"));
      useEditor.getState().rename("市");
      vi.advanceTimersByTime(1_000);
      useEditor.getState().rename("市場");
      expect(useEditor.getState().past).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("別のノードの改名は別の undo になる", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().rename("市場");
    useEditor.getState().select(uidOf("B"));
    useEditor.getState().rename("強み");
    expect(useEditor.getState().past).toHaveLength(2);
  });

  it("編集を確定すると、次の入力はまとめない", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().rename("市");
    useEditor.getState().endEdit();
    useEditor.getState().rename("市場");
    expect(useEditor.getState().past).toHaveLength(2);
  });
});

describe("保存する形へまとめる", () => {
  it("折り畳みを構造パスに戻して frontmatter へ出す", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().toggleCollapse();

    const doc = useEditor.getState().buildDoc();
    expect(doc?.view.collapsed).toEqual(["0"]);
    expect(serializeMarkdown(doc!)).toContain("collapsed:");
  });

  it("編集結果が Markdown になる", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().rename("市場");
    useEditor.getState().writeNote("1200億円");

    const md = serializeMarkdown(useEditor.getState().buildDoc()!);
    expect(md).toContain("- 市場\n");
    expect(md).toContain("  1200億円\n");
  });

  it("マップを開いていなければ null", () => {
    useEditor.getState().close();
    expect(useEditor.getState().buildDoc()).toBeNull();
  });
});

describe("移動と階層操作", () => {
  it("方向キーで選択が移る", () => {
    useEditor.getState().move("down");
    expect(useEditor.getState().selectedUid).toBe(uidOf("A"));
    useEditor.getState().move("down");
    expect(useEditor.getState().selectedUid).toBe(uidOf("A1"));
    useEditor.getState().move("left");
    expect(useEditor.getState().selectedUid).toBe(uidOf("A"));
  });

  it("兄弟を追加するとその場で編集状態になる", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().addSibling();
    const state = useEditor.getState();
    expect(state.editingUid).toBe(state.selectedUid);
    expect(state.selectedUid).not.toBe(uidOf("A"));
  });

  it("階層の上げ下げができる", () => {
    useEditor.getState().select(uidOf("B"));
    useEditor.getState().indent();
    expect(currentShape()).toEqual(["根", [["A", ["A1", "B"]]]]);

    useEditor.getState().outdent();
    expect(currentShape()).toEqual(["根", [["A", ["A1"]], "B"]]);
  });

  it("ドラッグでの付け替えができる", () => {
    useEditor.getState().reparent(uidOf("A1"), uidOf("B"));
    expect(currentShape()).toEqual(["根", ["A", ["B", ["A1"]]]]);
  });
});

describe("表示の状態", () => {
  it("インライン編集の開始と終了", () => {
    const uid = uidOf("A");
    useEditor.getState().beginEdit(uid);
    expect(useEditor.getState().editingUid).toBe(uid);
    expect(useEditor.getState().selectedUid).toBe(uid);

    useEditor.getState().endEdit();
    expect(useEditor.getState().editingUid).toBeNull();
  });

  it("選択し直すと編集は終わる", () => {
    useEditor.getState().beginEdit(uidOf("A"));
    useEditor.getState().select(uidOf("B"));
    expect(useEditor.getState().editingUid).toBeNull();
  });

  it("表示モードを切り替える", () => {
    expect(useEditor.getState().mode).toBe("canvas");
    useEditor.getState().setMode("outline");
    expect(useEditor.getState().mode).toBe("outline");
    useEditor.getState().setMode("canvas");
  });

  it("選択中のノードを取り出せる", () => {
    useEditor.getState().select(uidOf("A"));
    expect(selectedNode(useEditor.getState())?.label).toBe("A");

    useEditor.getState().close();
    expect(selectedNode(useEditor.getState())).toBeNull();
  });

  it("マップを開いていなければ編集操作は何もしない", () => {
    useEditor.getState().close();
    const before = useEditor.getState();

    useEditor.getState().addChild();
    useEditor.getState().move("down");
    useEditor.getState().toggleCollapse();
    useEditor.getState().rename("無視される");
    useEditor.getState().markSaved("v2", 0);
    useEditor.getState().setVersion("v3");

    expect(useEditor.getState().root).toBe(before.root);
    expect(useEditor.getState().map).toBeNull();
  });
});

describe("木ごとの差し替え（キャンバスからの取り込み）", () => {
  it("差し替えた木になり、未保存として扱う", () => {
    const replacement: MapNode = {
      uid: "r",
      path: "",
      label: "取り込んだ根",
      links: [],
      children: [{ uid: "c", path: "0", label: "取り込んだ子", links: [], children: [] }],
    };

    useEditor.getState().replaceTree(replacement, new Set(["c"]));

    expect(currentShape()).toEqual(["取り込んだ根", ["取り込んだ子"]]);
    expect(useEditor.getState().status.kind).toBe("dirty");
    expect(useEditor.getState().collapsedUids).toEqual(new Set(["c"]));
  });

  it("差し替えを取り消せる", () => {
    const before = currentShape();
    useEditor
      .getState()
      .replaceTree({ uid: "r", path: "", label: "別の木", links: [], children: [] }, new Set());
    useEditor.getState().undo();
    expect(currentShape()).toEqual(before);
  });

  it("選択していたノードが消えていたらルートを選び直す", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor
      .getState()
      .replaceTree({ uid: "r", path: "", label: "別の木", links: [], children: [] }, new Set());
    expect(useEditor.getState().selectedUid).toBe("r");
  });

  it("選択していたノードが残っていれば選択を保つ", () => {
    const uid = uidOf("A");
    const kept: MapNode = {
      uid: useEditor.getState().root?.uid ?? "r",
      path: "",
      label: "根",
      links: [],
      children: [{ uid, path: "0", label: "A", links: [], children: [] }],
    };
    useEditor.getState().select(uid);
    useEditor.getState().replaceTree(kept, new Set());
    expect(useEditor.getState().selectedUid).toBe(uid);
  });

  it("マップを開いていなければ差し替えない", () => {
    useEditor.getState().close();
    useEditor
      .getState()
      .replaceTree({ uid: "r", path: "", label: "無視", links: [], children: [] }, new Set());
    expect(useEditor.getState().root).toBeNull();
  });
});

describe("掴んで落とす（2.9-3）", () => {
  /** いまの木を Markdown にして比べる。形と中身をまとめて見られる */
  function serialize(): string {
    const doc = useEditor.getState().buildDoc();
    if (doc === null) throw new Error("マップが開かれていません");
    return serializeMarkdown(doc);
  }

  beforeEach(() => {
    useEditor.getState().close();
    openSource();
  });

  it("落とした結果が木に反映される", () => {
    useEditor.getState().dropNode(uidOf("A1"), uidOf("B"), "inside");
    const b = locate(useEditor.getState().root as MapNode, uidOf("B"));
    expect(b?.node.children.map((child) => child.label)).toEqual(["A1"]);
  });

  it("取り消せる", () => {
    const before = serialize();
    useEditor.getState().dropNode(uidOf("A1"), uidOf("B"), "inside");
    expect(serialize()).not.toBe(before);
    useEditor.getState().undo();
    expect(serialize()).toBe(before);
  });

  it("畳まれた枝の中へ落とすと、その枝が開く", () => {
    // 開かないと落とした行が画面から消え、
    // 移動できなかったのか隠れただけなのかを利用者が区別できない
    useEditor.getState().select(uidOf("B"));
    useEditor.getState().toggleCollapse();
    useEditor.getState().dropNode(uidOf("A1"), uidOf("B"), "inside");

    expect(useEditor.getState().collapsedUids.has(uidOf("B"))).toBe(false);
  });

  it("成立しない移動では、畳んだ状態にも触らない", () => {
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().toggleCollapse();
    const before = serialize();

    // 自分の子孫の中へは落とせない
    useEditor.getState().dropNode(uidOf("A"), uidOf("A1"), "inside");

    expect(serialize()).toBe(before);
    expect(useEditor.getState().collapsedUids.has(uidOf("A"))).toBe(true);
    expect(useEditor.getState().past).toHaveLength(0);
  });
});
