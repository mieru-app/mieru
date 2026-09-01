import { describe, expect, it, vi } from "vitest";

import { MemoryStore } from "../MemoryStore.js";
import { describeMapStoreContract } from "./contract.js";

describeMapStoreContract("MemoryStore", () => new MemoryStore());

describe("MemoryStore 固有の挙動", () => {
  it("初期データを与えて構築できる", async () => {
    const store = new MemoryStore({ "a.md": "---\ntitle: A\n---\n\n# A\n" });
    const metas = await store.list();
    expect(metas).toHaveLength(1);
    expect(metas[0]?.title).toBe("A");
  });

  it("watch が書き込みと削除を通知し、解除できる", async () => {
    const store = new MemoryStore();
    const onChange = vi.fn();
    const unwatch = store.watch(onChange);

    await store.write("a.md", "# A\n", null);
    expect(onChange).toHaveBeenCalledWith("a.md");

    await store.remove("a.md");
    expect(onChange).toHaveBeenCalledTimes(2);

    unwatch();
    await store.write("b.md", "# B\n", null);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("衝突しても保存済みの内容を壊さない", async () => {
    const store = new MemoryStore();
    const v1 = await store.write("a.md", "# 元\n", null);
    await store.write("a.md", "# 新\n", v1);
    await store.write("a.md", "# 割り込み\n", v1).catch(() => undefined);
    await expect(store.read("a.md")).resolves.toMatchObject({ md: "# 新\n" });
  });
});
