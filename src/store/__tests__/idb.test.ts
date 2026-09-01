import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearDirectoryHandle,
  ensurePermission,
  isFileSystemAccessSupported,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from "../directory-handle.js";
import { idbDelete, idbGet, idbGetAll, idbPut, STORE_HANDLES, STORE_QUARANTINE } from "../idb.js";
import type { DirectoryHandleLike, FsaPermissionState } from "../fsa.js";
import { dropQuarantined, indexedDbQuarantine, listQuarantined } from "../quarantine.js";

/**
 * IndexedDB を使う層の検証。
 *
 * ここは「保存できなかった編集内容の退避先」であり、
 * 利用者の入力を失わせないための最後の砦である（.claude/rules/store.md）。
 * ブラウザ API に薄く被せているだけだからと未検証にはしない。
 */

async function reset(): Promise<void> {
  for (const entry of await idbGetAll<{ key: number }>(STORE_QUARANTINE)) {
    await idbDelete(STORE_QUARANTINE, entry.key);
  }
  await clearDirectoryHandle();
}

beforeEach(reset);

describe("idb の基本操作", () => {
  it("書いた値を読み戻せる", async () => {
    await idbPut(STORE_HANDLES, { name: "値" }, "k");
    await expect(idbGet(STORE_HANDLES, "k")).resolves.toEqual({ name: "値" });
  });

  it("無い鍵は null を返す（例外にしない）", async () => {
    await expect(idbGet(STORE_HANDLES, "無い")).resolves.toBeNull();
  });

  it("削除できる", async () => {
    await idbPut(STORE_HANDLES, 1, "k");
    await idbDelete(STORE_HANDLES, "k");
    await expect(idbGet(STORE_HANDLES, "k")).resolves.toBeNull();
  });
});

describe("退避", () => {
  it("退避した内容を id・理由つきで取り出せる", async () => {
    await indexedDbQuarantine.put("a.md", "# 失われては困る内容\n", "権限がありません");

    const entries = await listQuarantined();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("a.md");
    expect(entries[0]?.md).toBe("# 失われては困る内容\n");
    expect(entries[0]?.reason).toBe("権限がありません");
    expect(entries[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("複数回の退避を古い順に返す", async () => {
    await indexedDbQuarantine.put("a.md", "1回目", "理由1");
    await indexedDbQuarantine.put("a.md", "2回目", "理由2");

    const entries = await listQuarantined();
    expect(entries.map((e) => e.md)).toEqual(["1回目", "2回目"]);
  });

  it("書き戻した退避を捨てられる", async () => {
    await indexedDbQuarantine.put("a.md", "内容", "理由");
    const [entry] = await listQuarantined();
    expect(entry).toBeDefined();

    await dropQuarantined(entry?.key ?? 0);
    await expect(listQuarantined()).resolves.toEqual([]);
  });
});

describe("フォルダハンドルの永続化", () => {
  /** 実際のハンドルは構造化クローン可能。ここでは同じ性質を持つ素の値で代用する */
  const handle = { kind: "directory", name: "maps" } as unknown as DirectoryHandleLike;

  it("保存したハンドルを次回起動時に取り出せる", async () => {
    await saveDirectoryHandle(handle);
    await expect(loadDirectoryHandle()).resolves.toEqual({ kind: "directory", name: "maps" });
  });

  it("未選択なら null", async () => {
    await expect(loadDirectoryHandle()).resolves.toBeNull();
  });

  it("選択を解除できる", async () => {
    await saveDirectoryHandle(handle);
    await clearDirectoryHandle();
    await expect(loadDirectoryHandle()).resolves.toBeNull();
  });
});

describe("権限の確認", () => {
  function handleWith(state: FsaPermissionState, onRequest?: () => void): DirectoryHandleLike {
    return {
      kind: "directory",
      name: "maps",
      queryPermission: () => Promise.resolve(state),
      requestPermission: () => {
        onRequest?.();
        return Promise.resolve<FsaPermissionState>("granted");
      },
    } as unknown as DirectoryHandleLike;
  }

  it("許可済みなら要求しない", async () => {
    let requested = false;
    await expect(
      ensurePermission(
        handleWith("granted", () => (requested = true)),
        true,
      ),
    ).resolves.toBe("granted");
    expect(requested).toBe(false);
  });

  it("非対話時は要求せず現在の状態を返す", async () => {
    let requested = false;
    await expect(
      ensurePermission(
        handleWith("prompt", () => (requested = true)),
        false,
      ),
    ).resolves.toBe("prompt");
    // ブラウザは利用者の操作に紐づかない要求を拒否する。起動時に呼んではいけない
    expect(requested).toBe(false);
  });

  it("対話時は要求して結果を返す", async () => {
    let requested = false;
    await expect(
      ensurePermission(
        handleWith("prompt", () => (requested = true)),
        true,
      ),
    ).resolves.toBe("granted");
    expect(requested).toBe(true);
  });

  it("権限 API を持たない実装は許可済みとみなす", async () => {
    const bare = { kind: "directory", name: "maps" } as unknown as DirectoryHandleLike;
    await expect(ensurePermission(bare, true)).resolves.toBe("granted");
  });
});

describe("File System Access API の対応判定", () => {
  it("window が無い環境（Node）では非対応と判定する", () => {
    expect(isFileSystemAccessSupported()).toBe(false);
  });
});
