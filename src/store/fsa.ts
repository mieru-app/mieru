/**
 * File System Access API のうち、本ツールが使う面だけを構造的に定義する。
 *
 * lib.dom.d.ts の型をそのまま使わない理由:
 * - `queryPermission` / `requestPermission` は標準化されておらず lib.dom に存在しない
 * - Node 上のテストで差し替えるため、依存する面を最小に固定したい
 *
 * 実際のハンドルはこれらの型に構造的に適合する。
 *
 * 仕様の正本: docs/design.md 8.3
 */

export type FsaPermissionState = "granted" | "denied" | "prompt";

export interface FsaPermissionDescriptor {
  mode?: "read" | "readwrite";
}

/** `File` のうち本ツールが読む部分 */
export interface FileLike {
  readonly lastModified: number;
  readonly size: number;
  text(): Promise<string>;
}

/**
 * `FileSystemWritableFileStream` のうち本ツールが使う部分。
 *
 * Chromium の実装は書き込みを一時ファイルへ溜め、`close()` で初めて
 * 対象ファイルと差し替える。これが設計書 8.3 のいう
 * 「一時ファイルに書き出してからリネーム」の実体である
 * （途中で異常終了しても元のファイルは無傷で残る）。
 */
export interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandleLike {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<FileLike>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<WritableLike>;
}

export interface DirectoryHandleLike {
  readonly kind: "directory";
  readonly name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterableIterator<FileHandleLike | DirectoryHandleLike>;
  queryPermission?(descriptor?: FsaPermissionDescriptor): Promise<FsaPermissionState>;
  requestPermission?(descriptor?: FsaPermissionDescriptor): Promise<FsaPermissionState>;
}

/** ブラウザが投げる「見つからない」を判別する。DOMException 以外も来うるため名前で見る */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.name === "NotFoundError";
}

/** 権限失効（再許可が必要）を判別する */
export function isPermissionError(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}
