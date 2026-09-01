import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { parseFrontmatter, serializeFrontmatter, splitFrontmatter } from "../frontmatter.js";
import type { MapMeta, ViewState } from "../types.js";
import { emitFlowSequence, emitScalar } from "../yaml-emit.js";

const meta = (over: Partial<MapMeta> = {}): MapMeta => ({
  id: "",
  title: "T",
  tags: [],
  created: "",
  updated: "",
  version: "",
  ...over,
});

const view = (over: Partial<ViewState> = {}): ViewState => ({
  collapsed: [],
  colors: "auto",
  ...over,
});

describe("YAML スカラーの出力", () => {
  it("平文で書ける値には引用符を付けない", () => {
    expect(emitScalar("新規事業の論点整理")).toBe("新規事業の論点整理");
    expect(emitScalar("2026-09-01T10:00:00Z")).toBe("2026-09-01T10:00:00Z");
    expect(emitScalar("C#")).toBe("C#");
  });

  it("数値として解釈されうる値は引用符で囲む", () => {
    // 10進以外の表記も YAML では数値になる。正規表現での判定では取りこぼす
    for (const value of ["0", "1.0", "-3", "1e5", "0x0", "0xFF", "0o7", ".inf", "-.inf", ".nan"]) {
      expect(emitScalar(value), value).toBe(`"${value}"`);
    }
  });

  it("真偽値・null として解釈されうる値は引用符で囲む", () => {
    for (const value of ["true", "False", "null", "~", "yes", "off"]) {
      expect(emitScalar(value), value).toBe(`"${value}"`);
    }
  });

  it("構文を壊す値は引用符で囲む", () => {
    for (const value of ["", " ", "a ", "a: b", "a #b", "a\nb", "#tag", "- item", "[x]", "{x}"]) {
      expect(emitScalar(value).startsWith('"'), JSON.stringify(value)).toBe(true);
    }
  });

  it("出力した値は必ず元の文字列として読み戻せる", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (value) => {
        const parsed: unknown = parseYaml(`v: ${emitScalar(value)}`);
        expect((parsed as Record<string, unknown>)["v"]).toBe(value);
      }),
      { numRuns: 3_000 },
    );
  });

  it("フローシーケンスの要素も元の文字列として読み戻せる", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 20 }), { maxLength: 5 }), (values) => {
        expect(parseYaml(emitFlowSequence(values))).toEqual(values);
      }),
      { numRuns: 3_000 },
    );
  });

  it("常時引用のフローシーケンスも読み戻せる（パス ID 用）", () => {
    expect(parseYaml(emitFlowSequence(["1.0", "2.1"], true))).toEqual(["1.0", "2.1"]);
    expect(emitFlowSequence(["1.0"], true)).toBe('["1.0"]');
  });
});

describe("frontmatter の分割", () => {
  it("先頭の frontmatter を本文から切り離す", () => {
    const result = splitFrontmatter("---\ntitle: T\n---\n\n# R\n");
    expect(result.yaml).toBe("title: T");
    expect(result.body).toBe("\n# R\n");
    expect(result.bodyStartLine).toBe(3);
  });

  it("frontmatter が無ければ全体が本文になる", () => {
    const result = splitFrontmatter("# R\n");
    expect(result).toEqual({ yaml: null, body: "# R\n", bodyStartLine: 0 });
  });

  it("閉じの --- が無ければ frontmatter とみなさない", () => {
    expect(splitFrontmatter("---\ntitle: T\n\n# R\n").yaml).toBeNull();
  });
});

describe("frontmatter の出力", () => {
  it("キー順を title → tags → created → updated → mm に固定する", () => {
    const output = serializeFrontmatter(
      meta({
        title: "T",
        tags: ["a"],
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-02T00:00:00Z",
      }),
      view({ collapsed: ["0"] }),
    );
    expect(output).toBe(`---
title: T
tags: [a]
created: 2026-01-01T00:00:00Z
updated: 2026-01-02T00:00:00Z
mm:
  collapsed: ["0"]
---
`);
  });

  it("空配列と既定値は省略する", () => {
    expect(serializeFrontmatter(meta(), view())).toBe("---\ntitle: T\n---\n");
  });

  it("colors が既定でなければ出力する", () => {
    const output = serializeFrontmatter(meta(), view({ colors: ["#ff0000"] }));
    expect(output).toContain('colors: ["#ff0000"]');
  });

  it("表示状態を本文側へ漏らさない（設計原則2）", () => {
    const output = serializeFrontmatter(meta(), view({ collapsed: ["0", "1.0"] }));
    // mm は frontmatter の内側にのみ現れる
    expect(output.endsWith("---\n")).toBe(true);
    expect(output.split("---")[1]).toContain("mm:");
  });
});

describe("frontmatter の読み取り", () => {
  it("型が合わない値は無視して既定値を使う", () => {
    const { data } = parseFrontmatter("title: 123\ntags: [1, a, true]\nmm: [壊れた]");
    expect(data.title).toBeUndefined();
    // 文字列以外は落とす
    expect(data.tags).toEqual(["a"]);
    expect(data.view).toEqual({ collapsed: [], colors: "auto" });
  });

  it("空の frontmatter は既定値になる", () => {
    expect(parseFrontmatter(null).data.view).toEqual({ collapsed: [], colors: "auto" });
    expect(parseFrontmatter("   ").data.tags).toEqual([]);
  });

  it("出力したものをそのまま読み戻せる", () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ maxLength: 20 }),
          tags: fc.array(fc.string({ maxLength: 10 }), { maxLength: 3 }),
          collapsed: fc.array(fc.stringMatching(/^\d(\.\d){0,2}$/), { maxLength: 3 }),
        }),
        ({ title, tags, collapsed }) => {
          const output = serializeFrontmatter(meta({ title, tags }), view({ collapsed }));
          const { data } = parseFrontmatter(splitFrontmatter(output).yaml);
          expect(data.title ?? "").toBe(title);
          expect(data.tags).toEqual(tags);
          expect(data.view.collapsed).toEqual(collapsed);
        },
      ),
      { numRuns: 3_000 },
    );
  });
});
