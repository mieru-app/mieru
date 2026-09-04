import { createHash } from "node:crypto";

import type { MetaCache, MetaCacheRecord } from "../GitHubStore.js";
import type { FetchLike, HttpResponseLike } from "../github-auth.js";
import type { QuarantineSink } from "../quarantine.js";

/**
 * GitHub Contents API の偽物。
 *
 * **実測した挙動をそのまま写している**（docs/human-review/github-api-verification.md 3章）。
 * とくに「存在しないパスへ `sha` 付きで PUT すると `sha` を無視して 201 で作る」
 * という癖は、それが再現されていなければ `GitHubStore` の防御を検証できない。
 *
 * base64 は Node の `Buffer` で組み立てる。本体（`src/store/base64.ts`）と
 * 同じ実装を使うと、そこに誤りがあっても打ち消し合って気づけないため。
 */

/** git の blob ハッシュ。API が返す `sha` はこれと同じ値である（実測済み） */
export function blobSha(text: string): string {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf8"), bytes]))
    .digest("hex");
}

/** API が返す base64 は60文字ごとに改行が入る。復号側の検証のため再現する */
function toApiBase64(text: string): string {
  const raw = Buffer.from(text, "utf8").toString("base64");
  return (raw.match(/.{1,60}/g) ?? []).join("\n");
}

export interface RecordedRequest {
  method: string;
  /** クエリを除いた、復号済みのリポジトリ内パス */
  path: string;
  status: number;
  conditional: boolean;
}

interface FakeResponse {
  status: number;
  body?: unknown;
  etag?: string;
}

function toResponse(response: FakeResponse): HttpResponseLike {
  const headers = new Map<string, string>();
  if (response.etag !== undefined) {
    headers.set("etag", response.etag);
    headers.set("cache-control", "private, max-age=60, s-maxage=60");
  }
  return {
    status: response.status,
    headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
    json: () =>
      response.body === undefined
        ? Promise.reject(new Error("本文がない"))
        : Promise.resolve(response.body),
  };
}

export class FakeGitHub {
  /** リポジトリ内のパス → 本文 */
  readonly files = new Map<string, string>();
  /**
   * リポジトリ内のパス → そのパスへのコミット（古い順）。
   *
   * **保存1回がコミット1つ**という GitHub の性質を写している。
   * `GitHubHistoryStore`（2.8-5）はここを履歴として読む
   */
  readonly commits = new Map<string, { sha: string; date: string; md: string }[]>();
  /** コミットの時刻。テストから進められるようにする */
  now = Date.parse("2026-09-04T00:00:00Z");
  readonly requests: RecordedRequest[] = [];
  /** 次の1回だけこの状態を返す。通信断や 5xx の試験に使う */
  failNext: "network" | number | null = null;
  /** `failNext` を適用するメソッド。null なら次の要求に無条件で適用する */
  failNextMethod: string | null = null;
  /** `failNext` を何回続けるか。再試行を使い切る試験に使う */
  failTimes = 1;

  constructor(readonly repo = "kyritk/mieru-maps") {}

  /** 読み取り回数（本文・一覧の両方を含む）。往復の節約を測るために使う */
  get readCount(): number {
    return this.requests.filter((request) => request.method === "GET").length;
  }

  reset(): void {
    this.requests.length = 0;
  }

  /** そのパスへコミットを1つ積む */
  #commit(path: string, md: string): void {
    const log = this.commits.get(path) ?? [];
    log.push({
      sha: `c${String(log.length + 1)}-${blobSha(md).slice(0, 7)}`,
      date: new Date(this.now).toISOString(),
      md,
    });
    this.commits.set(path, log);
    this.now += 60_000;
  }

  /** `GET /commits?path=...` の応答。新しい順に返す */
  #commitList(url: string): unknown[] {
    const path = new URL(url).searchParams.get("path") ?? "";
    const log = this.commits.get(path) ?? [];
    return [...log]
      .reverse()
      .map((entry) => ({ sha: entry.sha, commit: { committer: { date: entry.date } } }));
  }

  #parse(url: string): string {
    const parsed = new URL(url);
    const prefix = `/repos/${this.repo}/contents/`;
    if (!parsed.pathname.startsWith(prefix)) throw new Error(`想定外の URL: ${url}`);
    return parsed.pathname
      .slice(prefix.length)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  }

  #isDirectory(path: string): boolean {
    if (path === "") return true;
    const prefix = `${path}/`;
    for (const key of this.files.keys()) if (key.startsWith(prefix)) return true;
    return false;
  }

  #entriesIn(path: string): unknown[] {
    const prefix = path === "" ? "" : `${path}/`;
    const entries: unknown[] = [];
    for (const [key, value] of this.files) {
      if (!key.startsWith(prefix)) continue;
      const name = key.slice(prefix.length);
      // 直下のみ（サブフォルダは畳まない）
      if (name.includes("/")) continue;
      entries.push({
        name,
        path: key,
        sha: blobSha(value),
        size: Buffer.byteLength(value, "utf8"),
        type: "file",
      });
    }
    return entries;
  }

  readonly fetchImpl: FetchLike = (url, init) => {
    // コミット一覧は contents とは別の道である（2.8-5）
    const isCommits = new URL(url).pathname === `/repos/${this.repo}/commits`;
    const path = isCommits ? "commits" : this.#parse(url);
    const method = init.method ?? "GET";
    const conditional = init.headers["If-None-Match"] !== undefined;

    const record = (status: number): void => {
      this.requests.push({ method, path, status, conditional });
    };

    const failing = this.failNext !== null && (this.failNextMethod ?? method) === method;
    const consume = (): void => {
      this.failTimes -= 1;
      if (this.failTimes <= 0) {
        this.failNext = null;
        this.failTimes = 1;
      }
    };
    if (failing && this.failNext === "network") {
      consume();
      record(0);
      return Promise.reject(new Error("failed to fetch"));
    }
    if (failing && typeof this.failNext === "number") {
      const status = this.failNext;
      consume();
      record(status);
      return Promise.resolve(toResponse({ status, body: { message: "偽の失敗" } }));
    }

    const respond = (response: FakeResponse): Promise<HttpResponseLike> => {
      record(response.status);
      return Promise.resolve(toResponse(response));
    };

    // 失敗の注入を通り抜けてから応える。ここを先に置くと 5xx を試験できない
    if (isCommits) return respond({ status: 200, body: this.#commitList(url) });

    if (method === "GET") {
      if (this.#isDirectory(path)) return respond({ status: 200, body: this.#entriesIn(path) });

      /*
       * `?ref=` にコミットの sha が来たら、その時点の内容を返す。
       * ブランチ名や未指定のときは現在の内容になる（本物と同じ）。
       * コミットの sha は `c<番号>-` で始めてあり、ブランチ名と見分けられる
       */
      const ref = new URL(url).searchParams.get("ref");
      const byCommit = ref !== null && /^c\d+-/.test(ref);
      const atCommit = byCommit
        ? this.commits.get(path)?.find((entry) => entry.sha === ref)
        : undefined;
      // 知らないコミットを指されたら現在の内容へ落とさない。本物は 404 を返す
      if (byCommit && atCommit === undefined) {
        return respond({ status: 404, body: { message: "No commit found for the ref" } });
      }
      const content = atCommit?.md ?? this.files.get(path);
      if (content === undefined) return respond({ status: 404, body: { message: "Not Found" } });

      const sha = blobSha(content);
      if (init.headers["If-None-Match"] === `"${sha}"`)
        return respond({ status: 304, etag: `"${sha}"` });
      return respond({
        status: 200,
        etag: `"${sha}"`,
        body: {
          name: path.split("/").at(-1),
          path,
          sha,
          size: Buffer.byteLength(content, "utf8"),
          type: "file",
          encoding: "base64",
          content: toApiBase64(content),
        },
      });
    }

    const body = JSON.parse(init.body ?? "{}") as Record<string, unknown>;

    if (method === "PUT") {
      const existing = this.files.get(path);
      const givenSha = typeof body["sha"] === "string" ? body["sha"] : undefined;

      if (existing !== undefined) {
        if (givenSha === undefined) {
          return respond({
            status: 422,
            body: { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' },
          });
        }
        const currentSha = blobSha(existing);
        if (givenSha !== currentSha) {
          return respond({
            status: 409,
            body: { message: `${path} does not match ${givenSha}` },
          });
        }
      }
      // **存在しない場合、GitHub は sha を見ない。** 実測どおり作成してしまう
      const content = Buffer.from(String(body["content"]), "base64").toString("utf8");
      this.files.set(path, content);
      this.#commit(path, content);
      const sha = blobSha(content);
      return respond({
        status: existing === undefined ? 201 : 200,
        body: {
          content: { path, sha, content: toApiBase64(content) },
          commit: { sha: `c-${sha}` },
        },
      });
    }

    if (method === "DELETE") {
      const existing = this.files.get(path);
      if (existing === undefined) return respond({ status: 404, body: { message: "Not Found" } });
      if (body["sha"] !== blobSha(existing)) {
        return respond({ status: 409, body: { message: "does not match" } });
      }
      this.files.delete(path);
      return respond({ status: 200, body: { commit: { sha: "c-delete" } } });
    }

    throw new Error(`想定外のメソッド: ${method}`);
  };
}

/** 記憶を持たない `MetaCache`。既定の IndexedDB を通さずに検証するため */
export function memoryMetaCache(): MetaCache & { readonly saved: Map<string, MetaCacheRecord> } {
  const saved = new Map<string, MetaCacheRecord>();
  return {
    load: (key) => Promise.resolve(saved.get(key) ?? null),
    save: (key, value) => {
      saved.set(key, structuredClone(value));
      return Promise.resolve();
    },
    saved,
  };
}

/** 退避先の偽物。退避されたかを検証できるようにする */
export function memoryQuarantine(): QuarantineSink & {
  readonly entries: { id: string; md: string; reason: string }[];
} {
  const entries: { id: string; md: string; reason: string }[] = [];
  return {
    entries,
    put: (id, md, reason) => {
      entries.push({ id, md, reason });
      return Promise.resolve();
    },
  };
}
