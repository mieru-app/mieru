import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../../../core/parse.js";
import { serializeMarkdown } from "../../../core/serialize.js";
import type { MapNode } from "../../../core/types.js";
import { DEFAULT_PALETTE } from "../../../state/palette.js";
import { flatten } from "../../../state/tree.js";
import type { MindElixirData } from "../adapter.js";
import { fromMindElixir, hiddenUids, toArrows, toMindElixir } from "../adapter.js";

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

/** 宛先が畳まれる側にあるマップ */
const TARGET_INSIDE = `---
title: 根
---

# 根

- 親
  - 的
- 元 → [[的]]
`;

/** 矢印の元が畳まれる側にあるマップ */
const SOURCE_INSIDE = `---
title: 根
---

# 根

- 親
  - 元 → [[的]]
- 的
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

describe("畳んだ枝と矢印（2026-09-04 の落ちる不具合）", () => {
  it("畳んだ枝の中のノードを数え上げる。畳んだノード自身は含めない", () => {
    const root = load();
    const hidden = hiddenUids(root, new Set([uidOf(root, "市場")]));
    expect(hidden.has(uidOf(root, "TAM試算"))).toBe(true);
    expect(hidden.has(uidOf(root, "市場"))).toBe(false);
    // `[[ ]]` はラベルに残るので、ラベルは行まるごとになる
    expect(hidden.has(uidOf(root, "規制動向 → [[市場]]"))).toBe(false);
  });

  it("何も畳んでいなければ矢印はそのまま出る", () => {
    const root = load();
    expect(toMindElixir(root, new Set()).arrows).toHaveLength(1);
  });

  it("**畳んだ枝の中を指す矢印は渡さない**", () => {
    /*
     * `mind-elixir` は矢印の両端を `findEle` で引くが、**見つからないと例外を投げる**。
     * 畳んだ枝の中を指す矢印を渡すと `refresh()` の中で落ちる。
     * ここを緩めると、横断リンクのあるマップを畳んだ瞬間に画面が真っ白になる
     */
    const root = load();
    const collapsed = new Set([uidOf(root, "市場")]);
    // 「規制動向 → 市場」の矢印は、宛先の市場が畳まれても市場自体は見えているので残る
    expect(toMindElixir(root, collapsed).arrows).toHaveLength(1);
  });

  it("宛先が畳まれた枝の中にあるときは矢印を落とす", () => {
    const { doc } = parseMarkdown(TARGET_INSIDE);
    const root = doc.root;
    const collapsed = new Set([uidOf(root, "親")]);
    expect(toMindElixir(root, new Set()).arrows).toHaveLength(1);
    expect(toMindElixir(root, collapsed).arrows).toHaveLength(0);
  });

  it("矢印の元が畳まれた枝の中にあるときも落とす", () => {
    const { doc } = parseMarkdown(SOURCE_INSIDE);
    const root = doc.root;
    expect(toMindElixir(root, new Set()).arrows).toHaveLength(1);
    expect(toMindElixir(root, new Set([uidOf(root, "親")])).arrows).toHaveLength(0);
  });

  it("矢印を落としても木そのものは変わらない", () => {
    // 表示の都合で内容を削ってはいけない
    const doc = parseMarkdown(SOURCE).doc;
    const root = doc.root;
    const collapsed = new Set([uidOf(root, "市場")]);
    const back = fromMindElixir(toMindElixir(root, collapsed), root);
    expect(serializeMarkdown({ ...doc, root: back.root })).toBe(serializeMarkdown(doc));
  });
});
