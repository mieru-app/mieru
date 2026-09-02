import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../../../core/parse.js";
import { serializeMarkdown } from "../../../core/serialize.js";
import type { MapNode } from "../../../core/types.js";
import { DEFAULT_PALETTE } from "../../../state/palette.js";
import { flatten } from "../../../state/tree.js";
import type { MindElixirData } from "../adapter.js";
import { fromMindElixir, toArrows, toMindElixir } from "../adapter.js";

/**
 * mind-elixir との相互変換の検証。
 *
 * 最も恐いのは「キャンバスで1回操作しただけでノートや横断リンクが消える」ことである。
 * 変換の往復で本文が変わらないことを中心に確かめる。
 */

const SOURCE = `---
title: 根
---

# 根

- 市場 🌏
  - TAM試算
    既存レポートでは1,200億円。
- 規制動向 → [[市場]]
`;

function load(): MapNode {
  return parseMarkdown(SOURCE).doc.root;
}

function uidOf(root: MapNode, label: string): string {
  const node = flatten(root).find((item) => item.label === label);
  if (node === undefined) throw new Error(`ラベルが見つかりません: ${label}`);
  return node.uid;
}

describe("モデル → mind-elixir", () => {
  it("uid をそのまま id に使う", () => {
    const root = load();
    expect(toMindElixir(root, new Set()).nodeData.id).toBe(root.uid);
  });

  it("ラベルを topic に、絵文字を icons に載せる", () => {
    const root = load();
    const market = toMindElixir(root, new Set()).nodeData.children?.[0];
    expect(market?.topic).toBe("市場");
    expect(market?.icons).toEqual(["🌏"]);
  });

  it("ノートを note として渡す", () => {
    const root = load();
    const tam = toMindElixir(root, new Set()).nodeData.children?.[0]?.children?.[0];
    expect(tam?.note).toBe("既存レポートでは1,200億円。");
  });

  it("折り畳みを expanded=false として渡す", () => {
    const root = load();
    const data = toMindElixir(root, new Set([uidOf(root, "市場")]));
    expect(data.nodeData.children?.[0]?.expanded).toBe(false);
    expect(data.nodeData.children?.[1]?.expanded).toBe(true);
  });

  it("空ラベルでも topic を空にしない（mind-elixir が扱えないため）", () => {
    const root: MapNode = { uid: "r", path: "", label: "", links: [], children: [] };
    expect(toMindElixir(root, new Set()).nodeData.topic).not.toBe("");
  });
});

describe("ブランチ自動配色（F-24）", () => {
  it("第1階層ごとに色を分け、その下は親の色を継ぐ", () => {
    const root = load();
    const [market, rule] = toMindElixir(root, new Set()).nodeData.children ?? [];

    expect(market?.branchColor).toBe(DEFAULT_PALETTE[0]);
    expect(rule?.branchColor).toBe(DEFAULT_PALETTE[1]);
    expect(market?.children?.[0]?.branchColor).toBe(DEFAULT_PALETTE[0]);
  });

  it("中心テーマには色を付けない", () => {
    expect(toMindElixir(load(), new Set()).nodeData.branchColor).toBeUndefined();
  });

  it("frontmatter に色があればそれを使う", () => {
    const data = toMindElixir(load(), new Set(), ["#111111", "#222222"]);
    expect(data.nodeData.children?.[0]?.branchColor).toBe("#111111");
    expect(data.nodeData.children?.[1]?.branchColor).toBe("#222222");
  });
});

describe("横断リンクの矢印（F-17）", () => {
  it("同じラベルのノードへ矢印を引く", () => {
    const root = load();
    const arrows = toArrows(root);

    expect(arrows).toHaveLength(1);
    expect(arrows[0]?.from).toBe(uidOf(root, "規制動向 → [[市場]]"));
    expect(arrows[0]?.to).toBe(uidOf(root, "市場"));
  });

  it("宛先が無いリンクには矢印を作らない", () => {
    const { doc } = parseMarkdown("# 根\n\n- 参照 [[存在しない]]\n");
    expect(toArrows(doc.root)).toEqual([]);
  });

  it("自分自身へのリンクは描かない", () => {
    const { doc } = parseMarkdown("# 根\n\n- [[自分]]\n");
    // ラベルが `[[自分]]` そのものなので、宛先ラベル「自分」は存在しない
    expect(toArrows(doc.root)).toEqual([]);
  });

  it("変換結果に矢印が含まれる", () => {
    expect(toMindElixir(load(), new Set()).arrows).toHaveLength(1);
  });
});

describe("mind-elixir → モデル", () => {
  it("往復しても Markdown が変わらない", () => {
    const doc = parseMarkdown(SOURCE).doc;
    const { root } = fromMindElixir(toMindElixir(doc.root, new Set()), doc.root);
    expect(serializeMarkdown({ ...doc, root })).toBe(serializeMarkdown(doc));
  });

  it("折り畳みも往復する", () => {
    const root = load();
    const collapsed = new Set([uidOf(root, "市場")]);
    const back = fromMindElixir(toMindElixir(root, collapsed), root);
    expect(back.collapsedUids).toEqual(collapsed);
  });

  it("横断リンクは mind-elixir が持たないので変換前の木から引き継ぐ", () => {
    const root = load();
    // mind-elixir 側が links を落とした状態を模す
    const data: MindElixirData = {
      nodeData: {
        id: root.uid,
        topic: "根",
        children: [{ id: uidOf(root, "規制動向 → [[市場]]"), topic: "規制動向 → [[市場]]" }],
      },
    };

    const { root: back } = fromMindElixir(data, root);
    expect(back.children[0]?.links).toEqual(["市場"]);
  });

  it("キャンバスで作られた新しいノードも取り込む", () => {
    const root = load();
    const data = toMindElixir(root, new Set());
    data.nodeData.children?.push({ id: "新規", topic: "キャンバスで追加" });

    const { root: back } = fromMindElixir(data, root);
    expect(back.children.map((child) => child.label)).toEqual([
      "市場",
      "規制動向 → [[市場]]",
      "キャンバスで追加",
    ]);
    expect(back.children[2]?.links).toEqual([]);
  });

  it("取り込んだ木の path を振り直す", () => {
    const root = load();
    const { root: back } = fromMindElixir(toMindElixir(root, new Set()), root);
    expect(flatten(back).map((node) => node.path)).toEqual(["", "0", "0.0", "1"]);
  });

  it("mind-elixir 側で消されたノードは消えたまま取り込む", () => {
    const root = load();
    const data = toMindElixir(root, new Set());
    data.nodeData.children = data.nodeData.children?.slice(1);

    const { root: back } = fromMindElixir(data, root);
    expect(back.children.map((child) => child.label)).toEqual(["規制動向 → [[市場]]"]);
  });

  it("空の代替 topic はラベルの空文字列に戻す", () => {
    const root: MapNode = { uid: "r", path: "", label: "", links: [], children: [] };
    const { root: back } = fromMindElixir(toMindElixir(root, new Set()), root);
    expect(back.label).toBe("");
  });
});
