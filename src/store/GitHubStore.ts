import { parseFrontmatter, splitFrontmatter } from "../core/frontmatter.js";
import type { MapMeta } from "../core/types.js";
import { decodeBase64, encodeBase64 } from "./base64.js";
import { isValidMapId } from "./file-name.js";
import type { FetchLike, GitHubCredential, HttpResponseLike } from "./github-auth.js";
import { authHeaders, browserFetch, GITHUB_API } from "./github-auth.js";
import { idbGet, idbPut, STORE_SETTINGS } from "./idb.js";
import type { QuarantineSink } from "./quarantine.js";
import { indexedDbQuarantine } from "./quarantine.js";
import type { MapStore } from "./types.js";
import { ConflictError, MapNotFoundError, SaveFailedError } from "./types.js";

/**
 * GitHub リポジトリを保存先とする MapStore 実装（Phase 2.6）。
 *
 * 目的はスマートフォン対応である。File System Access API はデスクトップ版
 * Chromium にしか無く、保存先が無ければレスポンシブ対応だけしても使えない。
 *
 * **API の挙動は着手前に実測してある**（docs/github-api-verification.md）。
 * 数値と応答コードの根拠はそちらにあり、ここでは実装だけを書く。
 *
 * 仕様の正本: docs/design.md 8.7
 */

/**
 * 自動保存の待機時間。
 *
 * GitHub は「内容を作る要求」を 500回/時 に制限しており、保存1回が
 * コミット1つなので**平均7.2秒に1回が上限**になる。ローカルと同じ 800ms では
 * 集中して編集した1時間で上限に達する（設計書 8.7.5）。
 */
const AUTOSAVE_DELAY_MS = 8_000;

/** 保存を試みる回数（初回を含む） */
const SAVE_ATTEMPTS = 3;
const SAVE_BACKOFF_MS = 300;

/** 一覧の記憶。`sha` が一致すれば内容も同一なので、本文を取り直さなくてよい */
export interface CachedMeta {
  sha: string;
  title: string;
  tags: string[];
  created: string;
  updated: string;
}

export type MetaCacheRecord = Record<string, CachedMeta>;

/**
 * 一覧の記憶。既定は IndexedDB。
 *
 * **`sha` は内容から決まる**ため、一致していれば記憶した情報は必ず今も正しい
 * （設計書 8.7 / 8.2）。古い情報を掴む危険が無いので、素朴に持ってよい。
 */
export interface MetaCache {
  load(key: string): Promise<MetaCacheRecord | null>;
  save(key: string, value: MetaCacheRecord): Promise<void>;
}

const indexedDbMetaCache: MetaCache = {
  async load(key) {
    return idbGet<MetaCacheRecord>(STORE_SETTINGS, `githubMetaCache:${key}`);
  },
  async save(key, value) {
    await idbPut(STORE_SETTINGS, value, `githubMetaCache:${key}`);
  },
};

/** GitHub が返した、競合でも不在でもない失敗 */
export class GitHubApiError extends Error {
  override readonly name = "GitHubApiError";

  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`GitHub API ${status}: ${detail}`);
  }
}

export interface GitHubStoreOptions {
  fetchImpl?: FetchLike;
  /** 保存に失敗し続けたときの退避先。既定は IndexedDB */
  quarantine?: QuarantineSink;
  /** 一覧の記憶。既定は IndexedDB */
  metaCache?: MetaCache;
  /** 再試行の待機。テストから短縮するために差し替える */
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 応答本文の `message`。失敗の理由を人に見せるために使う */
async function messageOf(response: HttpResponseLike): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const message = (body as Record<string, unknown>)["message"];
      if (typeof message === "string") return message;
    }
  } catch {
    // 本文が無い応答（304 など）もある
  }
  return "";
}

interface ContentResponse {
  sha: string;
  md: string;
}

function readContent(value: unknown): ContentResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  const sha = body["sha"];
  const content = body["content"];
  if (typeof sha !== "string" || typeof content !== "string") return null;
  return { sha, md: decodeBase64(content) };
}

/**
 * PUT の応答から新しい `sha` を取り出す。
 *
 * **GET と形が違う。** 保存の応答は `{ content: {...}, commit: {...} }` と
 * 入れ子になっており、`sha` は `content` の下にある。
 */
function readSavedSha(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const content = (value as Record<string, unknown>)["content"];
  if (typeof content !== "object" || content === null) return null;
  const sha = (content as Record<string, unknown>)["sha"];
  return typeof sha === "string" ? sha : null;
}

interface DirectoryEntry {
  name: string;
  sha: string;
}

function readDirectory(value: unknown): DirectoryEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: DirectoryEntry[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    const name = entry["name"];
    const sha = entry["sha"];
    if (entry["type"] !== "file" || typeof name !== "string" || typeof sha !== "string") continue;
    // 隠しファイルと md 以外は扱わない（LocalFolderStore と同じ規則）
    if (!name.endsWith(".md") || name.startsWith(".")) continue;
    entries.push({ name, sha });
  }
  return entries;
}

export class GitHubStore implements MapStore {
  readonly #credential: GitHubCredential;
  readonly #fetch: FetchLike;
  readonly #quarantine: QuarantineSink;
  readonly #metaCache: MetaCache;
  readonly #sleep: (ms: number) => Promise<void>;
  /** 直近の一覧。読み込み済みなら再利用する */
  #cache: MetaCacheRecord | null = null;

  readonly autosaveDelayMs = AUTOSAVE_DELAY_MS;

  constructor(credential: GitHubCredential, options: GitHubStoreOptions = {}) {
    this.#credential = credential;
    this.#fetch = options.fetchImpl ?? browserFetch;
    this.#quarantine = options.quarantine ?? indexedDbQuarantine;
    this.#metaCache = options.metaCache ?? indexedDbMetaCache;
    this.#sleep = options.sleep ?? defaultSleep;
  }

  /** 表示用。**トークンを含めない** */
  get label(): string {
    const { repo, directory } = this.#credential;
    return directory === "" ? repo : `${repo}/${directory}`;
  }

  #cacheKey(): string {
    return `${this.#credential.repo}:${this.#credential.branch ?? ""}:${this.#credential.directory}`;
  }

  /** リポジトリ内のパス。日本語のファイル名があるので必ず符号化する */
  #pathFor(id: string): string {
    const { directory } = this.#credential;
    return directory === "" ? id : `${directory}/${id}`;
  }

  #urlFor(path: string): string {
    const encoded = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const url = `${GITHUB_API}/repos/${this.#credential.repo}/contents/${encoded}`;
    const branch = this.#credential.branch;
    // ブランチ未指定なら GitHub の既定ブランチが使われる
    return branch === null ? url : `${url}?ref=${encodeURIComponent(branch)}`;
  }

  #request(
    url: string,
    init: { method?: string; body?: unknown; extraHeaders?: Record<string, string> } = {},
  ): Promise<HttpResponseLike> {
    const headers = { ...authHeaders(this.#credential.token), ...(init.extraHeaders ?? {}) };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    return this.#fetch(url, {
      ...(init.method === undefined ? {} : { method: init.method }),
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      // 60秒のキャッシュを踏むと競合の判定が狂う（設計書 8.7.6）
      cache: "no-store",
    });
  }

  // -------------------------------------------------------------------------
  // 読み取り
  // -------------------------------------------------------------------------

  async list(): Promise<MapMeta[]> {
    const response = await this.#request(this.#urlFor(this.#credential.directory));
    // 置き場所のフォルダがまだ無い状態は「マップ0件」であって異常ではない
    if (response.status === 404) return [];
    if (response.status !== 200) {
      throw new GitHubApiError(response.status, await messageOf(response));
    }

    const entries = readDirectory(await response.json());
    if (entries === null) throw new GitHubApiError(200, "一覧の形式が想定と違います");

    const cached = this.#cache ?? (await this.#metaCache.load(this.#cacheKey())) ?? {};
    const next: MetaCacheRecord = {};
    const metas: MapMeta[] = [];

    for (const entry of entries) {
      const remembered = cached[entry.name];
      // sha が同じなら内容も同じ。本文を取り直す必要がない（往復を N 回節約する）
      const meta =
        remembered !== undefined && remembered.sha === entry.sha
          ? remembered
          : this.#metaFrom(entry.name, entry.sha, await this.#readPath(entry.name));
      next[entry.name] = meta;
      metas.push({
        id: entry.name,
        title: meta.title,
        tags: meta.tags,
        created: meta.created,
        updated: meta.updated,
        version: meta.sha,
      });
    }

    this.#cache = next;
    // 記憶の保存に失敗しても一覧そのものは返せる
    await this.#metaCache.save(this.#cacheKey(), next).catch(() => undefined);
    return metas.sort((a, b) => a.id.localeCompare(b.id));
  }

  #metaFrom(id: string, sha: string, md: string): CachedMeta {
    const { data } = parseFrontmatter(splitFrontmatter(md).yaml);
    return {
      sha,
      // title を持たないファイル（手書きの md 等）はファイル名で代用する
      title: data.title ?? id.replace(/\.md$/, ""),
      tags: data.tags,
      created: data.created ?? "",
      updated: data.updated ?? "",
    };
  }

  /** 本文を読む。存在しなければ null */
  async #fetchContent(id: string): Promise<ContentResponse | null> {
    const response = await this.#request(this.#urlFor(this.#pathFor(id)));
    if (response.status === 404) return null;
    if (response.status !== 200) {
      throw new GitHubApiError(response.status, await messageOf(response));
    }
    const content = readContent(await response.json());
    if (content === null) throw new GitHubApiError(200, "本文の形式が想定と違います");
    return content;
  }

  /** 一覧から呼ぶ本文取得。ここまで来る時点で存在は分かっている */
  async #readPath(id: string): Promise<string> {
    const content = await this.#fetchContent(id);
    if (content === null) throw new MapNotFoundError(id);
    return content.md;
  }

  async read(id: string): Promise<{ md: string; version: string }> {
    if (!isValidMapId(id)) throw new MapNotFoundError(id);
    const content = await this.#fetchContent(id);
    if (content === null) throw new MapNotFoundError(id);
    return { md: content.md, version: content.sha };
  }

  // -------------------------------------------------------------------------
  // 書き込み
  // -------------------------------------------------------------------------

  /**
   * 保存の前に現在の状態を確かめる。**契約表を満たすために必須である。**
   *
   * GitHub は存在しないパスへ `sha` 付きで PUT すると `sha` を無視して作成する。
   * つまり他所で削除したマップを自動保存が黙って復活させる（実測、検証メモ 3.3）。
   * ここで先に確かめることで、それを防ぐと同時に2つ得をする。
   *
   * - 競合したときのサーバ本文がこの応答で手に入る（409 の本文には入らない）
   * - **`304` はレート枠を消費しない**ので、競合していない通常の保存では実質ただ
   */
  async #ensureWritable(id: string, baseVersion: string | null): Promise<void> {
    if (baseVersion === null) {
      // 新規作成のつもりなのに既にある＝他所で作られた
      const current = await this.#fetchContent(id);
      if (current !== null) throw new ConflictError(id, current.sha, current.md);
      return;
    }

    const response = await this.#request(this.#urlFor(this.#pathFor(id)), {
      extraHeaders: { "If-None-Match": `"${baseVersion}"` },
    });
    // 読んだときから変わっていない
    if (response.status === 304) return;
    if (response.status === 404) throw new MapNotFoundError(id);
    if (response.status !== 200) {
      throw new GitHubApiError(response.status, await messageOf(response));
    }
    const current = readContent(await response.json());
    if (current === null) throw new GitHubApiError(200, "本文の形式が想定と違います");
    throw new ConflictError(id, current.sha, current.md);
  }

  async write(id: string, md: string, baseVersion: string | null): Promise<string> {
    if (!isValidMapId(id)) {
      throw new SaveFailedError(id, `ファイル名として使えません: ${id}`, undefined);
    }

    await this.#ensureWritable(id, baseVersion);

    const body: Record<string, unknown> = {
      message: `${id} を${baseVersion === null ? "作成" : "更新"}（Mieru）`,
      content: encodeBase64(md),
    };
    if (baseVersion !== null) body["sha"] = baseVersion;
    if (this.#credential.branch !== null) body["branch"] = this.#credential.branch;

    const sha = await this.#putWithRetry(id, md, body);
    // 保存した内容は自分が知っているので、一覧の記憶も更新しておく
    if (this.#cache !== null) this.#cache[id] = this.#metaFrom(id, sha, md);
    return sha;
  }

  /**
   * PUT を実行する。
   *
   * **再試行するのは通信断とサーバ側の異常だけ**にする。401 や 409 は
   * 何度送っても結果が変わらず、内容を作る要求の枠（500回/時）を空費する。
   */
  async #putWithRetry(id: string, md: string, body: Record<string, unknown>): Promise<string> {
    let reason = "";

    for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
      let response: HttpResponseLike;
      try {
        response = await this.#request(this.#urlFor(this.#pathFor(id)), { method: "PUT", body });
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
        if (attempt < SAVE_ATTEMPTS - 1) await this.#sleep(SAVE_BACKOFF_MS * 2 ** attempt);
        continue;
      }

      if (response.status === 200 || response.status === 201) {
        // 応答に入っている新しい sha をそのまま版とする。読み直さない（設計書 8.7.6）
        const sha = readSavedSha(await response.json());
        if (sha === null) {
          return await this.#failSave(id, md, "保存の応答を読み取れませんでした", undefined);
        }
        return sha;
      }

      // #ensureWritable と PUT のあいだに他所が書き込んだ場合の最後の砦。
      // 422 は「既にあるのに sha を付けていない」で、これも他所での作成を意味する
      if (response.status === 409 || response.status === 422) {
        const current = await this.#fetchContent(id);
        if (current === null) throw new MapNotFoundError(id);
        throw new ConflictError(id, current.sha, current.md);
      }

      const detail = await messageOf(response);
      // 5xx は一時的なことがある。それ以外は送り直しても変わらない
      if (response.status < 500) {
        return await this.#failSave(
          id,
          md,
          `GitHub が保存を拒否しました（HTTP ${response.status}）${detail === "" ? "" : `: ${detail}`}`,
          new GitHubApiError(response.status, detail),
        );
      }
      reason = `GitHub 側の異常（HTTP ${response.status}）`;
      if (attempt < SAVE_ATTEMPTS - 1) await this.#sleep(SAVE_BACKOFF_MS * 2 ** attempt);
    }

    return this.#failSave(id, md, reason, undefined);
  }

  /** 保存できなかった。**内容を退避してから**投げる（規約「データを失わない」） */
  async #failSave(id: string, md: string, reason: string, cause: unknown): Promise<never> {
    await this.#quarantine.put(id, md, reason).catch(() => undefined);
    throw new SaveFailedError(id, reason, cause);
  }

  async remove(id: string): Promise<void> {
    if (!isValidMapId(id)) throw new MapNotFoundError(id);
    const current = await this.#fetchContent(id);
    if (current === null) throw new MapNotFoundError(id);

    const body: Record<string, unknown> = {
      message: `${id} を削除（Mieru）`,
      sha: current.sha,
    };
    if (this.#credential.branch !== null) body["branch"] = this.#credential.branch;

    const response = await this.#request(this.#urlFor(this.#pathFor(id)), {
      method: "DELETE",
      body,
    });
    if (response.status === 404) throw new MapNotFoundError(id);
    if (response.status === 409) {
      // 取得と削除のあいだに書き換えられた。消す前に利用者へ知らせる
      const latest = await this.#fetchContent(id);
      if (latest === null) throw new MapNotFoundError(id);
      throw new ConflictError(id, latest.sha, latest.md);
    }
    if (response.status !== 200) {
      throw new GitHubApiError(response.status, await messageOf(response));
    }
    if (this.#cache !== null) delete this.#cache[id];
  }
}
