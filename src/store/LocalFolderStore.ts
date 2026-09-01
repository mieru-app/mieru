import { parseFrontmatter, splitFrontmatter } from "../core/frontmatter.js";
import type { MapMeta } from "../core/types.js";
import type { DirectoryHandleLike, FileHandleLike } from "./fsa.js";
import { isNotFoundError, isPermissionError } from "./fsa.js";
import { isValidMapId } from "./file-name.js";
import { contentHash } from "./hash.js";
import type { QuarantineSink } from "./quarantine.js";
import { indexedDbQuarantine } from "./quarantine.js";
import type { MapStore } from "./types.js";
import { ConflictError, MapNotFoundError, SaveFailedError } from "./types.js";

/**
 * ローカルフォルダを保存先とする MapStore 実装（Phase 1）。
 *
 * File System Access API を使い、利用者が選んだフォルダ直下の `*.md` を
 * そのままマップとして扱う。Markdown が保存形式そのものであるため、
 * 利用者は Obsidian や VS Code で同じファイルを開いて編集できる（設計原則1）。
 *
 * 仕様の正本: docs/design.md 8.3
 */

/** 保存を試みる回数（初回を含む） */
const SAVE_ATTEMPTS = 3;
/** 指数バックオフの基準時間 */
const SAVE_BACKOFF_MS = 150;
/** 外部変更を確認する間隔 */
const WATCH_INTERVAL_MS = 30_000;

/** 読み込み済みファイルの記憶。更新日時とサイズが同じなら読み直さない */
interface CacheEntry {
  /** 更新日時とサイズの組。ファイルが変わったかの安価な判定に使う */
  stamp: string;
  md: string;
  version: string;
}

export interface LocalFolderStoreOptions {
  /** 保存に失敗し続けたときの退避先。既定は IndexedDB */
  quarantine?: QuarantineSink;
  /** 外部変更を確認する間隔（ミリ秒） */
  watchIntervalMs?: number;
  /** 再試行の待機。テストから短縮するために差し替える */
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LocalFolderStore implements MapStore {
  readonly #dir: DirectoryHandleLike;
  readonly #quarantine: QuarantineSink;
  readonly #watchIntervalMs: number;
  readonly #sleep: (ms: number) => Promise<void>;
  /** id ごとの直近に読んだ内容。list() が毎回全ファイルを読み直すのを避ける */
  readonly #cache = new Map<string, CacheEntry>();

  constructor(directory: DirectoryHandleLike, options: LocalFolderStoreOptions = {}) {
    this.#dir = directory;
    this.#quarantine = options.quarantine ?? indexedDbQuarantine;
    this.#watchIntervalMs = options.watchIntervalMs ?? WATCH_INTERVAL_MS;
    this.#sleep = options.sleep ?? defaultSleep;
  }

  /** 選択中フォルダの表示名。ステータスバーに出す */
  get folderName(): string {
    return this.#dir.name;
  }

  /** フォルダ直下の md ファイルを列挙する。隠しファイルは除く */
  async #listFileHandles(): Promise<FileHandleLike[]> {
    const handles: FileHandleLike[] = [];
    for await (const entry of this.#dir.values()) {
      if (entry.kind !== "file") continue;
      if (!entry.name.endsWith(".md") || entry.name.startsWith(".")) continue;
      handles.push(entry);
    }
    return handles.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** ファイルを読む。更新日時とサイズが前回と同じなら記憶を返す */
  async #readHandle(handle: FileHandleLike): Promise<CacheEntry> {
    const file = await handle.getFile();
    const stamp = `${file.lastModified}:${file.size}`;

    const cached = this.#cache.get(handle.name);
    if (cached !== undefined && cached.stamp === stamp) return cached;

    const md = await file.text();
    const entry: CacheEntry = { stamp, md, version: contentHash(md) };
    this.#cache.set(handle.name, entry);
    return entry;
  }

  async #getFileHandle(id: string, create: boolean): Promise<FileHandleLike | null> {
    try {
      return await this.#dir.getFileHandle(id, { create });
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async list(): Promise<MapMeta[]> {
    const handles = await this.#listFileHandles();

    const present = new Set(handles.map((handle) => handle.name));
    for (const id of [...this.#cache.keys()]) {
      if (!present.has(id)) this.#cache.delete(id);
    }

    const metas: MapMeta[] = [];
    for (const handle of handles) {
      const entry = await this.#readHandle(handle);
      const { data } = parseFrontmatter(splitFrontmatter(entry.md).yaml);
      metas.push({
        id: handle.name,
        // title を持たないファイル（手書きの md 等）はファイル名で代用する
        title: data.title ?? handle.name.replace(/\.md$/, ""),
        tags: data.tags,
        created: data.created ?? "",
        updated: data.updated ?? "",
        version: entry.version,
      });
    }
    return metas;
  }

  async read(id: string): Promise<{ md: string; version: string }> {
    if (!isValidMapId(id)) throw new MapNotFoundError(id);
    const handle = await this.#getFileHandle(id, false);
    if (handle === null) throw new MapNotFoundError(id);
    const entry = await this.#readHandle(handle);
    return { md: entry.md, version: entry.version };
  }

  /** 保存先の現在の状態。存在しなければ null */
  async #current(id: string): Promise<CacheEntry | null> {
    const handle = await this.#getFileHandle(id, false);
    if (handle === null) return null;
    return this.#readHandle(handle);
  }

  async write(id: string, md: string, baseVersion: string | null): Promise<string> {
    if (!isValidMapId(id)) {
      throw new SaveFailedError(id, `ファイル名として使えません: ${id}`, undefined);
    }

    // 楽観ロック（docs/design.md 8.1 の表）。物理的な書き込みの前に必ず判定する
    const current = await this.#current(id);
    if (baseVersion === null) {
      if (current !== null) throw new ConflictError(id, current.version, current.md);
    } else {
      if (current === null) throw new MapNotFoundError(id);
      if (current.version !== baseVersion) throw new ConflictError(id, current.version, current.md);
    }

    await this.#writeWithRetry(id, md);

    const version = contentHash(md);
    // 書き込み直後の更新日時を記憶へ取り込む。
    // これをしないと watch() が自分の保存を外部変更として通知してしまう
    const handle = await this.#getFileHandle(id, false);
    if (handle === null) {
      this.#cache.delete(id);
    } else {
      const file = await handle.getFile();
      this.#cache.set(id, { stamp: `${file.lastModified}:${file.size}`, md, version });
    }
    return version;
  }

  /**
   * 実際の書き込み。失敗したら指数バックオフで再試行し、
   * それでも駄目なら内容を退避してから SaveFailedError を投げる。
   *
   * createWritable() は書き込みを一時ファイルへ溜め close() で差し替えるため、
   * 途中で失敗しても元のファイルは無傷で残る（設計書 8.3 の「一時ファイル + リネーム」）。
   */
  async #writeWithRetry(id: string, md: string): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
      try {
        const handle = await this.#dir.getFileHandle(id, { create: true });
        const writable = await handle.createWritable();
        await writable.write(md);
        await writable.close();
        return;
      } catch (error) {
        lastError = error;
        // 権限が失効している場合は再試行しても結果が変わらない。即座に退避へ回す
        if (isPermissionError(error)) break;
        if (attempt < SAVE_ATTEMPTS - 1) await this.#sleep(SAVE_BACKOFF_MS * 2 ** attempt);
      }
    }

    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    // 退避の失敗で元の保存失敗を握りつぶさない
    await this.#quarantine.put(id, md, reason).catch(() => undefined);
    // 記憶が実ファイルとずれた可能性があるため捨てる
    this.#cache.delete(id);
    throw new SaveFailedError(id, reason, lastError);
  }

  async remove(id: string): Promise<void> {
    if (!isValidMapId(id)) throw new MapNotFoundError(id);
    if ((await this.#getFileHandle(id, false)) === null) throw new MapNotFoundError(id);
    try {
      await this.#dir.removeEntry(id);
    } catch (error) {
      if (isNotFoundError(error)) throw new MapNotFoundError(id);
      throw error;
    }
    this.#cache.delete(id);
  }

  /**
   * 外部からの変更を監視する。
   *
   * File System Access API に変更通知が無いため、一定間隔とウィンドウの
   * フォーカス復帰時に読み直して突き合わせる（設計書 8.3）。
   * 自分の保存が通知として飛ばないのは、write() が記憶を更新しているためである。
   */
  watch(onChange: (id: string) => void): () => void {
    let stopped = false;
    let running = false;
    // 初回は現状を記憶するだけで通知しない。
    // 起動直後に全ファイルを「変更された」と誤報しないため
    let primed = false;

    const poll = async (): Promise<void> => {
      if (stopped || running) return;
      running = true;
      try {
        const handles = await this.#listFileHandles();
        const present = new Set<string>();

        for (const handle of handles) {
          present.add(handle.name);
          const before = this.#cache.get(handle.name);
          const after = await this.#readHandle(handle);
          if (!primed) continue;
          // 初めて見るファイルも「外部で追加された」変更である
          if (before === undefined || before.version !== after.version) onChange(handle.name);
        }

        for (const id of [...this.#cache.keys()]) {
          if (present.has(id)) continue;
          this.#cache.delete(id);
          if (primed) onChange(id);
        }
        primed = true;
      } catch {
        // 監視の失敗は保存の失敗ほど重くない。次の周期で改めて試す
      } finally {
        running = false;
      }
    };

    const timer = setInterval(() => void poll(), this.#watchIntervalMs);
    const onFocus = (): void => {
      void poll();
    };
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      clearInterval(timer);
      if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
    };
  }
}
