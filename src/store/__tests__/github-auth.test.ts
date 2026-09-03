import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  authHeaders,
  clearCredential,
  describeCredential,
  loadCredential,
  normalizeDirectory,
  parseCredentialInput,
  parseRepo,
  saveCredential,
  verifyCredential,
  type FetchLike,
  type GitHubCredential,
  type HttpResponseLike,
} from "../github-auth.js";
import { idbPut, STORE_SETTINGS } from "../idb.js";

/**
 * GitHub の資格情報を扱う層の検証。
 *
 * ここは**利用者の鍵を預かる唯一の場所**であり、
 * 「漏らさない」「壊れた記録で起動を止めない」が守れているかを確かめる。
 * 応答コードの分岐は実測値に基づく（docs/github-api-verification.md 3章）。
 */

const TOKEN = "github_pat_11ABCDEFG0123456789abcdefg";

const CREDENTIAL: GitHubCredential = {
  token: TOKEN,
  repo: "kyritk/mieru-maps",
  branch: null,
  directory: "maps",
};

/** 指定した応答を1つだけ返す偽の fetch。呼ばれた内容を記録する */
function fakeFetch(response: Partial<HttpResponseLike> & { status: number; body?: unknown }): {
  fetchImpl: FetchLike;
  calls: { url: string; headers: Record<string, string> }[];
} {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const headers = response.headers ?? { get: () => null };
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({ url, headers: init.headers });
    return Promise.resolve({
      status: response.status,
      headers,
      json: () =>
        response.body === undefined
          ? Promise.reject(new Error("本文がない"))
          : Promise.resolve(response.body),
    });
  };
  return { fetchImpl, calls };
}

/** 呼ばれた順に応答を返す偽の fetch。`verifyCredential` は2回投げる */
function fakeSequence(
  responses: { status: number; body?: unknown }[],
): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  let index = 0;
  const fetchImpl: FetchLike = (url) => {
    urls.push(url);
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return Promise.resolve({
      status: response?.status ?? 500,
      headers: { get: () => null },
      json: () =>
        response?.body === undefined
          ? Promise.reject(new Error("本文がない"))
          : Promise.resolve(response.body),
    });
  };
  return { fetchImpl, urls };
}

const REPO_OK = { status: 200, body: { default_branch: "main", permissions: { push: true } } };

beforeEach(clearCredential);

describe("リポジトリ名の正規化", () => {
  it("owner/repo をそのまま受ける", () => {
    expect(parseRepo("kyritk/mieru")).toBe("kyritk/mieru");
  });

  it("前後の空白を落とす", () => {
    expect(parseRepo("  kyritk/mieru  ")).toBe("kyritk/mieru");
  });

  it("URL を受ける", () => {
    expect(parseRepo("https://github.com/kyritk/mieru")).toBe("kyritk/mieru");
    expect(parseRepo("github.com/kyritk/mieru")).toBe("kyritk/mieru");
    expect(parseRepo("https://www.github.com/kyritk/mieru/")).toBe("kyritk/mieru");
  });

  it("リポジトリ内のページを開いたままコピーした URL も受ける", () => {
    // 利用者はファイルを見ている途中で URL をコピーしがちで、
    // ここで弾かれると理由が本人には分からない
    expect(parseRepo("https://github.com/kyritk/mieru/tree/main/docs")).toBe("kyritk/mieru");
  });

  it("末尾の .git を落とす", () => {
    expect(parseRepo("https://github.com/kyritk/mieru.git")).toBe("kyritk/mieru");
    expect(parseRepo("kyritk/mieru.git")).toBe("kyritk/mieru");
  });

  it("形になっていないものは null", () => {
    expect(parseRepo("")).toBeNull();
    expect(parseRepo("mieru")).toBeNull();
    expect(parseRepo("kyritk / mieru")).toBeNull();
    expect(parseRepo("kyritk/mieru/extra")).toBeNull();
    expect(parseRepo("kyritk-/mieru")).toBeNull();
  });
});

describe("フォルダ指定の正規化", () => {
  it("空はリポジトリ直下を意味する空文字になる", () => {
    expect(normalizeDirectory("")).toBe("");
    expect(normalizeDirectory("  ")).toBe("");
    expect(normalizeDirectory("/")).toBe("");
  });

  it("前後の / を落とす", () => {
    expect(normalizeDirectory("/maps/")).toBe("maps");
    expect(normalizeDirectory("docs/maps")).toBe("docs/maps");
  });

  it("パスを壊す指定は null", () => {
    expect(normalizeDirectory("a//b")).toBeNull();
    expect(normalizeDirectory("../secrets")).toBeNull();
    expect(normalizeDirectory("./maps")).toBeNull();
  });
});

describe("入力の受け取り", () => {
  const base = { token: TOKEN, repo: "kyritk/mieru", branch: "", directory: "" };

  it("整った入力から資格情報を作る", () => {
    const result = parseCredentialInput({ ...base, branch: "main", directory: "/maps/" });
    expect(result).toEqual({
      ok: true,
      credential: { token: TOKEN, repo: "kyritk/mieru", branch: "main", directory: "maps" },
    });
  });

  it("ブランチが空なら既定ブランチを意味する null になる", () => {
    const result = parseCredentialInput(base);
    expect(result.ok && result.credential.branch).toBeNull();
  });

  it("トークン未入力を弾く", () => {
    const result = parseCredentialInput({ ...base, token: "  " });
    expect(result).toMatchObject({ ok: false, field: "token" });
  });

  it("貼り付け損ねを弾く", () => {
    // 途中で切れたトークンをそのまま保存すると、
    // 保存時になって初めて失敗し、原因が分からなくなる
    expect(parseCredentialInput({ ...base, token: "github_pat_11ABC DEFG" })).toMatchObject({
      ok: false,
      field: "token",
    });
    expect(parseCredentialInput({ ...base, token: "github_pat_1" })).toMatchObject({
      ok: false,
      field: "token",
    });
  });

  it("ブランチ名の空白を弾く", () => {
    expect(parseCredentialInput({ ...base, branch: "main 2" })).toMatchObject({
      ok: false,
      field: "branch",
    });
  });

  it("リポジトリとフォルダの不正を、どの欄の問題かと共に返す", () => {
    expect(parseCredentialInput({ ...base, repo: "mieru" })).toMatchObject({
      ok: false,
      field: "repo",
    });
    expect(parseCredentialInput({ ...base, directory: "../他所" })).toMatchObject({
      ok: false,
      field: "directory",
    });
  });
});

describe("表示用の要約", () => {
  it("トークンを含めない", () => {
    // 画面にもログにも鍵を出さないための最後の砦
    const text = describeCredential(CREDENTIAL);
    expect(text).not.toContain(TOKEN);
    expect(text).toContain("kyritk/mieru-maps");
  });

  it("ブランチ未指定は既定ブランチと表示する", () => {
    expect(describeCredential(CREDENTIAL)).toContain("既定ブランチ");
  });
});

describe("到達確認", () => {
  it("認証ヘッダを付けてリポジトリを問い合わせる", async () => {
    const { fetchImpl, calls } = fakeFetch({
      status: 200,
      body: { default_branch: "main", private: true, permissions: { push: true } },
    });
    const result = await verifyCredential(CREDENTIAL, fetchImpl);

    expect(result).toEqual({ ok: true, defaultBranch: "main", isPrivate: true, canWrite: true });
    expect(calls[0]?.url).toBe("https://api.github.com/repos/kyritk/mieru-maps");
    expect(calls[0]?.headers).toMatchObject(authHeaders(TOKEN));
  });

  it("401 はトークンの問題として返す", async () => {
    const { fetchImpl } = fakeFetch({ status: 401 });
    await expect(verifyCredential(CREDENTIAL, fetchImpl)).resolves.toMatchObject({
      ok: false,
      reason: "unauthorized",
    });
  });

  it("404 は「無い」と「権限が無い」の両方を伝える", async () => {
    // GitHub は権限の無いリポジトリの存在を伏せるため、この2つは区別できない。
    // 片方だけを伝えると、利用者は正しい名前を疑って権限に辿り着けない
    const { fetchImpl } = fakeFetch({ status: 404 });
    const result = await verifyCredential(CREDENTIAL, fetchImpl);
    expect(result).toMatchObject({ ok: false, reason: "not-found" });
    expect(result.ok === false && result.message).toContain("権限");
  });

  it("403 は残り回数を見て、上限と権限を区別する", async () => {
    const limited = fakeFetch({ status: 403, headers: { get: () => "0" } });
    await expect(verifyCredential(CREDENTIAL, limited.fetchImpl)).resolves.toMatchObject({
      reason: "rate-limited",
    });

    const forbidden = fakeFetch({ status: 403, headers: { get: () => "4999" } });
    await expect(verifyCredential(CREDENTIAL, forbidden.fetchImpl)).resolves.toMatchObject({
      reason: "no-write",
    });
  });

  it("読めるが書けないトークンを弾く", async () => {
    const { fetchImpl } = fakeFetch({
      status: 200,
      body: { default_branch: "main", permissions: { push: false } },
    });
    await expect(verifyCredential(CREDENTIAL, fetchImpl)).resolves.toMatchObject({
      ok: false,
      reason: "no-write",
    });
  });

  it("permissions が無い応答は「判定できなかった」として通す", async () => {
    // canWrite の null は「書ける」ではない。保存時に初めて分かる場合がある
    const { fetchImpl } = fakeFetch({ status: 200, body: { default_branch: "trunk" } });
    await expect(verifyCredential(CREDENTIAL, fetchImpl)).resolves.toEqual({
      ok: true,
      defaultBranch: "trunk",
      isPrivate: false,
      canWrite: null,
    });
  });

  it("読み取れない応答と通信断を、それぞれ理由付きで返す", async () => {
    const broken = fakeFetch({ status: 200, body: { 何か: "違う" } });
    await expect(verifyCredential(CREDENTIAL, broken.fetchImpl)).resolves.toMatchObject({
      ok: false,
      reason: "unexpected",
    });

    const offline: FetchLike = () => Promise.reject(new Error("failed to fetch"));
    await expect(verifyCredential(CREDENTIAL, offline)).resolves.toMatchObject({
      ok: false,
      reason: "network",
    });

    const strange = fakeFetch({ status: 500 });
    await expect(verifyCredential(CREDENTIAL, strange.fetchImpl)).resolves.toMatchObject({
      ok: false,
      reason: "unexpected",
    });
  });
});

describe("保管", () => {
  it("書いた資格情報を読み戻せる", async () => {
    await saveCredential(CREDENTIAL);
    await expect(loadCredential()).resolves.toEqual(CREDENTIAL);
  });

  it("何も無ければ null", async () => {
    await expect(loadCredential()).resolves.toBeNull();
  });

  it("解除するとトークンが残らない", async () => {
    await saveCredential(CREDENTIAL);
    await clearCredential();
    await expect(loadCredential()).resolves.toBeNull();
  });

  it("壊れた記録は null にする（起動を止めない）", async () => {
    // 書き込みの途中で中断した記録や、将来の形式変更で残った古い記録が
    // 起動時の例外になると、ローカルフォルダ運用まで巻き添えで死ぬ
    for (const broken of [
      "文字列",
      {},
      { token: "", repo: "kyritk/mieru", branch: null, directory: "" },
      { token: TOKEN, repo: "壊れた名前", branch: null, directory: "" },
      { token: TOKEN, repo: "kyritk/mieru", branch: 1, directory: "" },
      { token: TOKEN, repo: "kyritk/mieru", branch: null },
    ]) {
      await idbPut(STORE_SETTINGS, broken, "githubCredential");
      await expect(loadCredential()).resolves.toBeNull();
    }
  });
});

describe("Contents 権限の確認", () => {
  /**
   * **リポジトリ情報だけを見ても検査にならない。**
   * `GET /repos/{owner}/{repo}` は Metadata 権限だけで通り、Metadata は GitHub が
   * 必須にしていて常に付く。Contents を付け忘れたトークンでもここは 200 を返し、
   * 実際に 2026-09-03 の実機確認でそれを踏んだ。
   */
  it("リポジトリ情報のあとに Contents も確かめる", async () => {
    const { fetchImpl, urls } = fakeSequence([REPO_OK, { status: 200, body: [] }]);
    await expect(verifyCredential(CREDENTIAL, fetchImpl)).resolves.toMatchObject({ ok: true });

    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe("https://api.github.com/repos/kyritk/mieru-maps");
    expect(urls[1]).toBe("https://api.github.com/repos/kyritk/mieru-maps/contents/maps");
  });

  it("Contents に触れないトークンを、直し方と共に弾く", async () => {
    const { fetchImpl } = fakeSequence([
      REPO_OK,
      { status: 403, body: { message: "Resource not accessible by personal access token" } },
    ]);
    const result = await verifyCredential(CREDENTIAL, fetchImpl);

    expect(result).toMatchObject({ ok: false, reason: "no-write" });
    // 何をどう直すのかまで言えていること
    expect(result.ok === false && result.message).toContain("Contents");
    expect(result.ok === false && result.message).toContain("Read and write");
  });

  it("置き場所のフォルダが未作成でも通す", async () => {
    // 権限が無ければ GitHub は 404 ではなく 403 を返す（実測）。
    // つまり 404 は「権限はあるが、まだフォルダが無い」を意味する
    const { fetchImpl } = fakeSequence([REPO_OK, { status: 404, body: { message: "Not Found" } }]);
    await expect(verifyCredential(CREDENTIAL, fetchImpl)).resolves.toMatchObject({ ok: true });
  });

  it("Contents の確認中に上限へ達したら、権限不足と混同しない", async () => {
    const calls: number[] = [];
    const fetchImpl: FetchLike = () => {
      calls.push(1);
      return Promise.resolve({
        status: calls.length === 1 ? 200 : 403,
        headers: { get: () => (calls.length === 1 ? null : "0") },
        json: () => Promise.resolve(calls.length === 1 ? REPO_OK.body : { message: "rate" }),
      });
    };
    await expect(verifyCredential(CREDENTIAL, fetchImpl)).resolves.toMatchObject({
      reason: "rate-limited",
    });
  });
});
