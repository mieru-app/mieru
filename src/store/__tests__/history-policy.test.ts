import { describe, expect, it } from "vitest";

import {
  byteLength,
  COALESCE_MS,
  decideHistoryWrite,
  MAX_BYTES,
  MAX_ENTRIES,
  trimHistory,
} from "../history-policy.js";

describe("decideHistoryWrite", () => {
  it("1件も無ければ足す", () => {
    expect(decideHistoryWrite({ previous: null, md: "# a\n", at: 1000 })).toBe("append");
  });

  it("内容が変わっていなければ何もしない", () => {
    // 折り畳みを開いて閉じただけでも保存は走る。同じ内容の版が並ぶと
    // 「どこで何が変わったか」が一覧から読めなくなる
    const previous = { since: 0, md: "# a\n" };
    expect(decideHistoryWrite({ previous, md: "# a\n", at: 999_999 })).toBe("skip");
  });

  it("まとめ始めてから5分以内なら、その版を置き換える", () => {
    const previous = { since: 0, md: "# a\n" };
    expect(decideHistoryWrite({ previous, md: "# b\n", at: COALESCE_MS - 1 })).toBe("replace");
  });

  it("5分を過ぎたら新しい版として足す", () => {
    const previous = { since: 0, md: "# a\n" };
    expect(decideHistoryWrite({ previous, md: "# b\n", at: COALESCE_MS })).toBe("append");
  });

  it("時計が巻き戻っても版を増やさない", () => {
    // 端末の時刻合わせで過去へ飛んだとき、遠い過去と読んで版を増やすと
    // 一覧の並びが壊れる。直前へまとめる方に倒す
    const previous = { since: 10_000_000, md: "# a\n" };
    expect(decideHistoryWrite({ previous, md: "# b\n", at: 0 })).toBe("replace");
  });

  it("編集を続けても5分ごとに版が刻まれる", () => {
    /*
     * 入力停止から 800ms で保存が走る（設計書 F-31）。素直に控えると
     * 30分で 100件を超え、一覧が数秒刻みで埋まる。
     *
     * **窓を「まとめ始めた時刻」から測るのが要点である。** 取り込んだ最新の
     * 時刻から測ると、まとめるたびに窓が先へずれ、打ち続けている限り
     * 5分が永久に来ない。30分打っても版が1つしか残らなくなる。
     */
    let previous: { since: number; md: string } | null = null;
    let appended = 0;
    for (let i = 0; i < 30 * 60; i += 1) {
      const at = i * 1000;
      const md = `# ${String(i)}\n`;
      const decision = decideHistoryWrite({ previous, md, at });
      if (decision === "skip") continue;
      if (decision === "append") appended += 1;
      // まとめ直すときは、まとめ始めた時刻を動かさない（`IdbHistoryStore` と同じ扱い）
      const since: number = decision === "replace" && previous !== null ? previous.since : at;
      previous = { since, md };
    }
    // 0分・5分・10分・15分・20分・25分 の6版
    expect(appended).toBe(6);
  });
});

describe("trimHistory", () => {
  const entry = (md: string) => ({ md });

  it("上限までは全部残す", () => {
    const entries = Array.from({ length: MAX_ENTRIES }, (_, i) => entry(`# ${String(i)}\n`));
    expect(trimHistory(entries)).toHaveLength(MAX_ENTRIES);
  });

  it("上限を超えたら古いものから捨てる", () => {
    const entries = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => entry(`# ${String(i)}\n`));
    const kept = trimHistory(entries);
    expect(kept).toHaveLength(MAX_ENTRIES);
    // 残るのは新しい方。並びは古い順のまま
    expect(kept[0]).toEqual(entry("# 5\n"));
    expect(kept[kept.length - 1]).toEqual(entry(`# ${String(MAX_ENTRIES + 4)}\n`));
  });

  it("総量の上限でも捨てる", () => {
    // 版数だけで抑えると、大きなマップでは数十MB になる。IndexedDB を
    // 使い切ると退避（quarantine）まで書けなくなる
    const big = "x".repeat(MAX_BYTES / 4);
    const entries = [entry(`${big}1`), entry(`${big}2`), entry(`${big}3`), entry(`${big}4`)];
    const kept = trimHistory(entries);
    expect(kept.length).toBeLessThan(entries.length);
    expect(kept.reduce((sum, each) => sum + byteLength(each.md), 0)).toBeLessThanOrEqual(MAX_BYTES);
  });

  it("上限を超える1件でも、最新のものは必ず残す", () => {
    // 1件も控えられない状態を作らない
    const huge = entry("x".repeat(MAX_BYTES * 2));
    expect(trimHistory([huge])).toEqual([huge]);
  });

  it("空なら空を返す", () => {
    expect(trimHistory([])).toEqual([]);
  });
});

describe("byteLength", () => {
  it("文字数ではなくバイト数で数える", () => {
    // Markdown はバイトで保存される。ラウンドトリップもバイト単位の一致で見る
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("あ")).toBe(3);
  });
});
