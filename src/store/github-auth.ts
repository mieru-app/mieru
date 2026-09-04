import { idbDelete, idbGet, idbPut, STORE_SETTINGS } from "./idb.js";

/**
 * GitHub 保存先の資格情報の受け取り・検証・保管（Phase 2.6-2）。
 *
 * 扱うのは「どのリポジトリへ、どの鍵で書くか」だけで、読み書きそのものには関与しない。
 * それは `GitHubStore`（2.6-3）の役目である。
 *
 * **IMPORTANT: トークン文字列を持つのはこのファイルだけにする。**
 * 画面やログに出す必要が生じたら `describeCredential()` を使うこと。
 * 資格情報オブジェクトをそのまま `console.log` へ渡すとトークンが漏れる。
 *
 * 仕様の正本: docs/design.md 8.7
 * API の実測値: docs/human-review/github-api-verification.md
 */

/** 保管庫には常にこの1件だけを置く */
const CREDENTIAL_KEY = "githubCredential";

export const GITHUB_API = "https://api.github.com";

export interface GitHubCredential {
  /** Fine-grained PAT。表示・記録しない */
  readonly token: string;
  /** `owner/repo` に正規化済み */
  readonly repo: string;
  /** null なら GitHub の既定ブランチを使う */
  readonly branch: string | null;
  /** マップの置き場所。`""` はリポジトリ直下。前後の `/` は取り除いてある */
  readonly directory: string;
}

// ---------------------------------------------------------------------------
// 入力の正規化
// ---------------------------------------------------------------------------

/** GitHub のリポジトリ名として許される字（owner は末尾にハイフンを置けない） */
const REPO_PATTERN = /^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+)$/;

const GITHUB_URL_PREFIX = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i;

/**
 * `owner/repo` に正規化する。受け付けられない場合は null。
 *
 * ブラウザのアドレス欄からそのまま貼れるよう URL も受ける。
 * `https://github.com/owner/repo/tree/main/docs` のように後ろが続いていても、
 * URL であれば先頭2つの区切りだけを見る（利用者はリポジトリ内のページを開いたまま
 * URL をコピーしがちで、そこで弾かれる理由が本人には分からないため）。
 */
export function parseRepo(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const isUrl = GITHUB_URL_PREFIX.test(trimmed);
  const path = trimmed.replace(GITHUB_URL_PREFIX, "").replace(/\/+$/, "");

  let candidate = path;
  if (isUrl) {
    const segments = path.split("/");
    const owner = segments[0];
    const repo = segments[1];
    if (owner === undefined || repo === undefined) return null;
    candidate = `${owner}/${repo}`;
  }
  candidate = candidate.replace(/\.git$/i, "");

  const matched = REPO_PATTERN.exec(candidate);
  if (matched === null) return null;
  return `${matched[1]}/${matched[2]}`;
}

/**
 * リポジトリ内のフォルダを正規化する。受け付けられない場合は null。
 * 直下に置く場合は空文字を返す（null との違いに注意。null は入力が不正）。
 */
export function normalizeDirectory(input: string): string | null {
  const trimmed = input.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") return "";

  const segments = trimmed.split("/");
  // 空区切り（`a//b`）と相対指定はパスを組み立てるときに壊れるので受けない
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  return segments.join("/");
}

export interface CredentialInput {
  token: string;
  repo: string;
  /** 空文字なら既定ブランチ */
  branch: string;
  /** 空文字ならリポジトリ直下 */
  directory: string;
}

export type CredentialParse =
  | { ok: true; credential: GitHubCredential }
  | { ok: false; field: "token" | "repo" | "branch" | "directory"; message: string };

/**
 * 入力欄の値を資格情報へ変換する。
 *
 * **通信はしない。** 形が整っているかだけを見る。実際に使えるかは
 * `verifyCredential()` が確かめる。文言をここに置くのは、
 * 同じ判断が画面側に散らばるのを避けるため（CLAUDE.md「描画層に判断を書かない」）。
 */
export function parseCredentialInput(input: CredentialInput): CredentialParse {
  const token = input.token.trim();
  if (token === "") {
    return { ok: false, field: "token", message: "トークンを入力してください。" };
  }
  if (/\s/.test(token)) {
    return {
      ok: false,
      field: "token",
      message: "トークンに空白が含まれています。貼り付けが途中で切れていないか確認してください。",
    };
  }
  if (token.length < 20) {
    return {
      ok: false,
      field: "token",
      message: "トークンが短すぎます。値が途中で切れていないか確認してください。",
    };
  }

  const repo = parseRepo(input.repo);
  if (repo === null) {
    return {
      ok: false,
      field: "repo",
      message: "リポジトリを「owner/repo」の形か、リポジトリの URL で入力してください。",
    };
  }

  const branch = input.branch.trim();
  if (/\s/.test(branch)) {
    return { ok: false, field: "branch", message: "ブランチ名に空白は使えません。" };
  }

  const directory = normalizeDirectory(input.directory);
  if (directory === null) {
    return {
      ok: false,
      field: "directory",
      message: "フォルダの指定に使えない部分があります（`.` と `..` は使えません）。",
    };
  }

  return {
    ok: true,
    credential: { token, repo, branch: branch === "" ? null : branch, directory },
  };
}

/** 記録・表示用。**トークンを含めない。** */
export function describeCredential(credential: GitHubCredential): string {
  const branch = credential.branch ?? "既定ブランチ";
  const place = credential.directory === "" ? "" : ` /${credential.directory}`;
  return `${credential.repo} (${branch})${place}`;
}

// ---------------------------------------------------------------------------
// 実際に使えるかの確認
// ---------------------------------------------------------------------------

export interface HttpResponseLike {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export interface GitHubRequestInit {
  /** 省略時は GET */
  method?: string;
  headers: Record<string, string>;
  body?: string;
  /**
   * `"no-store"` を指定した要求はブラウザのキャッシュを通さない。
   * GET の応答には60秒のキャッシュが付くため、競合の判定に使う読み取りでは必ず指定する
   * （設計書 8.7.6）
   */
  cache?: "no-store";
}

/** `fetch` の必要な部分だけを写した型。テストでは偽物を渡す */
export type FetchLike = (url: string, init: GitHubRequestInit) => Promise<HttpResponseLike>;

/** 実物の `fetch` を `FetchLike` として使う。`Response` はこの型を構造的に満たす */
export const browserFetch: FetchLike = (url, init) => fetch(url, init);

export type VerifyFailure =
  | "unauthorized"
  | "not-found"
  | "no-write"
  | "rate-limited"
  | "unexpected"
  | "network";

export type VerifyResult =
  | {
      ok: true;
      /** 既定ブランチ名。`credential.branch` が null のときはこれを使う */
      defaultBranch: string;
      isPrivate: boolean;
      /**
       * 書き込めるか。**null は「判定できなかった」であって「書ける」ではない。**
       * GitHub は応答に `permissions` を必ず含めるとは限らない
       */
      canWrite: boolean | null;
    }
  | { ok: false; reason: VerifyFailure; message: string };

/** 資格情報を付けた GitHub API の要求ヘッダ */
export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function readRepoInfo(
  value: unknown,
): { defaultBranch: string; isPrivate: boolean; canWrite: boolean | null } | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  const defaultBranch = body["default_branch"];
  if (typeof defaultBranch !== "string" || defaultBranch === "") return null;

  const permissions = body["permissions"];
  let canWrite: boolean | null = null;
  if (typeof permissions === "object" && permissions !== null) {
    const push = (permissions as Record<string, unknown>)["push"];
    if (typeof push === "boolean") canWrite = push;
  }

  return { defaultBranch, isPrivate: body["private"] === true, canWrite };
}

/** 権限不足を伝える文言。**何をどう直せばよいかまで言う** */
const NO_CONTENTS_MESSAGE =
  "トークンにこのリポジトリの Contents 権限がありません。" +
  "GitHub のトークン設定で Permissions → Repository permissions → Contents を" +
  "「Read and write」にしてください。Metadata だけでは読み書きできません。";

/**
 * リポジトリへ到達できるかを確かめる。**書き込みは行わない。**
 *
 * 保存を試すには実際にコミットを作るしかなく、確認のために検証用ファイルを
 * 置いて消すと、利用者のリポジトリに履歴が残る。読み取りで分かる範囲に留める。
 *
 * **確認は2回に分ける。**
 *
 * 1. `GET /repos/{owner}/{repo}` — リポジトリの存在と既定ブランチ
 * 2. `GET /repos/{owner}/{repo}/contents/...` — **Contents 権限があるか**
 *
 * **2 が無いと検査にならない。** 1 は Metadata 権限だけで通り、Metadata は
 * GitHub が必須にしていて常に付く。つまり **Contents を付け忘れたトークンでも
 * 1 は 200 を返す**（2026-09-03 に実機で踏んだ）。そのまま通すと、
 * 接続は成功したのに最初の保存で初めて失敗する、という最も分かりにくい壊れ方をする。
 *
 * 応答コードの意味は実測で確かめてある（docs/human-review/github-api-verification.md）。
 * とくに **404 は「無い」と「権限が無い」の両方**を指す。GitHub は権限の無い
 * リポジトリの存在を伏せるため、この2つを呼び出し側でも区別できない。
 */
export async function verifyCredential(
  credential: GitHubCredential,
  fetchImpl: FetchLike,
): Promise<VerifyResult> {
  let response: HttpResponseLike;
  try {
    response = await fetchImpl(`${GITHUB_API}/repos/${credential.repo}`, {
      headers: authHeaders(credential.token),
    });
  } catch {
    return {
      ok: false,
      reason: "network",
      message: "GitHub に接続できませんでした。通信の状態を確認してください。",
    };
  }

  if (response.status === 401) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "トークンが無効か、期限が切れています。GitHub で作り直してください。",
    };
  }
  if (response.status === 404) {
    return {
      ok: false,
      reason: "not-found",
      message:
        `${credential.repo} が見つかりません。` +
        "リポジトリ名が違うか、トークンにこのリポジトリへの権限がありません。" +
        "GitHub は権限の無いリポジトリを「存在しない」として扱うため、この2つは区別できません。",
    };
  }
  if (response.status === 403) {
    if (response.headers.get("x-ratelimit-remaining") === "0") {
      return {
        ok: false,
        reason: "rate-limited",
        message: "GitHub の利用回数の上限に達しました。しばらく待ってから試してください。",
      };
    }
    return { ok: false, reason: "no-write", message: NO_CONTENTS_MESSAGE };
  }
  if (response.status !== 200) {
    return {
      ok: false,
      reason: "unexpected",
      message: `GitHub が予期しない応答を返しました（HTTP ${response.status}）。`,
    };
  }

  let info: ReturnType<typeof readRepoInfo>;
  try {
    info = readRepoInfo(await response.json());
  } catch {
    info = null;
  }
  if (info === null) {
    return {
      ok: false,
      reason: "unexpected",
      message: "GitHub の応答を読み取れませんでした。",
    };
  }

  if (info.canWrite === false) {
    return {
      ok: false,
      reason: "no-write",
      message:
        `${credential.repo} を読むことはできますが、書き込めません。` +
        "トークンの Contents 権限を「Read and write」にしてください。",
    };
  }

  // ここまでは Metadata 権限だけでも通る。Contents に触れるかを別に確かめる
  const contents = await verifyContentsAccess(credential, fetchImpl);
  if (contents !== null) return contents;

  return {
    ok: true,
    defaultBranch: info.defaultBranch,
    isPrivate: info.isPrivate,
    canWrite: info.canWrite,
  };
}

/**
 * Contents を読めるかだけを確かめる。問題が無ければ null を返す。
 *
 * **`404` は合格である。** 置き場所のフォルダがまだ無いだけであり、
 * 権限が無ければ GitHub は `404` ではなく `403` を返す（実測）。
 *
 * **読めることは書けることを保証しない。** Contents が Read-only のトークンは
 * ここを通る。書き込みの可否はコミットを作らずには確かめられないため、
 * 最初の保存で分かる。そのときの文言も同じ内容を指すようにしてある
 * （`GitHubStore`）。
 */
async function verifyContentsAccess(
  credential: GitHubCredential,
  fetchImpl: FetchLike,
): Promise<VerifyResult | null> {
  const path = credential.directory
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `${GITHUB_API}/repos/${credential.repo}/contents/${path}`;

  let response: HttpResponseLike;
  try {
    response = await fetchImpl(url, { headers: authHeaders(credential.token), cache: "no-store" });
  } catch {
    return {
      ok: false,
      reason: "network",
      message: "GitHub に接続できませんでした。通信の状態を確認してください。",
    };
  }

  if (response.status === 200 || response.status === 404) return null;
  if (response.status === 401) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "トークンが無効か、期限が切れています。GitHub で作り直してください。",
    };
  }
  if (response.status === 403) {
    if (response.headers.get("x-ratelimit-remaining") === "0") {
      return {
        ok: false,
        reason: "rate-limited",
        message: "GitHub の利用回数の上限に達しました。しばらく待ってから試してください。",
      };
    }
    return { ok: false, reason: "no-write", message: NO_CONTENTS_MESSAGE };
  }
  return {
    ok: false,
    reason: "unexpected",
    message: `GitHub が予期しない応答を返しました（HTTP ${response.status}）。`,
  };
}

// ---------------------------------------------------------------------------
// 保管
// ---------------------------------------------------------------------------

function toCredential(value: unknown): GitHubCredential | null {
  if (typeof value !== "object" || value === null) return null;
  const stored = value as Record<string, unknown>;
  const { token, repo, branch, directory } = stored;
  if (typeof token !== "string" || token === "") return null;
  if (typeof repo !== "string" || parseRepo(repo) !== repo) return null;
  if (branch !== null && typeof branch !== "string") return null;
  if (typeof directory !== "string") return null;
  return { token, repo, branch, directory };
}

export async function saveCredential(credential: GitHubCredential): Promise<void> {
  // 構造化クローンできる素の値だけを渡す
  const { token, repo, branch, directory } = credential;
  await idbPut(STORE_SETTINGS, { token, repo, branch, directory }, CREDENTIAL_KEY);
}

/**
 * 保管してある資格情報を読む。
 *
 * **形が壊れていたら null を返す。** 書き込みの途中で中断した記録や、
 * 将来の形式変更で残った古い記録で起動を止めないため。
 */
export async function loadCredential(): Promise<GitHubCredential | null> {
  return toCredential(await idbGet<unknown>(STORE_SETTINGS, CREDENTIAL_KEY));
}

/** 接続を解除する。トークンを保管庫から消す */
export async function clearCredential(): Promise<void> {
  await idbDelete(STORE_SETTINGS, CREDENTIAL_KEY);
}
