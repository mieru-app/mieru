import type { DirectoryHandleLike, FsaPermissionState } from "./fsa.js";
import { idbDelete, idbGet, idbPut, STORE_HANDLES } from "./idb.js";

/**
 * 作業フォルダのハンドルの永続化と権限確認。
 *
 * `FileSystemDirectoryHandle` は構造化クローン可能なので IndexedDB へそのまま保存できる。
 * これにより次回起動時にフォルダを選び直させずに済む。ただし権限は保存されないため、
 * 起動のたびに `queryPermission()` で確認し、`prompt` なら利用者の操作を1回挟む
 * （ブラウザは利用者の操作なしに権限を要求させない）。
 *
 * 仕様の正本: docs/design.md 8.3
 */

/** 保管庫には常にこの1件だけを置く */
const HANDLE_KEY = "workingDirectory";

/** File System Access API が使える環境か。Firefox / Safari / モバイルは非対応 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** 利用者にフォルダを選ばせる。キャンセルされた場合は null */
export async function pickDirectory(): Promise<DirectoryHandleLike | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    const picker = window as unknown as {
      showDirectoryPicker(options?: { mode?: "read" | "readwrite" }): Promise<unknown>;
    };
    // lib.dom の型と本ツールの構造的な型を突き合わせる唯一の場所
    return (await picker.showDirectoryPicker({ mode: "readwrite" })) as DirectoryHandleLike;
  } catch (error) {
    // 利用者がダイアログを閉じただけ。異常ではない
    if (error instanceof Error && error.name === "AbortError") return null;
    throw error;
  }
}

export async function saveDirectoryHandle(handle: DirectoryHandleLike): Promise<void> {
  await idbPut(STORE_HANDLES, handle, HANDLE_KEY);
}

export function loadDirectoryHandle(): Promise<DirectoryHandleLike | null> {
  return idbGet<DirectoryHandleLike>(STORE_HANDLES, HANDLE_KEY);
}

export async function clearDirectoryHandle(): Promise<void> {
  await idbDelete(STORE_HANDLES, HANDLE_KEY);
}

/**
 * 読み書き権限の状態を返す。
 *
 * @param interactive true のときだけ `requestPermission()` を呼ぶ。
 *   ブラウザは利用者の操作に紐づかない要求を拒否するため、
 *   起動時の自動確認では false、ボタン押下では true を渡すこと。
 */
export async function ensurePermission(
  handle: DirectoryHandleLike,
  interactive: boolean,
): Promise<FsaPermissionState> {
  // 権限 API を持たない実装（テスト用の偽物など）は許可済みとみなす
  if (handle.queryPermission === undefined) return "granted";

  const state = await handle.queryPermission({ mode: "readwrite" });
  if (state === "granted" || !interactive || handle.requestPermission === undefined) return state;
  return handle.requestPermission({ mode: "readwrite" });
}
