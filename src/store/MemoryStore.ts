import { parseFrontmatter, splitFrontmatter } from "../core/frontmatter.js";
import type { MapMeta } from "../core/types.js";
import type { MapStore } from "./types.js";
import { ConflictError, MapNotFoundError } from "./types.js";

/**
 * メモリ上の MapStore 実装。
 *
 * MapStore の契約（楽観ロック・エラー種別）の基準実装である。
 * 他の実装を追加する際はこのクラスと同じ契約テストを通すこと。
 *
 * **アプリでも使う（2.12 のゲストモード）。** 保存先を決めずに触れる状態を
 * これで作る。**中身はメモリにしか残らない**ので、保存先が選ばれた時点で
 * `copyAllMaps` が引き取る。使っているあいだは帯が出続ける（`Banners.tsx`）。
 */
export class MemoryStore implements MapStore {
  readonly #entries = new Map<string, { md: string; version: string }>();
  readonly #watchers = new Set<(id: string) => void>();
  #counter = 0;

  constructor(initial: Record<string, string> = {}) {
    for (const [id, md] of Object.entries(initial)) {
      this.#entries.set(id, { md, version: this.#nextVersion() });
    }
  }

  #nextVersion(): string {
    this.#counter += 1;
    return `v${this.#counter}`;
  }

  #notify(id: string): void {
    for (const watcher of this.#watchers) watcher(id);
  }

  list(): Promise<MapMeta[]> {
    const metas: MapMeta[] = [];
    for (const [id, entry] of this.#entries) {
      const { yaml } = splitFrontmatter(entry.md);
      const { data } = parseFrontmatter(yaml);
      metas.push({
        id,
        title: data.title ?? "",
        tags: data.tags,
        created: data.created ?? "",
        updated: data.updated ?? "",
        version: entry.version,
      });
    }
    return Promise.resolve(metas);
  }

  read(id: string): Promise<{ md: string; version: string }> {
    const entry = this.#entries.get(id);
    if (entry === undefined) return Promise.reject(new MapNotFoundError(id));
    return Promise.resolve({ md: entry.md, version: entry.version });
  }

  write(id: string, md: string, baseVersion: string | null): Promise<string> {
    const entry = this.#entries.get(id);

    if (baseVersion === null) {
      if (entry !== undefined) {
        // 新規作成のつもりが既に存在する。他所で作成されたとみなして衝突扱いにする
        return Promise.reject(new ConflictError(id, entry.version, entry.md));
      }
    } else {
      if (entry === undefined) return Promise.reject(new MapNotFoundError(id));
      if (entry.version !== baseVersion) {
        return Promise.reject(new ConflictError(id, entry.version, entry.md));
      }
    }

    const version = this.#nextVersion();
    this.#entries.set(id, { md, version });
    this.#notify(id);
    return Promise.resolve(version);
  }

  remove(id: string): Promise<void> {
    if (!this.#entries.delete(id)) return Promise.reject(new MapNotFoundError(id));
    this.#notify(id);
    return Promise.resolve();
  }

  watch(onChange: (id: string) => void): () => void {
    this.#watchers.add(onChange);
    return () => this.#watchers.delete(onChange);
  }
}
