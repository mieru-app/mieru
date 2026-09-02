import { describe, expect, it } from "vitest";

import { exportMarkdown, findNodeByPath } from "../export.js";
import { splitFrontmatter } from "../frontmatter.js";
import { parseMarkdown } from "../parse.js";
import { serializeMarkdown } from "../serialize.js";

/** 設計書 7.3 の例をそのまま使う */
const SAMPLE = `---
title: 新規事業の論点整理
tags: [strategy, 2026Q3]
created: 2026-09-01T10:00:00Z
updated: 2026-09-01T14:32:00Z
mm:
  collapsed: ["1.0"]
  colors: auto
---

# 新規事業の論点整理

- 市場 🌏
  - TAM試算
    既存レポートでは1,200億円。ただし定義が広すぎる疑いがある。
    自社が取りうる範囲に絞ると300億円程度と見るのが妥当。
  - 競合の空白地帯
- 自社の強み 💪
  - 既存顧客基盤
`;

const doc = parseMarkdown(SAMPLE).doc;

describe("テキスト出力", () => {
  it("frontmatter を出力しない（設計原則2）", () => {
    for (const format of ["heading", "bullet"] as const) {
      const output = exportMarkdown(doc, format);
      expect(output).not.toContain("---");
      expect(output).not.toContain("collapsed:");
      expect(output).not.toContain("mm:");
      expect(output).not.toContain("tags:");
    }
  });

  it("箇条書き形式は本文をそのまま出力する", () => {
    expect(exportMarkdown(doc, "bullet")).toBe(`# 新規事業の論点整理

- 市場 🌏
  - TAM試算
    既存レポートでは1,200億円。ただし定義が広すぎる疑いがある。
    自社が取りうる範囲に絞ると300億円程度と見るのが妥当。
  - 競合の空白地帯
- 自社の強み 💪
  - 既存顧客基盤
`);
  });

  it("見出し形式は第1〜3階層を見出しへ昇格しノートを本文段落にする", () => {
    expect(exportMarkdown(doc, "heading")).toBe(`# 新規事業の論点整理

## 市場 🌏

### TAM試算

既存レポートでは1,200億円。ただし定義が広すぎる疑いがある。
自社が取りうる範囲に絞ると300億円程度と見るのが妥当。

### 競合の空白地帯

## 自社の強み 💪

### 既存顧客基盤
`);
  });

  it("起点を渡すとそこから下だけを出力する", () => {
    expect(exportMarkdown(doc, "heading", { fromPath: "0" })).toBe(`# 市場 🌏

## TAM試算

既存レポートでは1,200億円。ただし定義が広すぎる疑いがある。
自社が取りうる範囲に絞ると300億円程度と見るのが妥当。

## 競合の空白地帯
`);
  });

  it("箇条書き形式でも起点から下だけを出力する", () => {
    expect(exportMarkdown(doc, "bullet", { fromPath: "0" })).toBe(`# 市場 🌏

- TAM試算
  既存レポートでは1,200億円。ただし定義が広すぎる疑いがある。
  自社が取りうる範囲に絞ると300億円程度と見るのが妥当。
- 競合の空白地帯
`);
  });

  it("箇条書き × 全体は保存される本文と一致する（同じ関数を通しているため）", () => {
    const { body } = splitFrontmatter(serializeMarkdown(doc));
    expect(exportMarkdown(doc, "bullet")).toBe(`${body.trim()}\n`);
  });

  it("既定の形式は見出し", () => {
    expect(exportMarkdown(doc)).toBe(exportMarkdown(doc, "heading"));
  });

  it("第4階層以降は箇条書きで出力する", () => {
    const deep = parseMarkdown(`# R

- a
  - b
    - c
      - d
        - e
`).doc;
    expect(exportMarkdown(deep, "heading")).toBe(`# R

## a

### b

#### c

- d
  - e
`);
  });

  it("起点が見つからない場合は例外を投げる", () => {
    for (const format of ["heading", "bullet"] as const) {
      expect(() => exportMarkdown(doc, format, { fromPath: "9.9" })).toThrow(
        /部分出力の起点が見つかりません/,
      );
    }
  });

  it("出力は必ず改行1つで終端する", () => {
    for (const format of ["heading", "bullet"] as const) {
      const output = exportMarkdown(doc, format);
      expect(output.endsWith("\n")).toBe(true);
      expect(output.endsWith("\n\n")).toBe(false);
    }
  });
});

describe("findNodeByPath", () => {
  it("空文字列はルートを返す", () => {
    expect(findNodeByPath(doc.root, "")?.label).toBe("新規事業の論点整理");
  });

  it("構造パスで子孫を辿れる", () => {
    expect(findNodeByPath(doc.root, "0")?.label).toBe("市場");
    expect(findNodeByPath(doc.root, "0.0")?.label).toBe("TAM試算");
    expect(findNodeByPath(doc.root, "1.0")?.label).toBe("既存顧客基盤");
  });

  it("存在しないパスは undefined を返す", () => {
    expect(findNodeByPath(doc.root, "9")).toBeUndefined();
    expect(findNodeByPath(doc.root, "0.0.0")).toBeUndefined();
    expect(findNodeByPath(doc.root, "abc")).toBeUndefined();
  });
});
