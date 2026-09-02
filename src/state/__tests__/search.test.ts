import { describe, expect, it } from "vitest";

import type { MapMeta } from "../../core/types.js";
import { MemoryStore } from "../../store/MemoryStore.js";
import type { MapIndex } from "../search.js";
import {
  buildMapIndex,
  collectTags,
  normalizeForSearch,
  queryIndex,
  SearchIndex,
  splitTerms,
} from "../search.js";

/**
 * 全マップ横断の検索（F-05）とタグ絞り込み（F-06）の検証。
 *
 * 「あるはずのマップが出てこない」は、利用者から見ればマップを失ったのと同じである。
 * 取りこぼしの経路（全角入力・大文字小文字・ノート内の一致）を1件ずつ確かめる。
 */

function md(title: string, body: string, tags: string[] = []): string {
  const tagLine = tags.length === 0 ? "" : `tags: [${tags.join(", ")}]\n`;
  return `---\ntitle: ${title}\n${tagLine}updated: 2026-09-01T00:00:00Z\n---\n\n# ${title}\n\n${body}\n`;
}

function meta(id: string, updated = "2026-09-01T00:00:00Z", version = "v1"): MapMeta {
  return { id, title: id.replace(/\.md$/, ""), tags: [], created: "", updated, version };
}

function indexOf(id: string, title: string, body: string, tags: string[] = []): MapIndex {
  return buildMapIndex(meta(id), md(title, body, tags));
}

describe("検索語の正規化", () => {
  it("全角で打った英数字を半角と同じに扱う", () => {
    expect(normalizeForSearch("ＡＩ　１２３")).toBe("ai 123");
  });

  it("大文字小文字を区別しない", () => {
    expect(normalizeForSearch("Roadmap")).toBe("roadmap");
  });

  it("全角空白でも語を分けられる", () => {
    expect(splitTerms("市場　リスク  ")).toEqual(["市場", "リスク"]);
  });
});

describe("索引の作成", () => {
  it("表題・ラベル・ノートを別々の種類として載せる", () => {
    const index = indexOf("a.md", "論点整理", "- 市場\n  既存レポートでは1,200億円。\n");

    expect(index.entries.map((entry) => entry.kind)).toEqual(["title", "label", "label", "note"]);
    expect(index.entries.map((entry) => entry.text)).toContain("既存レポートでは1,200億円。");
  });

  it("エスケープを解いた状態で載せる", () => {
    // 保存形式では `\#` だが、利用者が打つのは `#` である
    const index = buildMapIndex(meta("a.md"), "---\ntitle: t\n---\n\n# t\n\n- \\#戦略\n");
    expect(index.entries.some((entry) => entry.haystack.includes("#戦略"))).toBe(true);
  });

  it("frontmatter のタグを持つ", () => {
    expect(indexOf("a.md", "t", "- 枝", ["strategy", "reading"]).tags).toEqual([
      "strategy",
      "reading",
    ]);
  });
});

describe("検索", () => {
  const indexes = [
    indexOf("a.md", "新規事業の論点整理", "- 市場\n  TAM は 1,200億円。\n- リスク\n", ["strategy"]),
    indexOf("b.md", "読書メモ", "- 市場のつくりかた\n", ["reading"]),
    indexOf("c.md", "週次振返り", "- 今週やったこと\n", ["reading", "strategy"]),
  ];

  it("検索語が空なら全件を新しい順で返す", () => {
    const dated = [
      buildMapIndex(meta("old.md", "2026-01-01T00:00:00Z"), md("古い", "- x")),
      buildMapIndex(meta("new.md", "2026-09-01T00:00:00Z"), md("新しい", "- x")),
    ];
    expect(queryIndex(dated).map((hit) => hit.id)).toEqual(["new.md", "old.md"]);
  });

  it("ラベルにもノートにも当たる", () => {
    expect(queryIndex(indexes, { query: "市場" }).map((hit) => hit.id)).toEqual(["a.md", "b.md"]);
    expect(queryIndex(indexes, { query: "TAM" }).map((hit) => hit.id)).toEqual(["a.md"]);
  });

  it("空白で区切った語は全て含むマップだけを残す", () => {
    expect(queryIndex(indexes, { query: "市場 リスク" }).map((hit) => hit.id)).toEqual(["a.md"]);
    // 語ごとに別の場所へ当たってもよい
    expect(queryIndex(indexes, { query: "論点整理 TAM" }).map((hit) => hit.id)).toEqual(["a.md"]);
  });

  it("どこに当たったのかを添えて返す", () => {
    const [hit] = queryIndex(indexes, { query: "TAM" });
    expect(hit?.kind).toBe("note");
    expect(hit?.excerpt).toContain("TAM");
  });

  it("表題にだけ当たる語も拾う", () => {
    expect(queryIndex(indexes, { query: "振返り" }).map((hit) => hit.id)).toEqual(["c.md"]);
  });

  it("タグで絞り込む。複数指定は AND", () => {
    expect(queryIndex(indexes, { tags: ["reading"] }).map((hit) => hit.id)).toEqual([
      "b.md",
      "c.md",
    ]);
    expect(queryIndex(indexes, { tags: ["reading", "strategy"] }).map((hit) => hit.id)).toEqual([
      "c.md",
    ]);
  });

  it("検索語とタグは重ねて効く", () => {
    expect(queryIndex(indexes, { query: "市場", tags: ["reading"] }).map((hit) => hit.id)).toEqual([
      "b.md",
    ]);
  });

  it("長いノートは抜粋にする。一致箇所は必ず含める", () => {
    const long = `- 枝\n  ${"あ".repeat(200)}見つけたい語${"い".repeat(200)}\n`;
    const [hit] = queryIndex([indexOf("a.md", "t", long)], { query: "見つけたい語" });

    expect(hit?.excerpt).toContain("見つけたい語");
    expect(hit?.excerpt.length).toBeLessThan(80);
    expect(hit?.excerpt.startsWith("…")).toBe(true);
  });

  it("先頭で当たったときは前を省略しない", () => {
    const long = `- 枝\n  見つけたい語${"い".repeat(200)}\n`;
    const [hit] = queryIndex([indexOf("a.md", "t", long)], { query: "見つけたい語" });

    expect(hit?.excerpt.startsWith("見つけたい語")).toBe(true);
    expect(hit?.excerpt.endsWith("…")).toBe(true);
  });

  it("更新日時が同じ・空のマップがあっても並べ替えで落ちない", () => {
    const same = "2026-05-05T00:00:00Z";
    const shuffled = [
      buildMapIndex(meta("none.md", ""), md("日付なし", "- x")),
      buildMapIndex(meta("a.md", same), md("a", "- x")),
      buildMapIndex(meta("b.md", same), md("b", "- x")),
    ];

    // 日付を持たないファイルは最後へ回す。手書きの md が先頭を占めないため
    expect(queryIndex(shuffled).map((hit) => hit.id)).toEqual(["a.md", "b.md", "none.md"]);
  });
});

describe("タグの集計", () => {
  it("出現回数の多い順に並べる", () => {
    const indexes = [
      indexOf("a.md", "a", "- x", ["reading"]),
      indexOf("b.md", "b", "- x", ["reading", "strategy"]),
    ];
    expect(collectTags(indexes)).toEqual([
      { tag: "reading", count: 2 },
      { tag: "strategy", count: 1 },
    ]);
  });
});

describe("索引の更新", () => {
  it("内容が変わったマップだけを読み直す", async () => {
    const store = new MemoryStore({ "a.md": md("a", "- 最初"), "b.md": md("b", "- そのまま") });
    const reads: string[] = [];
    const spied = {
      list: () => store.list(),
      read: (id: string) => {
        reads.push(id);
        return store.read(id);
      },
      write: (id: string, text: string, base: string | null) => store.write(id, text, base),
      remove: (id: string) => store.remove(id),
    };

    const index = new SearchIndex(spied);
    await index.refresh(await store.list());
    expect(reads).toEqual(["a.md", "b.md"]);

    await store.write("a.md", md("a", "- 書き換えた"), (await store.list())[0]?.version ?? null);
    reads.length = 0;
    await index.refresh(await store.list());

    expect(reads).toEqual(["a.md"]);
    expect(queryIndex(index.all(), { query: "書き換えた" }).map((hit) => hit.id)).toEqual(["a.md"]);
  });

  it("消えたマップは索引から外れる", async () => {
    const store = new MemoryStore({ "a.md": md("a", "- 枝") });
    const index = new SearchIndex(store);
    await index.refresh(await store.list());
    expect(index.all()).toHaveLength(1);

    await store.remove("a.md");
    await index.refresh(await store.list());
    expect(index.all()).toEqual([]);
  });

  it("読めないマップがあっても検索全体は生きている", async () => {
    const store = new MemoryStore({ "a.md": md("a", "- 枝") });
    const broken = {
      list: () => store.list(),
      read: (id: string) =>
        id === "壊れた.md" ? Promise.reject(new Error("読めない")) : store.read(id),
      write: (id: string, text: string, base: string | null) => store.write(id, text, base),
      remove: (id: string) => store.remove(id),
    };

    const index = new SearchIndex(broken);
    await index.refresh([...(await store.list()), meta("壊れた.md")]);

    expect(index.all().map((entry) => entry.id)).toEqual(["a.md"]);
  });
});
