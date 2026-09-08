import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../../core/parse.js";
import type { MapMeta } from "../../core/types.js";
import { JA } from "../strings/ja.js";
import {
  allTemplates,
  instantiate,
  isTemplate,
  TEMPLATE_TAG,
  TEMPLATES,
  templateSource,
  userTemplates,
} from "../templates.js";

/**
 * 利用者のテンプレート（F-01、2026-09-09）の検証。
 *
 * テンプレートは `template` タグの付いたマップである。仕組みは「一覧から選び出す」
 * 「作るときに写して印を外す」の2つしか無く、**印を外し忘れると作った物が全て
 * テンプレートになる**ので、そこを必ず落とせるようにしておく。
 */

function meta(id: string, tags: string[] = []): MapMeta {
  return { id, title: id.replace(/\.md$/, ""), tags, created: "", updated: "", version: "v1" };
}

describe("利用者のテンプレート（template タグ）", () => {
  it("template タグの付いたマップだけがテンプレートになる", () => {
    expect(isTemplate(meta("a.md", [TEMPLATE_TAG]))).toBe(true);
    expect(isTemplate(meta("b.md", ["meeting"]))).toBe(false);
    expect(isTemplate(meta("c.md"))).toBe(false);
  });

  it("表題順に並び、id はファイル名のまま。本文はそのマップから読む", () => {
    const mine = userTemplates([
      meta("b.md", [TEMPLATE_TAG]),
      meta("a.md", [TEMPLATE_TAG]),
      meta("ただのマップ.md"),
    ]);
    expect(mine.map((template) => template.id)).toEqual(["a.md", "b.md"]);
    expect(mine.every((template) => template.fromMap === template.id)).toBe(true);
    expect(mine[0]?.name(JA)).toBe("a");
  });

  it("空 → 自分のテンプレート → 組み込み の順に並ぶ", () => {
    const ids = allTemplates(userTemplates([meta("mine.md", [TEMPLATE_TAG])])).map((t) => t.id);
    expect(ids[0]).toBe("blank");
    expect(ids[1]).toBe("mine.md");
    expect(ids.slice(2)).toEqual(TEMPLATES.slice(1).map((template) => template.id));
  });

  it("templateSource: 自分のは fromMap、組み込みは本文、空と不明は undefined", () => {
    const all = allTemplates(userTemplates([meta("mine.md", [TEMPLATE_TAG])]));
    expect(templateSource("mine.md", all, JA)).toEqual({ fromMap: "mine.md" });
    expect(templateSource("swot", all, JA)).toBe(JA.template.swotBody);
    expect(templateSource("blank", all, JA)).toBeUndefined();
    // 選んでいた下敷きが別のエディタで消された場合。エラーにせず空のマップへ倒す
    expect(templateSource("消えた.md", all, JA)).toBeUndefined();
  });
});

describe("下敷きから作る（instantiate）", () => {
  const AT = "2026-09-09T00:00:00.000Z";
  const TEMPLATE = `---
title: 議事録（自分用）
tags: [template, meeting]
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-02T00:00:00.000Z
mm:
  colors: ["#ff0000"]
---

# 議事録（自分用）

- 決まったこと
  ここにメモ
- 宿題
`;

  it("template タグを外し、他のタグは残す。作った物が全てテンプレートになってはいけない", () => {
    const { doc } = parseMarkdown(instantiate(TEMPLATE, "x.md", "9月の定例", AT));
    expect(doc.meta.tags).toEqual(["meeting"]);
  });

  it("表題と H1 を差し替え、日付を今にする", () => {
    const md = instantiate(TEMPLATE, "x.md", "9月の定例", AT);
    const { doc } = parseMarkdown(md);
    expect(doc.meta.title).toBe("9月の定例");
    expect(doc.root.label).toBe("9月の定例");
    expect(doc.meta.created).toBe(AT);
    expect(doc.meta.updated).toBe(AT);
    expect(md).not.toContain("議事録（自分用）");
  });

  it("枝・ノート・配色を写す", () => {
    const { doc } = parseMarkdown(instantiate(TEMPLATE, "x.md", "9月の定例", AT));
    expect(doc.root.children.map((child) => child.label)).toEqual(["決まったこと", "宿題"]);
    expect(doc.root.children[0]?.note).toBe("ここにメモ");
    expect(doc.view.colors).toEqual(["#ff0000"]);
  });

  it("frontmatter を持たない組み込みから作っても created が入る（2026-09-09 の実測で欠けていた）", () => {
    const md = instantiate(JA.template.swotBody, "x.md", "新しいマップ", AT);
    expect(md).toContain(`created: ${AT}`);
  });
});
