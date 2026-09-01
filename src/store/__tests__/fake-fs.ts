import type {
  DirectoryHandleLike,
  FileHandleLike,
  FileLike,
  FsaPermissionDescriptor,
  FsaPermissionState,
  WritableLike,
} from "../fsa.js";

/**
 * File System Access API のメモリ上の偽物。
 *
 * Node には FSA が無いため、`LocalFolderStore` の検証にはこれを使う。
 * 実際のブラウザとの差異を意図的に持ち込めるよう、
 * 権限失効・書き込み失敗・外部からの書き換えを注入できるようにしてある。
 */

/** ブラウザが投げるものと同じ形の例外を作る */
export function domError(name: string, message = name): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

class FakeFile implements FileLike {
  constructor(
    readonly content: string,
    readonly lastModified: number,
  ) {}

  get size(): number {
    return new TextEncoder().encode(this.content).length;
  }

  text(): Promise<string> {
    return Promise.resolve(this.content);
  }
}

class FakeWritable implements WritableLike {
  #buffer = "";

  constructor(
    private readonly directory: FakeDirectory,
    private readonly name: string,
  ) {}

  write(data: string): Promise<void> {
    this.#buffer += data;
    return Promise.resolve();
  }

  close(): Promise<void> {
    // 本物と同じく、差し替えが起きるのは close の瞬間だけである。
    // ここで失敗させれば「書きかけで壊れていないか」を検証できる
    const failure = this.directory.takeWriteFailure();
    if (failure !== undefined) return Promise.reject(failure);
    this.directory.putRaw(this.name, this.#buffer);
    return Promise.resolve();
  }
}

class FakeFileHandle implements FileHandleLike {
  readonly kind = "file";

  constructor(
    readonly name: string,
    private readonly directory: FakeDirectory,
  ) {}

  getFile(): Promise<FileLike> {
    const entry = this.directory.entries.get(this.name);
    if (entry === undefined) return Promise.reject(domError("NotFoundError", this.name));
    this.directory.reads.push(this.name);
    return Promise.resolve(new FakeFile(entry.content, entry.lastModified));
  }

  createWritable(): Promise<WritableLike> {
    if (this.directory.permission !== "granted") {
      return Promise.reject(domError("NotAllowedError", "権限がありません"));
    }
    return Promise.resolve(new FakeWritable(this.directory, this.name));
  }
}

export class FakeDirectory implements DirectoryHandleLike {
  readonly kind = "directory";
  readonly entries = new Map<string, { content: string; lastModified: number }>();
  /** getFile() が呼ばれたファイル名の記録。読み直しの回数を検証するために使う */
  readonly reads: string[] = [];
  permission: FsaPermissionState = "granted";
  /** close() で消費される失敗の待ち行列 */
  readonly writeFailures: Error[] = [];
  #clock = 1_700_000_000_000;

  constructor(readonly name = "maps") {}

  /** 外部エディタによる書き換えを模す。ストアの記憶を通さない */
  putRaw(fileName: string, content: string): void {
    this.#clock += 1;
    this.entries.set(fileName, { content, lastModified: this.#clock });
  }

  /** 外部からの削除を模す */
  deleteRaw(fileName: string): void {
    this.entries.delete(fileName);
  }

  /** 次の保存を n 回失敗させる */
  failWrites(count: number, error: Error = domError("InvalidStateError", "書き込みに失敗")): void {
    for (let i = 0; i < count; i += 1) this.writeFailures.push(error);
  }

  takeWriteFailure(): Error | undefined {
    return this.writeFailures.shift();
  }

  getFileHandle(fileName: string, options?: { create?: boolean }): Promise<FileHandleLike> {
    if (!this.entries.has(fileName) && options?.create !== true) {
      return Promise.reject(domError("NotFoundError", fileName));
    }
    return Promise.resolve(new FakeFileHandle(fileName, this));
  }

  removeEntry(fileName: string): Promise<void> {
    if (!this.entries.delete(fileName)) {
      return Promise.reject(domError("NotFoundError", fileName));
    }
    return Promise.resolve();
  }

  async *values(): AsyncIterableIterator<FileHandleLike | DirectoryHandleLike> {
    for (const fileName of [...this.entries.keys()]) {
      yield await Promise.resolve(new FakeFileHandle(fileName, this));
    }
  }

  queryPermission(_descriptor?: FsaPermissionDescriptor): Promise<FsaPermissionState> {
    return Promise.resolve(this.permission);
  }

  requestPermission(_descriptor?: FsaPermissionDescriptor): Promise<FsaPermissionState> {
    // 利用者が許可したものとして扱う
    this.permission = "granted";
    return Promise.resolve(this.permission);
  }
}

/** 退避先の偽物。退避された内容をそのまま覗ける */
export class FakeQuarantine {
  readonly saved: { id: string; md: string; reason: string }[] = [];

  put(id: string, md: string, reason: string): Promise<void> {
    this.saved.push({ id, md, reason });
    return Promise.resolve();
  }
}
