import { afterEach, describe, expect, it, vi } from "vitest";

import { isFileSystemAccessSupported, pickDirectory } from "../directory-handle.js";
import { idbGet, idbGetAll, idbPut, STORE_HANDLES } from "../idb.js";
import { LocalFolderStore } from "../LocalFolderStore.js";
import { domError, FakeDirectory, FakeQuarantine } from "./fake-fs.js";

/**
 * ブラウザ環境に依存する分岐の検証。
 *
 * このファイルだけは `window` を差し替えるため、他のテストと同居させない
 * （vitest はファイル単位で隔離して実行する）。
 */

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

/** 最小限の window を用意する */
function stubWindow(extra: Record<string, unknown> = {}): { listeners: Map<string, () => void> } {
  const listeners = new Map<string, () => void>();
  (globalThis as { window?: unknown }).window = {
    addEventListener: (type: string, handler: () => void) => listeners.set(type, handler),
    removeEventListener: (type: string) => listeners.delete(type),
    ...extra,
  };
  return { listeners };
}

describe("フォルダの選択", () => {
  it("File System Access API が無ければ非対応と判定し、選択もしない", async () => {
    stubWindow();
    expect(isFileSystemAccessSupported()).toBe(false);
    await expect(pickDirectory()).resolves.toBeNull();
  });

  it("対応環境では選ばれたハンドルを返す", async () => {
    const handle = new FakeDirectory("選んだフォルダ");
    stubWindow({ showDirectoryPicker: () => Promise.resolve(handle) });

    expect(isFileSystemAccessSupported()).toBe(true);
    await expect(pickDirectory()).resolves.toBe(handle);
  });

  it("読み書き権限を要求して開く", async () => {
    const showDirectoryPicker = vi.fn(() => Promise.resolve(new FakeDirectory()));
    stubWindow({ showDirectoryPicker });

    await pickDirectory();
    expect(showDirectoryPicker).toHaveBeenCalledWith({ mode: "readwrite" });
  });

  it("利用者がダイアログを閉じただけなら null（異常扱いしない）", async () => {
    stubWindow({ showDirectoryPicker: () => Promise.reject(domError("AbortError")) });
    await expect(pickDirectory()).resolves.toBeNull();
  });

  it("それ以外の失敗はそのまま投げる", async () => {
    stubWindow({ showDirectoryPicker: () => Promise.reject(domError("SecurityError")) });
    await expect(pickDirectory()).rejects.toMatchObject({ name: "SecurityError" });
  });
});

describe("ウィンドウのフォーカス復帰", () => {
  it("復帰時に外部変更を確認し、監視停止で購読も外す", async () => {
    const { listeners } = stubWindow();
    const dir = new FakeDirectory();
    dir.putRaw("a.md", "# 元\n");
    const store = new LocalFolderStore(dir, {
      quarantine: new FakeQuarantine(),
      // 周期では発火させず、フォーカス復帰だけで確認する
      watchIntervalMs: 3_600_000,
    });

    const changed: string[] = [];
    const stop = store.watch((id) => changed.push(id));

    // 初回は現状を記憶するだけ
    listeners.get("focus")?.();
    await vi.waitFor(() => expect(dir.reads.length).toBeGreaterThan(0));
    expect(changed).toEqual([]);

    dir.putRaw("a.md", "# 外部で書き換えた\n");
    listeners.get("focus")?.();
    await vi.waitFor(() => expect(changed).toEqual(["a.md"]));

    stop();
    expect(listeners.has("focus")).toBe(false);
  });
});

describe("IndexedDB が使えない環境", () => {
  it("読み書きが例外にならず、既定値を返す", async () => {
    // プライベートウィンドウや設定でストレージを止めている場合を想定する。
    // ここで例外を投げると、退避しようとして落ちるという最悪の挙動になる
    await expect(idbPut(STORE_HANDLES, 1, "k")).resolves.toBeUndefined();
    await expect(idbGet(STORE_HANDLES, "k")).resolves.toBeNull();
    await expect(idbGetAll(STORE_HANDLES)).resolves.toEqual([]);
  });
});
