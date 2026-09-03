import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { COALESCE_MS, MAX_ENTRIES } from "../history-policy.js";
import { IdbHistoryStore } from "../IdbHistoryStore.js";
import { idbDelete, idbPut, STORE_HISTORY } from "../idb.js";
import { MapNotFoundError } from "../types.js";

/**
 * IndexedDB による履歴の検証（2.8-3）。
 *
 * ここが壊れると「戻したつもりが戻っていない」が起きる。状態遷移の中で
 * 最も損害が大きい種類なので、まとめ・上限・改名を1件ずつ確かめる。
 */

const MAP = "plan.md";

let history: IdbHistoryStore;

beforeEach(async () => {
  await idbDelete(STORE_HISTORY, MAP);
  await idbDelete(STORE_HISTORY, "renamed.md");
  history = new IdbHistoryStore();
});

describe("record と list", () => {
  it("控えた版を新しい順に返す", async () => {
    await history.record(MAP, "# a\n", 0);
    await history.record(MAP, "# b\n", COALESCE_MS);
    await history.record(MAP, "# c\n", COALESCE_MS * 2);

    const entries = await history.list(MAP);
    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.at)).toEqual([COALESCE_MS * 2, COALESCE_MS, 0]);
  });

  it("本文を読まずに大きさが分かる", async () => {
    await history.record(MAP, "あ\n", 0);
    const first = (await history.list(MAP))[0];
    // 「あ」3バイト + 改行
    expect(first?.size).toBe(4);
  });

  it("履歴が無いマップは空を返す", async () => {
    expect(await history.list("nothing.md")).toEqual([]);
  });

  it("5分以内の保存は1つの版にまとまる", async () => {
    await history.record(MAP, "# a\n", 0);
    await history.record(MAP, "# ab\n", 1000);
    await history.record(MAP, "# abc\n", 2000);

    const entries = await history.list(MAP);
    expect(entries).toHaveLength(1);
    // 残るのは最後の内容
    expect(await history.read(MAP, entries[0]?.id ?? "")).toBe("# abc\n");
  });

  it("まとめた版には新しい番号を振る", async () => {
    await history.record(MAP, "# a\n", 0);
    const before = (await history.list(MAP))[0]?.id;
    await history.record(MAP, "# b\n", 1000);
    const after = (await history.list(MAP))[0]?.id;

    // 番号を据え置くと、一覧を開いたまま復元した利用者が
    // 見えている内容とは違う版を戻すことになる
    expect(after).not.toBe(before);
  });

  it("内容が変わらなければ版を作らない", async () => {
    await history.record(MAP, "# a\n", 0);
    await history.record(MAP, "# a\n", COALESCE_MS * 5);
    expect(await history.list(MAP)).toHaveLength(1);
  });

  it("上限を超えたら古い版から捨てる", async () => {
    for (let i = 0; i < MAX_ENTRIES + 3; i += 1) {
      await history.record(MAP, `# ${String(i)}\n`, i * COALESCE_MS);
    }
    const entries = await history.list(MAP);
    expect(entries).toHaveLength(MAX_ENTRIES);
    expect(await history.read(MAP, entries[0]?.id ?? "")).toBe(`# ${String(MAX_ENTRIES + 2)}\n`);
  });

  it("マップごとに分かれている", async () => {
    await history.record(MAP, "# a\n", 0);
    await history.record("other.md", "# b\n", 0);
    expect(await history.list(MAP)).toHaveLength(1);
    expect(await history.list("other.md")).toHaveLength(1);
    await history.forget("other.md");
  });
});

describe("read", () => {
  it("無い版を読もうとしたら MapNotFoundError", async () => {
    await history.record(MAP, "# a\n", 0);
    await expect(history.read(MAP, "999")).rejects.toBeInstanceOf(MapNotFoundError);
  });
});

describe("forget", () => {
  it("マップを消したら履歴も消える", async () => {
    // 残すと、削除したはずの内容が端末に残り続ける
    await history.record(MAP, "# a\n", 0);
    await history.forget(MAP);
    expect(await history.list(MAP)).toEqual([]);
  });

  it("履歴が無くても失敗しない", async () => {
    await expect(history.forget("nothing.md")).resolves.toBeUndefined();
  });
});

describe("rename", () => {
  it("新しい名前へ履歴を引き継ぐ", async () => {
    await history.record(MAP, "# a\n", 0);
    await history.record(MAP, "# b\n", COALESCE_MS);
    await history.rename(MAP, "renamed.md");

    expect(await history.list(MAP)).toEqual([]);
    const entries = await history.list("renamed.md");
    expect(entries).toHaveLength(2);
    expect(await history.read("renamed.md", entries[0]?.id ?? "")).toBe("# b\n");
  });

  it("同じ名前なら何もしない", async () => {
    await history.record(MAP, "# a\n", 0);
    await history.rename(MAP, MAP);
    expect(await history.list(MAP)).toHaveLength(1);
  });
});

describe("壊れた値", () => {
  it("読めない形が入っていても空として扱う", async () => {
    // 控えのために起動できなくなる方が損害が大きい（履歴は正本ではない）
    await idbPut(STORE_HISTORY, { entries: "こわれている" }, MAP);
    expect(await history.list(MAP)).toEqual([]);

    // その上から新しく控えられる
    await history.record(MAP, "# a\n", 0);
    expect(await history.list(MAP)).toHaveLength(1);
  });

  it("一部だけ壊れた版は落として残りを読む", async () => {
    await idbPut(
      STORE_HISTORY,
      { entries: [{ id: "1", at: 0, md: "# a\n" }, { id: "2" }, null], nextSeq: 3 },
      MAP,
    );
    expect(await history.list(MAP)).toHaveLength(1);
  });
});
