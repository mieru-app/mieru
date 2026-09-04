import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../../core/parse.js";
import { serializeMarkdown } from "../../core/serialize.js";
import type { MapDoc, MapNode } from "../../core/types.js";
import {
  addChild,
  addSibling,
  canDrop,
  collapsedPathsToUids,
  collapsedUidsToPaths,
  flatten,
  indent,
  locate,
  moveNode,
  moveSibling,
  moveTo,
  navigate,
  outdent,
  removeNode,
  setEmoji,
  setLabel,
  setNote,
  swapWithParent,
  toggleCollapsed,
  visibleNodes,
} from "../tree.js";

/**
 * 木構造の編集操作の検証。
 *
 * UI を自動テストしない方針のため、編集の正しさはここで担保する。
 * 「操作したら Markdown がどうなるか」まで確かめる意味で、
 * 形の確認には実際のシリアライズ結果を使う。
 */

const SOURCE = `---
title: 根
---

# 根

- A
  - A1
  - A2
- B
  - B1
`;

function load(): MapDoc {
  return parseMarkdown(SOURCE).doc;
}

/** ラベルで uid を引く。テストを読みやすくするため */
function uidOf(root: MapNode, label: string): string {
  const node = flatten(root).find((item) => item.label === label);
  if (node === undefined) throw new Error(`ラベルが見つかりません: ${label}`);
  return node.uid;
}

/** 木の形をラベルの入れ子で表す */
function shape(node: MapNode): unknown {
  return node.children.length === 0 ? node.label : [node.label, node.children.map(shape)];
}

describe("ノードの追加", () => {
  it("兄弟は直後に入る", () => {
    const { root } = load();
    const { root: next, selectUid } = addSibling(root, uidOf(root, "A"), "新");

    expect(shape(next)).toEqual(["根", [["A", ["A1", "A2"]], "新", ["B", ["B1"]]]]);
    expect(locate(next, selectUid)?.node.label).toBe("新");
  });

  it("ルートに兄弟を足そうとすると子になる（中心テーマは1つだけ）", () => {
    const { root } = load();
    const { root: next } = addSibling(root, root.uid, "新");
    expect(next.children.map((child) => child.label)).toEqual(["A", "B", "新"]);
  });

  it("子は末尾に入る", () => {
    const { root } = load();
    const { root: next } = addChild(root, uidOf(root, "A"), "A3");
    expect(shape(next)).toEqual([
      "根",
      [
        ["A", ["A1", "A2", "A3"]],
        ["B", ["B1"]],
      ],
    ]);
  });

  it("追加後に path が振り直される", () => {
    const { root } = load();
    const { root: next } = addSibling(root, uidOf(root, "A"), "新");
    expect(flatten(next).map((node) => node.path)).toEqual([
      "",
      "0",
      "0.0",
      "0.1",
      "1",
      "2",
      "2.0",
    ]);
  });

  it("元の木を書き換えない", () => {
    const { root } = load();
    const before = shape(root);
    addChild(root, uidOf(root, "A"), "A3");
    expect(shape(root)).toEqual(before);
  });
});

describe("ノードの削除", () => {
  it("部分木ごと消える", () => {
    const { root } = load();
    const { root: next } = removeNode(root, uidOf(root, "A"));
    expect(shape(next)).toEqual(["根", [["B", ["B1"]]]]);
  });

  it("削除後は同じ位置の兄弟を選ぶ", () => {
    const { root } = load();
    const { root: next, selectUid } = removeNode(root, uidOf(root, "A1"));
    expect(locate(next, selectUid)?.node.label).toBe("A2");
  });

  it("末尾を消したら手前の兄弟を選ぶ", () => {
    const { root } = load();
    const { root: next, selectUid } = removeNode(root, uidOf(root, "A2"));
    expect(locate(next, selectUid)?.node.label).toBe("A1");
  });

  it("最後の子を消したら親を選ぶ", () => {
    const { root } = load();
    const { root: next, selectUid } = removeNode(root, uidOf(root, "B1"));
    expect(locate(next, selectUid)?.node.label).toBe("B");
  });

  it("ルートは削除できない", () => {
    const { root } = load();
    const { root: next } = removeNode(root, root.uid);
    expect(shape(next)).toEqual(shape(root));
  });
});

describe("階層の変更", () => {
  it("Shift+Tab で階層が上がり、後続の兄弟を子として引き連れる", () => {
    const { root } = load();
    const { root: next } = outdent(root, uidOf(root, "A1"));
    // A1 が A の兄弟になり、A2 は A1 の子になる
    expect(shape(next)).toEqual(["根", ["A", ["A1", ["A2"]], ["B", ["B1"]]]]);
  });

  it("第1階層はこれ以上上げられない", () => {
    const { root } = load();
    expect(shape(outdent(root, uidOf(root, "A")).root)).toEqual(shape(root));
  });

  it("階層を下げると直前の兄弟の末子になる", () => {
    const { root } = load();
    const { root: next } = indent(root, uidOf(root, "B"));
    expect(shape(next)).toEqual(["根", [["A", ["A1", "A2", ["B", ["B1"]]]]]]);
  });

  it("先頭の兄弟は下げられない", () => {
    const { root } = load();
    expect(shape(indent(root, uidOf(root, "A")).root)).toEqual(shape(root));
  });

  it("親子を反転すると、子が親の位置へ上がり親は先頭の子になる", () => {
    const { root } = load();
    const { root: next } = swapWithParent(root, uidOf(root, "A1"));
    // A1 が A の席（第1階層の先頭）へ移り、A はその先頭の子として下がる。
    // A の残りの子だった A2 は A に付いていく
    expect(shape(next)).toEqual(["根", [["A1", [["A", ["A2"]]]], ["B", ["B1"]]]]);
  });

  it("反転しても兄弟の中の位置は変わらない", () => {
    const { root } = load();
    const { root: next } = swapWithParent(root, uidOf(root, "B1"));
    // B は 2 番目だった。B1 が上がっても 2 番目のままでなければ、
    // 反転のたびに無関係な並び順が動く
    expect(next.children.map((child) => child.label)).toEqual(["A", "B1"]);
  });

  it("反転してもノードは1つも失われない", () => {
    const { root } = load();
    const before = flatten(root).map((node) => node.label).sort();
    const { root: next } = swapWithParent(root, uidOf(root, "A1"));
    expect(flatten(next).map((node) => node.label).sort()).toEqual(before);
  });

  it("反転した本人が選択されたままになる", () => {
    const { root } = load();
    const uid = uidOf(root, "A1");
    expect(swapWithParent(root, uid).selectUid).toBe(uid);
  });

  it("親がルートのときは何もしない（題名が変わってしまうため）", () => {
    const { root } = load();
    // ルートのラベルはマップの題名である。ここで入れ替えると
    // 構造を組み替えたつもりで題名が変わる
    expect(shape(swapWithParent(root, uidOf(root, "A")).root)).toEqual(shape(root));
  });

  it("ルート自身は反転できない", () => {
    const { root } = load();
    expect(shape(swapWithParent(root, root.uid).root)).toEqual(shape(root));
  });
});

describe("並べ替えと移動", () => {
  it("兄弟間で下へ入れ替える", () => {
    const { root } = load();
    const { root: next } = moveSibling(root, uidOf(root, "A"), 1);
    expect(next.children.map((child) => child.label)).toEqual(["B", "A"]);
  });

  it("端では入れ替えない", () => {
    const { root } = load();
    expect(shape(moveSibling(root, uidOf(root, "A"), -1).root)).toEqual(shape(root));
    expect(shape(moveSibling(root, uidOf(root, "B"), 1).root)).toEqual(shape(root));
  });

  it("別の親の配下へ移せる", () => {
    const { root } = load();
    const { root: next } = moveTo(root, uidOf(root, "A1"), uidOf(root, "B"));
    expect(shape(next)).toEqual([
      "根",
      [
        ["A", ["A2"]],
        ["B", ["B1", "A1"]],
      ],
    ]);
  });

  it("自分の子孫へは移せない（木が壊れるため）", () => {
    const { root } = load();
    expect(shape(moveTo(root, uidOf(root, "A"), uidOf(root, "A1")).root)).toEqual(shape(root));
    expect(shape(moveTo(root, uidOf(root, "A"), uidOf(root, "A")).root)).toEqual(shape(root));
  });
});

describe("ラベルとノート", () => {
  it("ラベルを差し替える", () => {
    const { root } = load();
    const { root: next } = setLabel(root, uidOf(root, "A"), "改名");
    expect(next.children[0]?.label).toBe("改名");
  });

  it("ノートを設定・削除できる", () => {
    const { root } = load();
    const withNote = setNote(root, uidOf(root, "A"), "説明文").root;
    expect(withNote.children[0]?.note).toBe("説明文");

    const cleared = setNote(withNote, uidOf(withNote, "A"), "   ").root;
    expect(cleared.children[0]?.note).toBeUndefined();
  });

  it("ラベルを書き換えたら横断リンクも取り直す", () => {
    const { root } = load();
    const linked = setLabel(root, uidOf(root, "A"), "A → [[B]]").root;
    expect(linked.children[0]?.links).toEqual(["B"]);

    // 消したら links からも消える。ラベルが正で links はそこからの派生である
    const unlinked = setLabel(linked, uidOf(linked, "A → [[B]]"), "A").root;
    expect(unlinked.children[0]?.links).toEqual([]);
  });

  it("絵文字を設定・削除できる", () => {
    const { root } = load();
    const withEmoji = setEmoji(root, uidOf(root, "A"), "⭐").root;
    expect(withEmoji.children[0]?.emoji).toBe("⭐");

    const cleared = setEmoji(withEmoji, uidOf(withEmoji, "A"), "").root;
    expect(cleared.children[0]?.emoji).toBeUndefined();
  });

  it("絵文字はラベルの末尾として Markdown に出る", () => {
    const doc = load();
    const root = setEmoji(doc.root, uidOf(doc.root, "A"), "⭐").root;
    expect(serializeMarkdown({ ...doc, root })).toContain("- A ⭐\n");
  });

  it("編集した結果が Markdown に出る", () => {
    const doc = load();
    const root = setNote(
      setLabel(doc.root, uidOf(doc.root, "A"), "市場").root,
      uidOf(doc.root, "A1"),
      "1200億円",
    ).root;
    const md = serializeMarkdown({ ...doc, root });

    expect(md).toContain("- 市場\n");
    expect(md).toContain("    1200億円\n");
  });
});

describe("折り畳みと移動", () => {
  it("折り畳むと配下が見えなくなる", () => {
    const { root } = load();
    const collapsed = toggleCollapsed(root, uidOf(root, "A"), new Set());
    expect(visibleNodes(root, collapsed).map((node) => node.label)).toEqual(["根", "A", "B", "B1"]);
  });

  it("子を持たないノードは折り畳めない", () => {
    const { root } = load();
    expect(toggleCollapsed(root, uidOf(root, "A1"), new Set()).size).toBe(0);
  });

  it("もう一度呼ぶと展開される", () => {
    const { root } = load();
    const uid = uidOf(root, "A");
    expect(toggleCollapsed(root, uid, toggleCollapsed(root, uid, new Set())).size).toBe(0);
  });

  it("上下キーは見えているノードの順に移動する", () => {
    const { root } = load();
    const collapsed = toggleCollapsed(root, uidOf(root, "A"), new Set());
    const fromA = navigate(root, uidOf(root, "A"), "down", collapsed);
    expect(locate(root, fromA)?.node.label).toBe("B");
  });

  it("端では移動しない", () => {
    const { root } = load();
    expect(navigate(root, root.uid, "up", new Set())).toBe(root.uid);
    const last = uidOf(root, "B1");
    expect(navigate(root, last, "down", new Set())).toBe(last);
  });

  it("左は親、右は最初の子へ移る", () => {
    const { root } = load();
    const a = uidOf(root, "A");
    expect(navigate(root, a, "left", new Set())).toBe(root.uid);
    expect(locate(root, navigate(root, a, "right", new Set()))?.node.label).toBe("A1");
  });

  it("折り畳み中は右キーで潜らない", () => {
    const { root } = load();
    const a = uidOf(root, "A");
    expect(navigate(root, a, "right", toggleCollapsed(root, a, new Set()))).toBe(a);
  });
});

describe("折り畳みの保存形式との変換", () => {
  it("パスから uid へ、uid からパスへ往復する", () => {
    const { root } = load();
    const uids = collapsedPathsToUids(root, ["0"]);
    expect(locate(root, [...uids][0] ?? "")?.node.label).toBe("A");
    expect(collapsedUidsToPaths(root, uids)).toEqual(["0"]);
  });

  it("ノードを消しても折り畳みが別のノードへ移らない", () => {
    // 折り畳みをパスのまま持つと、A を消した瞬間に "0" は B を指すようになる。
    // uid で持つことでこの取り違えが起きない
    const { root } = load();
    const collapsed = toggleCollapsed(root, uidOf(root, "B"), new Set());
    expect(collapsedUidsToPaths(root, collapsed)).toEqual(["1"]);

    const { root: next } = removeNode(root, uidOf(root, "A"));
    expect(collapsedUidsToPaths(next, collapsed)).toEqual(["0"]);
    expect(visibleNodes(next, collapsed).map((node) => node.label)).toEqual(["根", "B"]);
  });

  it("消えたノードの折り畳みは保存形式に出ない", () => {
    const { root } = load();
    const collapsed = toggleCollapsed(root, uidOf(root, "A"), new Set());
    const { root: next } = removeNode(root, uidOf(root, "A"));
    expect(collapsedUidsToPaths(next, collapsed)).toEqual([]);
  });

  it("ルートは折り畳み対象にしない", () => {
    const { root } = load();
    expect(collapsedUidsToPaths(root, new Set([root.uid]))).toEqual([]);
  });
});

describe("見つからない対象に対しては何もしない", () => {
  it("知らない uid の移動はルートへ倒す", () => {
    const { root } = load();
    expect(navigate(root, "知らない", "down", new Set())).toBe(root.uid);
  });

  it("葉で右キーを押しても動かない", () => {
    const { root } = load();
    const leaf = uidOf(root, "A1");
    expect(navigate(root, leaf, "right", new Set())).toBe(leaf);
  });

  it("ルートで左キーを押しても動かない", () => {
    const { root } = load();
    expect(navigate(root, root.uid, "left", new Set())).toBe(root.uid);
  });

  it("知らない uid の編集は元の木をそのまま返す", () => {
    const { root } = load();
    expect(addChild(root, "知らない").root).toBe(root);
    expect(locate(root, "知らない")).toBeNull();
    expect(toggleCollapsed(root, "知らない", new Set()).size).toBe(0);
  });
});

describe("掴んで落とす（2.9-3）", () => {
  it("前へ差し込むと相手の兄弟になる", () => {
    const { root } = load();
    const { root: next } = moveNode(root, uidOf(root, "B"), uidOf(root, "A"), "before");
    expect(next.children.map((child) => child.label)).toEqual(["B", "A"]);
  });

  it("後ろへ差し込むと相手の次に入る", () => {
    const { root } = load();
    const { root: next } = moveNode(root, uidOf(root, "A1"), uidOf(root, "B"), "after");
    expect(shape(next)).toEqual(["根", [["A", ["A2"]], ["B", ["B1"]], "A1"]]);
  });

  it("中へ落とすと相手の末子になる", () => {
    const { root } = load();
    const { root: next } = moveNode(root, uidOf(root, "A1"), uidOf(root, "B"), "inside");
    expect(shape(next)).toEqual(["根", [["A", ["A2"]], ["B", ["B1", "A1"]]]]);
  });

  it("同じ親の中で動かしても添字がずれない", () => {
    // 自分を外した分だけ相手の位置が前へ動く。外す前の添字を使うと1つずれる
    const { root } = load();
    const { root: next } = moveNode(root, uidOf(root, "A"), uidOf(root, "B"), "after");
    expect(next.children.map((child) => child.label)).toEqual(["B", "A"]);
  });

  it("落とせない相手には落とさない", () => {
    const { root } = load();
    const a = uidOf(root, "A");
    const cases: [string, string, "before" | "after" | "inside"][] = [
      [a, a, "inside"], // 自分自身
      [a, uidOf(root, "A1"), "inside"], // 自分の子孫。木が輪になる
      [a, root.uid, "before"], // ルートに兄弟は作れない
      [root.uid, a, "inside"], // ルートは動かせない
    ];
    for (const [uid, targetUid, position] of cases) {
      expect(canDrop(root, uid, targetUid, position)).toBe(false);
      expect(shape(moveNode(root, uid, targetUid, position).root)).toEqual(shape(root));
    }
  });

  it("ルートの中へは落とせる（第1階層へ引き上げる操作になる）", () => {
    const { root } = load();
    expect(canDrop(root, uidOf(root, "A1"), root.uid, "inside")).toBe(true);
    const { root: next } = moveNode(root, uidOf(root, "A1"), root.uid, "inside");
    expect(shape(next)).toEqual(["根", [["A", ["A2"]], ["B", ["B1"]], "A1"]]);
  });

  it("どこへ落としてもノードは1つも失われない", () => {
    const { root } = load();
    const before = flatten(root).map((node) => node.label).sort();
    for (const position of ["before", "after", "inside"] as const) {
      const { root: next } = moveNode(root, uidOf(root, "A1"), uidOf(root, "B"), position);
      expect(flatten(next).map((node) => node.label).sort()).toEqual(before);
    }
  });

  it("moveTo は位置を指定しない moveNode である", () => {
    const { root } = load();
    const a1 = uidOf(root, "A1");
    const b = uidOf(root, "B");
    expect(shape(moveTo(root, a1, b).root)).toEqual(shape(moveNode(root, a1, b, "inside").root));
  });
});
