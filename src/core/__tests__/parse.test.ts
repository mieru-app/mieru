import { describe, expect, it } from "vitest";

import { assignPaths, parseMarkdown } from "../parse.js";
import { serializeMarkdown } from "../serialize.js";
import type { MapNode } from "../types.js";

/** 木構造をラベルの入れ子配列にして比較しやすくする */
function shape(node: MapNode): unknown {
  return node.children.length === 0 ? node.label : [node.label, node.children.map(shape)];
}

describe("基本構造", () => {
  it("H1 を中心テーマ、箇条書きを階層として読む", () => {
    const { doc } = parseMarkdown(`# 中心

- A
  - A1
  - A2
- B
`);
    expect(shape(doc.root)).toEqual(["中心", [["A", ["A1", "A2"]], "B"]]);
  });

  it("構造パスを振る（ルートは空文字列）", () => {
    const { doc } = parseMarkdown(`# R

- A
  - A1
    - A1a
- B
`);
    expect(doc.root.path).toBe("");
    expect(doc.root.children[0]?.path).toBe("0");
    expect(doc.root.children[0]?.children[0]?.path).toBe("0.0");
    expect(doc.root.children[0]?.children[0]?.children[0]?.path).toBe("0.0.0");
    expect(doc.root.children[1]?.path).toBe("1");
  });

  it("箇条書き直下のインデント段落をノートとして読む", () => {
    const { doc } = parseMarkdown(`# R

- TAM試算
  1行目
  2行目
`);
    expect(doc.root.children[0]?.label).toBe("TAM試算");
    expect(doc.root.children[0]?.note).toBe("1行目\n2行目");
  });

  it("空行で区切られた段落は改行2つで連結する", () => {
    const { doc } = parseMarkdown(`# R

- A
  段落1

  段落2
`);
    expect(doc.root.children[0]?.note).toBe("段落1\n\n段落2");
  });

  it("ラベル末尾の絵文字を分離する", () => {
    const { doc } = parseMarkdown("# R\n\n- 市場 🌏\n- 強み 💪\n- 途中に 🌏 がある\n");
    expect(doc.root.children[0]).toMatchObject({ label: "市場", emoji: "🌏" });
    expect(doc.root.children[1]).toMatchObject({ label: "強み", emoji: "💪" });
    // 末尾でなければ分離しない
    expect(doc.root.children[2]?.emoji).toBeUndefined();
    expect(doc.root.children[2]?.label).toBe("途中に 🌏 がある");
  });

  it("ZWJ 連結の絵文字も1つとして扱う", () => {
    const { doc } = parseMarkdown("# R\n\n- 家族 👨‍👩‍👧‍👦\n");
    expect(doc.root.children[0]).toMatchObject({ label: "家族", emoji: "👨‍👩‍👧‍👦" });
  });

  it("横断リンクを収集するがラベルからは除去しない", () => {
    const { doc } = parseMarkdown("# R\n\n- 規制動向 → [[市場]] と [[競合]]\n");
    expect(doc.root.children[0]?.links).toEqual(["市場", "競合"]);
    expect(doc.root.children[0]?.label).toBe("規制動向 → [[市場]] と [[競合]]");
  });

  it("インライン記法を解釈せず逐語的に保持する", () => {
    const { doc } = parseMarkdown("# R\n\n- **太字** と `コード` と [リンク](url)\n");
    expect(doc.root.children[0]?.label).toBe("**太字** と `コード` と [リンク](url)");
  });

  it("CRLF を LF に正規化する", () => {
    const { doc } = parseMarkdown("---\r\ntitle: T\r\n---\r\n\r\n# R\r\n\r\n- A\r\n  note\r\n");
    expect(doc.meta.title).toBe("T");
    expect(doc.root.label).toBe("R");
    expect(doc.root.children[0]?.note).toBe("note");
  });
});

describe("見出しによる階層（markmap 互換）", () => {
  it("H2 以降を階層として読む", () => {
    const { doc } = parseMarkdown(`# 中心

## A

### A1

## B
`);
    expect(shape(doc.root)).toEqual(["中心", [["A", ["A1"]], "B"]]);
  });

  it("見出しの下の箇条書きはその見出しの子になる", () => {
    const { doc } = parseMarkdown(`# 中心

## A

- A1
- A2

## B
`);
    expect(shape(doc.root)).toEqual(["中心", [["A", ["A1", "A2"]], "B"]]);
  });

  it("見出し直下の地の文はノートとして保持する", () => {
    const { doc } = parseMarkdown(`# 中心

## A

説明文です。
`);
    expect(doc.root.children[0]?.note).toBe("説明文です。");
  });

  it("ノートが複数回現れたら連結する", () => {
    const { doc } = parseMarkdown(`# 中心

一つ目。

二つ目。
`);
    expect(doc.root.note).toBe("一つ目。\n\n二つ目。");
  });

  it("見出しレベルが飛んでも破綻しない", () => {
    const { doc } = parseMarkdown(`# 中心

#### 深い

## 浅い
`);
    // H4 の後に H2 が来たらスタックを巻き戻し、どちらもルート直下になる
    expect(shape(doc.root)).toEqual(["中心", ["深い", "浅い"]]);
  });
});

describe("警告", () => {
  it("H1 が無ければ missing-h1", () => {
    const { warnings } = parseMarkdown("- A\n");
    expect(warnings.map((w) => w.kind)).toContain("missing-h1");
  });

  it("frontmatter に title があれば H1 が無くても警告しない", () => {
    const { doc, warnings } = parseMarkdown("---\ntitle: T\n---\n\n- A\n");
    expect(warnings.map((w) => w.kind)).not.toContain("missing-h1");
    expect(doc.root.label).toBe("T");
  });

  it("H1 が複数あれば multiple-h1 を警告し第1階層として扱う", () => {
    const { doc, warnings } = parseMarkdown("# 一つ目\n\n# 二つ目\n");
    expect(warnings.map((w) => w.kind)).toContain("multiple-h1");
    expect(shape(doc.root)).toEqual(["一つ目", ["二つ目"]]);
  });

  it("変換できない要素は破棄して警告する", () => {
    const { warnings } = parseMarkdown("# R\n\n---\n\n<div>a</div>\n");
    const kinds = warnings.filter((w) => w.kind === "unsupported-element");
    expect(kinds.length).toBeGreaterThanOrEqual(2);
    expect(kinds[0]?.line).toBeGreaterThan(0);
  });

  it("箇条書き内の変換できない要素も警告する", () => {
    const { warnings } = parseMarkdown("# R\n\n- A\n\n  <div>a</div>\n");
    expect(warnings.some((w) => w.message.includes("箇条書き内の"))).toBe(true);
  });

  /**
   * **引用とコードは破棄しない**（2026-09-05）。`.md` が正本である以上、
   * 開いて保存しただけで他人の書いたものが消えてはいけない。
   */
  it("引用とコードはノートとして保つ", () => {
    const { doc, warnings } = parseMarkdown("# R\n\n```js\ncode\n```\n\n> 引用\n");
    expect(warnings).toEqual([]);
    expect(doc.root.note).toBe("```js\ncode\n```\n\n> 引用");
  });

  it("frontmatter が YAML として壊れていれば invalid-frontmatter", () => {
    const { doc, warnings } = parseMarkdown("---\ntitle: [壊れた\n---\n\n# R\n");
    expect(warnings.map((w) => w.kind)).toContain("invalid-frontmatter");
    expect(doc.root.label).toBe("R");
  });

  it("frontmatter がマッピングでなければ invalid-frontmatter", () => {
    const { warnings } = parseMarkdown("---\n- a\n- b\n---\n\n# R\n");
    expect(warnings.map((w) => w.kind)).toContain("invalid-frontmatter");
  });

  it("警告の行番号は元ファイル基準になる（frontmatter の行数を含む）", () => {
    // 1:"# R" 2:"" 3:"<div>a</div>"
    const withoutFm = parseMarkdown("# R\n\n<div>a</div>\n");
    expect(withoutFm.warnings.find((w) => w.kind === "unsupported-element")?.line).toBe(3);

    // 1:"---" 2:"title: T" 3:"---" 4:"" 5:"# R" 6:"" 7:"<div>a</div>"
    const withFm = parseMarkdown("---\ntitle: T\n---\n\n# R\n\n<div>a</div>\n");
    expect(withFm.warnings.find((w) => w.kind === "unsupported-element")?.line).toBe(7);
  });
});

describe("frontmatter の読み取り", () => {
  it("メタ情報と表示状態を読む", () => {
    const { doc } = parseMarkdown(`---
title: タイトル
tags: [a, b]
created: 2026-01-01T00:00:00Z
updated: 2026-02-01T00:00:00Z
mm:
  collapsed: ["0", "1.0"]
  colors: ["#ff0000"]
---

# R
`);
    expect(doc.meta).toMatchObject({
      title: "タイトル",
      tags: ["a", "b"],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-02-01T00:00:00Z",
    });
    expect(doc.view).toEqual({ collapsed: ["0", "1.0"], colors: ["#ff0000"] });
  });

  it("mm が無ければ既定の表示状態になる", () => {
    const { doc } = parseMarkdown("---\ntitle: T\n---\n\n# R\n");
    expect(doc.view).toEqual({ collapsed: [], colors: "auto" });
  });

  it("閉じの --- が無ければ frontmatter とみなさない", () => {
    const { doc } = parseMarkdown("---\ntitle: T\n\n# R\n");
    expect(doc.meta.title).not.toBe("T");
  });

  it("id と version は呼び出し側から受け取る", () => {
    const { doc } = parseMarkdown("# R\n", { id: "a.md", version: "v7" });
    expect(doc.meta).toMatchObject({ id: "a.md", version: "v7" });
  });

  it("title が無ければ H1 から補完する", () => {
    const { doc } = parseMarkdown("# 中心テーマ\n");
    expect(doc.meta.title).toBe("中心テーマ");
  });
});

describe("assignPaths", () => {
  it("木を書き換えた後にパスを振り直せる", () => {
    const { doc } = parseMarkdown("# R\n\n- A\n- B\n");
    doc.root.children.reverse();
    assignPaths(doc.root);
    expect(doc.root.children.map((c) => `${c.label}:${c.path}`)).toEqual(["B:0", "A:1"]);
  });
});

describe("設計書の例", () => {
  it("6.1 の例を読み書きして往復する", () => {
    const source = `---
title: 新規事業の論点整理
tags: [strategy, 2026Q3]
created: 2026-09-01T10:00:00Z
updated: 2026-09-01T14:32:00Z
mm:
  collapsed: ["1.0", "2.1"]
---

# 新規事業の論点整理

- 市場 🌏
  - TAM試算
    既存レポートでは1,200億円。ただし定義が広すぎる疑いがある。
    自社が取りうる範囲に絞ると300億円程度と見るのが妥当。
  - 競合の空白地帯
- 自社の強み 💪
  - 既存顧客基盤
- リスク ⚠️
  - 規制動向 → [[市場]]
`;
    const { doc, warnings } = parseMarkdown(source);
    expect(warnings).toEqual([]);
    expect(serializeMarkdown(doc)).toBe(source);
  });
});
