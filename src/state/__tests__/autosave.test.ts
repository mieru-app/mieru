import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseMarkdown } from "../../core/parse.js";
import { MemoryStore } from "../../store/MemoryStore.js";
import type { MapStore } from "../../store/types.js";
import { ConflictError, MapNotFoundError, SaveFailedError } from "../../store/types.js";
import { AutoSave } from "../autosave.js";
import { useEditor } from "../editor.js";
import { flatten } from "../tree.js";

/**
 * 自動保存の検証。
 *
 * 最も損害が大きいのは「保存済みと表示しているのに書かれていない」状態である。
 * 保存中に入った編集、競合、外部削除、書き込み失敗のいずれでも
 * その状態にならないことを確かめる。
 */

const SOURCE = `---
title: 根
created: 2026-09-01T00:00:00Z
updated: 2026-09-01T00:00:00Z
---

# 根

- A
`;

function open(version: string): void {
  const { doc } = parseMarkdown(SOURCE);
  useEditor.getState().open({ id: "a.md", meta: doc.meta, colors: doc.view.colors, version }, doc);
}

function uidOf(label: string): string {
  const root = useEditor.getState().root;
  const node = root === null ? undefined : flatten(root).find((item) => item.label === label);
  if (node === undefined) throw new Error(`ラベルが見つかりません: ${label}`);
  return node.uid;
}

/** 保存を必ず失敗させるストア */
function failingStore(error: Error): MapStore {
  return {
    list: () => Promise.resolve([]),
    read: () => Promise.reject(new MapNotFoundError("a.md")),
    write: () => Promise.reject(error),
    remove: () => Promise.resolve(),
  };
}

beforeEach(() => {
  useEditor.getState().close();
});

describe("編集が止まってから保存する", () => {
  it("デバウンス時間の経過後に1回だけ書き込む", async () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryStore();
      const version = await store.write("a.md", SOURCE, null);
      open(version);

      const write = vi.spyOn(store, "write");
      const autosave = new AutoSave(store, useEditor, { debounceMs: 800 });
      autosave.start();

      useEditor.getState().select(uidOf("A"));
      useEditor.getState().rename("市");
      useEditor.getState().rename("市場");
      await vi.advanceTimersByTimeAsync(700);
      expect(write).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(200);
      expect(write).toHaveBeenCalledTimes(1);
      autosave.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("保存できたら保存済みになり、内容がストアに入る", async () => {
    const store = new MemoryStore();
    const version = await store.write("a.md", SOURCE, null);
    open(version);

    useEditor.getState().select(uidOf("A"));
    useEditor.getState().rename("市場");
    await new AutoSave(store, useEditor).flush();

    expect(useEditor.getState().status.kind).toBe("saved");
    const saved = await store.read("a.md");
    expect(saved.md).toContain("- 市場\n");
    expect(useEditor.getState().map?.version).toBe(saved.version);
  });

  it("updated を保存時刻で書き換える", async () => {
    const store = new MemoryStore();
    const version = await store.write("a.md", SOURCE, null);
    open(version);

    useEditor.getState().select(uidOf("A"));
    useEditor.getState().rename("市場");
    await new AutoSave(store, useEditor, { now: () => Date.parse("2026-09-02T10:00:00Z") }).flush();

    const saved = await store.read("a.md");
    expect(saved.md).toContain("updated: 2026-09-02T10:00:00.000Z");
    // created は最初の値のまま
    expect(saved.md).toContain("created: 2026-09-01T00:00:00Z");
  });

  it("変更が無ければ書き込まない", async () => {
    const store = new MemoryStore();
    open(await store.write("a.md", SOURCE, null));

    const write = vi.spyOn(store, "write");
    await new AutoSave(store, useEditor).flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("停止すると予約済みの保存は走らない", async () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryStore();
      open(await store.write("a.md", SOURCE, null));
      const write = vi.spyOn(store, "write");

      const autosave = new AutoSave(store, useEditor, { debounceMs: 800 });
      autosave.start();
      useEditor.getState().addChild();
      autosave.stop();

      await vi.advanceTimersByTimeAsync(2_000);
      expect(write).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("保存中に入った編集を落とさない", () => {
  it("保存済みと表示せず、未保存のまま次の保存を予約する", async () => {
    const store = new MemoryStore();
    const version = await store.write("a.md", SOURCE, null);
    open(version);

    // 書き込みの最中に編集が入る状況を作る
    const gate = { release: () => undefined as void };
    const original = store.write.bind(store);
    vi.spyOn(store, "write").mockImplementation(async (id, md, base) => {
      const waiting = new Promise<void>((resolve) => {
        gate.release = resolve;
      });
      const result = await original(id, md, base);
      await waiting;
      return result;
    });

    const autosave = new AutoSave(store, useEditor, { debounceMs: 5 });
    autosave.start();
    useEditor.getState().select(uidOf("A"));
    useEditor.getState().rename("1回目");

    const saving = autosave.flush();
    // 保存の最中に追加の編集
    useEditor.getState().addChild();
    gate.release();
    await saving;

    // version は取り込みつつ、状態は未保存であること
    expect(useEditor.getState().map?.version).not.toBe(version);
    expect(useEditor.getState().status.kind).toBe("dirty");
    autosave.stop();
  });
});

describe("保存先が指定する保存間隔", () => {
  /**
   * 保存間隔は保存先の制約で決まる。GitHub は内容を作る要求を 500回/時 に
   * 制限しており、ローカルと同じ 800ms のままでは上限に達する（設計書 8.7.5）。
   */
  function storeWithDelay(delayMs: number): MapStore {
    const inner = new MemoryStore();
    return {
      list: () => inner.list(),
      read: (id) => inner.read(id),
      write: (id, md, base) => inner.write(id, md, base),
      remove: (id) => inner.remove(id),
      autosaveDelayMs: delayMs,
    };
  }

  it("保存先が指定していればそれに従う", async () => {
    vi.useFakeTimers();
    try {
      const store = storeWithDelay(8_000);
      const version = await store.write("a.md", SOURCE, null);
      open(version);
      const autosave = new AutoSave(store, useEditor);
      autosave.start();

      useEditor.getState().select(uidOf("A"));
      useEditor.getState().rename("変更");

      // 既定の 800ms では書かれず、保存先が言う 8000ms で書かれること
      await vi.advanceTimersByTimeAsync(1_000);
      expect(useEditor.getState().status.kind).toBe("dirty");
      await vi.advanceTimersByTimeAsync(8_000);
      expect(useEditor.getState().status.kind).toBe("saved");

      autosave.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("明示した debounceMs は保存先の指定より優先する", async () => {
    vi.useFakeTimers();
    try {
      const store = storeWithDelay(8_000);
      const version = await store.write("a.md", SOURCE, null);
      open(version);
      const autosave = new AutoSave(store, useEditor, { debounceMs: 5 });
      autosave.start();

      useEditor.getState().select(uidOf("A"));
      useEditor.getState().rename("変更");

      // 8000ms を待たずに保存されること
      await vi.advanceTimersByTimeAsync(20);
      expect(useEditor.getState().status.kind).toBe("saved");

      autosave.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("保存できなかったとき", () => {
  it("競合は自動マージせず、サーバ版を保持したまま止まる", async () => {
    const conflict = new ConflictError("a.md", "v9", "# 外部で書かれた内容\n");
    open("v1");
    useEditor.getState().addChild();

    await new AutoSave(failingStore(conflict), useEditor).flush();

    expect(useEditor.getState().status).toEqual({
      kind: "conflict",
      serverVersion: "v9",
      serverMd: "# 外部で書かれた内容\n",
    });
  });

  it("競合の間は自動保存で上書きしない", async () => {
    const conflict = new ConflictError("a.md", "v9", "# 外部\n");
    const store = failingStore(conflict);
    open("v1");
    useEditor.getState().addChild();

    const autosave = new AutoSave(store, useEditor);
    await autosave.flush();

    const write = vi.spyOn(store, "write");
    await autosave.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("外部で削除されていたら、次の保存で作り直せる状態にする", async () => {
    const store = failingStore(new MapNotFoundError("a.md"));
    open("v1");
    useEditor.getState().addChild();

    await new AutoSave(store, useEditor).flush();

    expect(useEditor.getState().status.kind).toBe("failed");
    // version を捨てることで、次は新規作成として書き込まれる
    expect(useEditor.getState().map?.version).toBe("");
  });

  it("書き込み失敗は理由とともに残し、退避済みであることを伝える", async () => {
    const store = failingStore(new SaveFailedError("a.md", "ディスクがいっぱいです", undefined));
    open("v1");
    useEditor.getState().addChild();

    await new AutoSave(store, useEditor).flush();

    const status = useEditor.getState().status;
    expect(status.kind).toBe("failed");
    expect(status.kind === "failed" && status.reason).toContain("ディスクがいっぱいです");
    expect(status.kind === "failed" && status.reason).toContain("退避");
  });

  it("想定外の例外でも状態として残し、投げっぱなしにしない", async () => {
    const store = failingStore(new Error("謎の失敗"));
    open("v1");
    useEditor.getState().addChild();

    await expect(new AutoSave(store, useEditor).flush()).resolves.toBeUndefined();
    expect(useEditor.getState().status.kind).toBe("failed");
  });

  it("別のマップに切り替わった後の結果は捨てる", async () => {
    const store = failingStore(new Error("遅れて失敗"));
    open("v1");
    useEditor.getState().addChild();

    const autosave = new AutoSave(store, useEditor);
    const saving = autosave.flush();
    useEditor.getState().close();
    await saving;

    // 閉じたマップの失敗を、今の画面の状態にしない
    expect(useEditor.getState().status.kind).toBe("empty");
  });
});

describe("保存の多重実行", () => {
  it("同時に呼ばれても書き込みを重ねない", async () => {
    const store = new MemoryStore();
    open(await store.write("a.md", SOURCE, null));

    const order: string[] = [];
    const original = store.write.bind(store);
    vi.spyOn(store, "write").mockImplementation(async (id, md, base) => {
      order.push("開始");
      const result = await original(id, md, base);
      order.push("終了");
      return result;
    });

    useEditor.getState().select(uidOf("A"));
    useEditor.getState().rename("市場");

    const autosave = new AutoSave(store, useEditor);
    await Promise.all([autosave.save(), autosave.save()]);

    // 重なっていれば ["開始", "開始", ...] になる
    expect(order.slice(0, 2)).toEqual(["開始", "終了"]);
    expect(useEditor.getState().status.kind).toBe("saved");
  });
});
