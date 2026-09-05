import { describe, expect, it } from "vitest";

import { copyAllMaps } from "../copy-maps.js";
import { MemoryStore } from "../MemoryStore.js";

/**
 * ゲストモードの引き取り（2.12）。
 *
 * **ここが失敗すると、保存先を選んだ瞬間に書いたものが消える。**
 * ゲストの中身はメモリにしか無く、やり直しが効かない。
 */

function mapWith(title: string, body = "本文"): string {
  return `---\ntitle: ${title}\n---\n\n# ${title}\n\n- ${body}\n`;
}

describe("保存先から保存先へ写す", () => {
  it("全てのマップを写す", async () => {
    const from = new MemoryStore({ "a.md": mapWith("最初"), "b.md": mapWith("次") });
    const to = new MemoryStore();

    const copied = await copyAllMaps(from, to);

    expect(copied).toHaveLength(2);
    expect((await to.list()).map((meta) => meta.title).sort()).toEqual(["最初", "次"]);
  });

  it("中身を1バイトも変えない", async () => {
    const md = mapWith("題", "枝");
    const from = new MemoryStore({ "a.md": md });
    const to = new MemoryStore();

    const [copied] = await copyAllMaps(from, to);

    expect(copied).toBeDefined();
    expect((await to.read(copied?.id ?? "")).md).toBe(md);
  });

  /**
   * **同じ名前が先にあると `write` は ConflictError を投げる。**
   * そこで引き取りが止まると、残りのマップが黙って消える。
   */
  it("写し先に同じ名前があっても止まらない", async () => {
    const from = new MemoryStore({ "note.md": mapWith("note") });
    const to = new MemoryStore({ "note.md": mapWith("先客") });

    const copied = await copyAllMaps(from, to);

    expect(copied).toHaveLength(1);
    expect(copied[0]?.id).not.toBe("note.md");
    // 先客を上書きしない
    expect((await to.read("note.md")).md).toContain("先客");
    expect(await to.list()).toHaveLength(2);
  });

  it("写し元どうしで名前がぶつかっても止まらない", async () => {
    const from = new MemoryStore({ "x.md": mapWith("同じ"), "y.md": mapWith("同じ") });
    const to = new MemoryStore();

    const copied = await copyAllMaps(from, to);

    expect(copied).toHaveLength(2);
    expect(copied[0]?.id).not.toBe(copied[1]?.id);
    expect(await to.list()).toHaveLength(2);
  });

  it("写し元を変更しない", async () => {
    const from = new MemoryStore({ "a.md": mapWith("題") });
    const before = await from.list();

    await copyAllMaps(from, new MemoryStore());

    expect(await from.list()).toEqual(before);
  });

  it("写すものが無ければ何もしない", async () => {
    const to = new MemoryStore({ "keep.md": mapWith("残る") });

    expect(await copyAllMaps(new MemoryStore(), to)).toEqual([]);
    expect(await to.list()).toHaveLength(1);
  });
});
