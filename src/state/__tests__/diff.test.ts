import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { countChanges, diffLines } from "../diff.js";
import type { DiffLine } from "../diff.js";

/**
 * 行の並びを、保存される形の Markdown にする。
 *
 * **空の配列と「空行1つ」を区別するには、末尾の改行が要る。**
 * どちらも `join("\n")` では空文字列になってしまい、差分の側は
 * 前者を0行、後者を1行として扱う（保存される `.md` は必ず改行で終わる）。
 */
function toMarkdown(lines: readonly string[]): string {
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/** 差分から変更前の内容を組み立て直す */
function rebuildBefore(lines: readonly DiffLine[]): string[] {
  return lines.filter((line) => line.kind !== "added").map((line) => line.text);
}

/** 差分から変更後の内容を組み立て直す */
function rebuildAfter(lines: readonly DiffLine[]): string[] {
  return lines.filter((line) => line.kind !== "removed").map((line) => line.text);
}

describe("diffLines", () => {
  it("同じ内容なら全て same", () => {
    const lines = diffLines("# a\n- b\n", "# a\n- b\n");
    expect(lines.map((line) => line.kind)).toEqual(["same", "same"]);
  });

  it("足した行を added として出す", () => {
    const lines = diffLines("# a\n", "# a\n- b\n");
    expect(lines).toEqual([
      { kind: "same", text: "# a" },
      { kind: "added", text: "- b" },
    ]);
  });

  it("消した行を removed として出す", () => {
    // DoD の「誤って消した枝」が、差分で見えることを確かめる
    const lines = diffLines("# a\n- 大事な枝\n- b\n", "# a\n- b\n");
    expect(lines).toEqual([
      { kind: "same", text: "# a" },
      { kind: "removed", text: "- 大事な枝" },
      { kind: "same", text: "- b" },
    ]);
  });

  it("書き換えた行は削除してから追加として出す", () => {
    const lines = diffLines("# a\n- 前\n", "# a\n- 後\n");
    expect(lines).toEqual([
      { kind: "same", text: "# a" },
      { kind: "removed", text: "- 前" },
      { kind: "added", text: "- 後" },
    ]);
  });

  it("空から作った場合は全て added", () => {
    expect(diffLines("", "# a\n").map((line) => line.kind)).toEqual(["added"]);
  });

  it("空にした場合は全て removed", () => {
    expect(diffLines("# a\n", "").map((line) => line.kind)).toEqual(["removed"]);
  });

  it("末尾の改行で空行を増やさない", () => {
    expect(diffLines("# a\n", "# a\n")).toHaveLength(1);
  });

  it("大きな文書の一箇所だけを直しても、その1行だけが出る", () => {
    // 前後の一致部分を先に落としているかの確認。落としていないと
    // 行数の積だけ時間がかかる
    const before = Array.from({ length: 2000 }, (_, i) => `- ${String(i)}`).join("\n");
    const after = before.replace("- 1000", "- 千");

    const changed = diffLines(before, after).filter((line) => line.kind !== "same");
    expect(changed).toEqual([
      { kind: "removed", text: "- 1000" },
      { kind: "added", text: "- 千" },
    ]);
  });

  it("丸ごと入れ替わっても返ってくる", () => {
    // 総当たりの上限に触れる場合。読める差分にはならないが、止まってはいけない
    const before = Array.from({ length: 1500 }, (_, i) => `a${String(i)}`).join("\n");
    const after = Array.from({ length: 1500 }, (_, i) => `b${String(i)}`).join("\n");

    const lines = diffLines(before, after);
    expect(countChanges(lines)).toEqual({ added: 1500, removed: 1500 });
  });
});

describe("差分は元の2つを復元できる（プロパティ）", () => {
  it("same と removed を並べると変更前、same と added を並べると変更後になる", () => {
    /*
     * **これが崩れると差分は嘘をつく。** 画面に出るのは差分だけなので、
     * 元の内容と対応していなければ、利用者は無い変更を見て版を戻す。
     */
    const text = fc.array(fc.constantFrom("# a", "- b", "- c", "  note", ""), { maxLength: 40 });
    fc.assert(
      fc.property(text, text, (before, after) => {
        const lines = diffLines(toMarkdown(before), toMarkdown(after));
        expect(rebuildBefore(lines)).toEqual(before);
        expect(rebuildAfter(lines)).toEqual(after);
      }),
      { numRuns: 300 },
    );
  });

  it("同じものを比べると変更が0件になる", () => {
    const text = fc.array(fc.constantFrom("# a", "- b", "- c", ""), { maxLength: 30 });
    fc.assert(
      fc.property(text, (lines) => {
        const md = toMarkdown(lines);
        expect(countChanges(diffLines(md, md))).toEqual({ added: 0, removed: 0 });
      }),
      { numRuns: 200 },
    );
  });
});

describe("countChanges", () => {
  it("増えた行と減った行を数える", () => {
    const lines = diffLines("# a\n- 1\n- 2\n", "# a\n- 3\n");
    expect(countChanges(lines)).toEqual({ added: 1, removed: 2 });
  });
});
