import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import { decodeBase64, encodeBase64 } from "../base64.js";
import { GitHubApiError, GitHubHistoryStore, GitHubStore } from "../GitHubStore.js";
import type { GitHubCredential } from "../github-auth.js";
import type { HistoryStore } from "../types.js";
import { ConflictError, MapNotFoundError, SaveFailedError } from "../types.js";
import { describeMapStoreContract } from "./contract.js";
import { blobSha, FakeGitHub, memoryMetaCache, memoryQuarantine } from "./fake-github.js";

/**
 * GitHub を保存先とする実装の検証。
 *
 * 契約テストに加え、**実測で分かった GitHub 固有の癖**への対処を確かめる
 * （docs/human-review/github-api-verification.md）。とくに「削除済みを復活させない」は
 * 黙ってデータを戻す事故に直結するため、防御と、防御が必要な理由の両方を検査する。
 */

const MD = `---
title: 検証用マップ
tags: [仕事]
created: 2026-09-03T00:00:00Z
updated: 2026-09-03T00:00:00Z
---

# 検証用マップ

- 枝1
- 枝2
`;

const MD2 = MD.replace("- 枝2", "- 枝2\n- 枝3");

function credential(overrides: Partial<GitHubCredential> = {}): GitHubCredential {
  return {
    token: "github_pat_11ABCDEFG0123456789",
    repo: "kyritk/mieru-maps",
    branch: null,
    directory: "maps",
    ...overrides,
  };
}

function createStore(
  api: FakeGitHub,
  overrides: Partial<GitHubCredential> = {},
): { store: GitHubStore; quarantine: ReturnType<typeof memoryQuarantine> } {
  const quarantine = memoryQuarantine();
  const store = new GitHubStore(credential(overrides), {
    fetchImpl: api.fetchImpl,
    quarantine,
    metaCache: memoryMetaCache(),
    // 再試行の待機はテストでは不要
    sleep: () => Promise.resolve(),
  });
  return { store, quarantine };
}

describeMapStoreContract("GitHubStore", () => createStore(new FakeGitHub()).store);

describe("base64 の往復", () => {
  it("日本語と絵文字を壊さない", () => {
    // btoa に文字列をそのまま渡すと例外になる。ここが守られているかの検査
    const text = "# 見える\n\n- 枝1 🌏\n  - タブ\tと空白\n";
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });

  it("API が返す改行入りの base64 を復号できる", () => {
    const withNewlines = encodeBase64(MD).replace(/(.{60})/g, "$1\n");
    expect(decodeBase64(withNewlines)).toBe(MD);
  });
});

describe("GitHubStore は削除済みのマップを復活させない", () => {
  it("GitHub 自体は sha を無視して作ってしまう（防御が必要な理由）", async () => {
    // この癖が偽物に無ければ、次のテストは何も証明しない
    const api = new FakeGitHub();
    const response = await api.fetchImpl(
      `https://api.github.com/repos/${api.repo}/contents/maps/x.md`,
      {
        method: "PUT",
        headers: {},
        body: JSON.stringify({ message: "m", content: encodeBase64("x"), sha: "存在しない版" }),
      },
    );
    expect(response.status).toBe(201);
    expect(api.files.has("maps/x.md")).toBe(true);
  });

  it("他所で削除されていたら MapNotFoundError にし、書き込まない", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    const version = await store.write("a.md", MD, null);

    // 別の端末で削除された状況
    api.files.delete("maps/a.md");
    api.reset();

    await expect(store.write("a.md", MD2, version)).rejects.toBeInstanceOf(MapNotFoundError);
    expect(api.files.has("maps/a.md")).toBe(false);
    expect(api.requests.filter((request) => request.method === "PUT")).toHaveLength(0);
  });
});

describe("保存前の確認", () => {
  it("変化していなければ条件付き GET だけで済ませ、本文を取り直さない", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    const version = await store.write("a.md", MD, null);
    api.reset();

    await store.write("a.md", MD2, version);

    const gets = api.requests.filter((request) => request.method === "GET");
    expect(gets).toHaveLength(1);
    expect(gets[0]?.conditional).toBe(true);
    // 304 はレート枠を消費しない。ここが「実質ただ」の根拠
    expect(gets[0]?.status).toBe(304);
  });

  it("競合を見つけたら PUT を送らない", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    const stale = await store.write("a.md", MD, null);
    await store.write("a.md", MD2, stale);
    api.reset();

    await expect(store.write("a.md", "# 古い版\n", stale)).rejects.toThrow();
    expect(api.requests.filter((request) => request.method === "PUT")).toHaveLength(0);
  });
});

describe("一覧", () => {
  it("置き場所のフォルダがまだ無い状態は0件として扱う", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    await expect(store.list()).resolves.toEqual([]);
  });

  it("md 以外と隠しファイルを無視する", async () => {
    const api = new FakeGitHub();
    api.files.set("maps/a.md", MD);
    api.files.set("maps/README.txt", "無視される");
    api.files.set("maps/.hidden.md", "無視される");
    const { store } = createStore(api);

    const metas = await store.list();
    expect(metas.map((meta) => meta.id)).toEqual(["a.md"]);
    expect(metas[0]).toMatchObject({ title: "検証用マップ", tags: ["仕事"] });
  });

  it("sha が変わっていないマップの本文を読み直さない", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    await store.write("a.md", MD, null);
    await store.write("b.md", MD2, null);
    await store.list();
    api.reset();

    await store.list();
    // 一覧の1回だけ。本文は取り直していない
    expect(api.readCount).toBe(1);
  });

  it("外部で変わったマップだけ読み直す", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    await store.write("a.md", MD, null);
    await store.write("b.md", MD, null);
    await store.list();

    api.files.set("maps/b.md", MD2);
    api.reset();

    const metas = await store.list();
    // 一覧1回 + 変わった b.md の本文1回
    expect(api.readCount).toBe(2);
    expect(metas.find((meta) => meta.id === "b.md")?.version).toBe(blobSha(MD2));
  });
});

describe("日本語と置き場所", () => {
  it("日本語のファイル名と本文が往復する", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    const version = await store.write("思考の整理.md", MD, null);

    expect(api.files.has("maps/思考の整理.md")).toBe(true);
    await expect(store.read("思考の整理.md")).resolves.toEqual({ md: MD, version });
  });

  it("フォルダ未指定ならリポジトリ直下に置く", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api, { directory: "" });
    await store.write("a.md", MD, null);
    expect([...api.files.keys()]).toEqual(["a.md"]);
  });

  it("ブランチを指定すると要求に載せる", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api, { branch: "maps-branch" });
    await store.write("a.md", MD, null);
    // 偽物は単一ブランチなので、保存できたことをもって載せられたと見なす
    await expect(store.read("a.md")).resolves.toMatchObject({ md: MD });
  });
});

describe("失敗の扱い", () => {
  it("認証が切れたら内容を退避してから SaveFailedError を投げる", async () => {
    const api = new FakeGitHub();
    const { store, quarantine } = createStore(api);
    api.failNext = 401;
    api.failNextMethod = "PUT";

    const error = await store.write("a.md", MD, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SaveFailedError);
    // 失われていないこと。ここが「データを失わない」の最後の砦
    expect(quarantine.entries).toHaveLength(1);
    expect(quarantine.entries[0]?.md).toBe(MD);
  });

  it("認証が切れても再送しない（枠を空費しない）", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    api.failNext = 401;
    api.failNextMethod = "PUT";

    await store.write("a.md", MD, null).catch(() => undefined);
    expect(api.requests.filter((request) => request.method === "PUT")).toHaveLength(1);
  });

  it("サーバ側の異常と通信断は再試行する", async () => {
    for (const failure of [500, "network"] as const) {
      const api = new FakeGitHub();
      const { store } = createStore(api);
      api.failNext = failure;
      api.failNextMethod = "PUT";

      await expect(store.write("a.md", MD, null)).resolves.toBe(blobSha(MD));
      expect(api.requests.filter((request) => request.method === "PUT")).toHaveLength(2);
    }
  });

  it("読み取りの失敗は理由付きで投げる", async () => {
    const api = new FakeGitHub();
    api.files.set("maps/a.md", MD);
    const { store } = createStore(api);
    api.failNext = 403;

    await expect(store.list()).rejects.toBeInstanceOf(GitHubApiError);
  });

  it("403 は「何をどう直すか」まで伝える", async () => {
    // GitHub の "Resource not accessible by personal access token" だけでは、
    // 何の権限が足りないのかも、どこで直すのかも分からない
    const api = new FakeGitHub();
    const { store } = createStore(api);
    api.failNext = 403;

    const error = await store.list().catch((e: unknown) => e);
    expect((error as Error).message).toContain("Contents");
    expect((error as Error).message).toContain("Read and write");
  });

  it("保存が権限で拒まれたときも同じ案内をする", async () => {
    const api = new FakeGitHub();
    const { store, quarantine } = createStore(api);
    api.failNext = 403;
    api.failNextMethod = "PUT";

    const error = await store.write("a.md", MD, null).catch((e: unknown) => e);
    expect((error as Error).message).toContain("Contents");
    // 読み書きどちらで踏んでも、内容は失われない
    expect(quarantine.entries[0]?.md).toBe(MD);
  });
});

describe("壊れた応答と不正な入力", () => {
  it("ファイル名として使えない id を弾く", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    await expect(store.write("../外へ.md", MD, null)).rejects.toBeInstanceOf(SaveFailedError);
    await expect(store.read("no-extension")).rejects.toBeInstanceOf(MapNotFoundError);
    await expect(store.remove("no-extension")).rejects.toBeInstanceOf(MapNotFoundError);
    // 1件も要求を出していないこと（弾いた時点で終わっている）
    expect(api.requests).toHaveLength(0);
  });

  it("一覧の形式が想定と違えば例外にする", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    const broken: FakeGitHub["fetchImpl"] = () =>
      Promise.resolve({
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ 一覧ではない: true }),
      });
    const brokenStore = new GitHubStore(credential(), {
      fetchImpl: broken,
      quarantine: memoryQuarantine(),
      metaCache: memoryMetaCache(),
    });
    await expect(brokenStore.list()).rejects.toBeInstanceOf(GitHubApiError);
    void store;
  });

  it("本文の形式が想定と違えば例外にする", async () => {
    const broken: FakeGitHub["fetchImpl"] = () =>
      Promise.resolve({
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ sha: "abc" }),
      });
    const store = new GitHubStore(credential({ directory: "" }), {
      fetchImpl: broken,
      quarantine: memoryQuarantine(),
      metaCache: memoryMetaCache(),
    });
    await expect(store.read("a.md")).rejects.toBeInstanceOf(GitHubApiError);
  });

  it("保存前の確認が失敗したら保存に進まない", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    const version = await store.write("a.md", MD, null);
    api.reset();
    api.failNext = 500;
    api.failNextMethod = "GET";

    await expect(store.write("a.md", MD2, version)).rejects.toBeInstanceOf(GitHubApiError);
    expect(api.requests.filter((request) => request.method === "PUT")).toHaveLength(0);
  });

  it("再試行を使い切ったら退避して SaveFailedError を投げる", async () => {
    const api = new FakeGitHub();
    const { store, quarantine } = createStore(api);
    api.failNext = "network";
    api.failNextMethod = "PUT";
    api.failTimes = 3;

    await expect(store.write("a.md", MD, null)).rejects.toBeInstanceOf(SaveFailedError);
    expect(api.requests.filter((request) => request.method === "PUT")).toHaveLength(3);
    expect(quarantine.entries[0]?.md).toBe(MD);
  });

  it("削除の直前に書き換えられていたら消さずに知らせる", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    await store.write("a.md", MD, null);

    // 取得の後、削除の前に他所が書き換えた状況を作る
    let swapped = false;
    const racing: FakeGitHub["fetchImpl"] = (url, init) => {
      if ((init.method ?? "GET") === "DELETE" && !swapped) {
        swapped = true;
        api.files.set("maps/a.md", MD2);
      }
      return api.fetchImpl(url, init);
    };
    const racingStore = new GitHubStore(credential(), {
      fetchImpl: racing,
      quarantine: memoryQuarantine(),
      metaCache: memoryMetaCache(),
    });

    await expect(racingStore.remove("a.md")).rejects.toThrow();
    expect(api.files.has("maps/a.md")).toBe(true);
  });
});

describe("確認と保存のあいだに割り込まれた場合", () => {
  /** PUT の直前に他所が書き込む状況を作る */
  function racingStore(api: FakeGitHub, onPut: () => void): GitHubStore {
    const fetchImpl: FakeGitHub["fetchImpl"] = (url, init) => {
      if ((init.method ?? "GET") === "PUT") onPut();
      return api.fetchImpl(url, init);
    };
    return new GitHubStore(credential(), {
      fetchImpl,
      quarantine: memoryQuarantine(),
      metaCache: memoryMetaCache(),
      sleep: () => Promise.resolve(),
    });
  }

  it("上書きの直前に書き換えられていたら競合にする（409 の受け止め）", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    const version = await store.write("a.md", MD, null);

    const racing = racingStore(api, () => api.files.set("maps/a.md", MD2));
    const error = await racing.write("a.md", "# 私の編集\n", version).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).serverMd).toBe(MD2);
    // 私の編集で上書きされていないこと
    expect(api.files.get("maps/a.md")).toBe(MD2);
  });

  it("新規作成の直前に作られていたら競合にする（422 の受け止め）", async () => {
    const api = new FakeGitHub();
    const racing = racingStore(api, () => api.files.set("maps/a.md", MD2));

    const error = await racing.write("a.md", MD, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).serverMd).toBe(MD2);
  });
});

describe("そのほかの失敗経路", () => {
  it("保存の応答を読み取れなければ退避して知らせる", async () => {
    const api = new FakeGitHub();
    const quarantine = memoryQuarantine();
    const fetchImpl: FakeGitHub["fetchImpl"] = (url, init) =>
      (init.method ?? "GET") === "PUT"
        ? Promise.resolve({
            status: 201,
            headers: { get: () => null },
            json: () => Promise.resolve({ 想定外: true }),
          })
        : api.fetchImpl(url, init);
    const store = new GitHubStore(credential(), {
      fetchImpl,
      quarantine,
      metaCache: memoryMetaCache(),
      sleep: () => Promise.resolve(),
    });

    await expect(store.write("a.md", MD, null)).rejects.toBeInstanceOf(SaveFailedError);
    expect(quarantine.entries[0]?.md).toBe(MD);
  });

  it("理由を読み取れない失敗でも例外にする", async () => {
    const fetchImpl: FakeGitHub["fetchImpl"] = () =>
      Promise.resolve({
        status: 403,
        headers: { get: () => null },
        json: () => Promise.reject(new Error("本文がない")),
      });
    const store = new GitHubStore(credential(), {
      fetchImpl,
      quarantine: memoryQuarantine(),
      metaCache: memoryMetaCache(),
    });
    await expect(store.list()).rejects.toBeInstanceOf(GitHubApiError);
  });

  it("削除が拒否されたら例外にする", async () => {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    await store.write("a.md", MD, null);
    api.failNext = 500;
    api.failNextMethod = "DELETE";

    await expect(store.remove("a.md")).rejects.toBeInstanceOf(GitHubApiError);
    expect(api.files.has("maps/a.md")).toBe(true);
  });

  it("記憶の保存に失敗しても一覧は返す", async () => {
    const api = new FakeGitHub();
    api.files.set("maps/a.md", MD);
    const store = new GitHubStore(credential(), {
      fetchImpl: api.fetchImpl,
      quarantine: memoryQuarantine(),
      metaCache: {
        load: () => Promise.resolve(null),
        save: () => Promise.reject(new Error("保管庫が使えない")),
      },
    });
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it("frontmatter を持たない md はファイル名を表題にする", async () => {
    const api = new FakeGitHub();
    api.files.set("maps/手書き.md", "# 手書き\n\n- 枝\n");
    const { store } = createStore(api);

    await expect(store.list()).resolves.toEqual([
      {
        id: "手書き.md",
        title: "手書き",
        tags: [],
        created: "",
        updated: "",
        version: blobSha("# 手書き\n\n- 枝\n"),
      },
    ]);
  });
});

describe("既定の保管先を使う", () => {
  it("options を省略しても一覧・保存ができる", async () => {
    // 既定の IndexedDB（記憶と退避）を通す経路の確認
    const api = new FakeGitHub();
    const store = new GitHubStore(credential(), { fetchImpl: api.fetchImpl });
    await store.write("a.md", MD, null);
    await expect(store.list()).resolves.toHaveLength(1);
    // 2回目の一覧は記憶が効いて本文を読み直さない
    api.reset();
    await store.list();
    expect(api.readCount).toBe(1);
  });
});

describe("保存間隔", () => {
  it("ローカルより十分に長い間隔を推奨する", () => {
    const { store } = createStore(new FakeGitHub());
    // GitHub は内容を作る要求を 500回/時 に制限する（平均7.2秒に1回）
    expect(store.autosaveDelayMs).toBeGreaterThanOrEqual(7_200);
  });

  it("表示用の名前にトークンを含めない", () => {
    const { store } = createStore(new FakeGitHub());
    expect(store.label).toBe("kyritk/mieru-maps/maps");
    expect(store.label).not.toContain("github_pat");
  });
});

describe("GitHubHistoryStore（2.8-5）", () => {
  /**
   * **こちらは何も控えない。** 保存1回がコミット1つなので、履歴の実体は
   * 既にリポジトリの側にある。読めていること、そして「まだ何も無い」状態を
   * 異常として扱わないことを確かめる。
   */
  function createHistory(api: FakeGitHub): GitHubHistoryStore {
    return new GitHubHistoryStore(credential(), { fetchImpl: api.fetchImpl });
  }

  async function withCommits(): Promise<{ api: FakeGitHub; history: GitHubHistoryStore }> {
    const api = new FakeGitHub();
    const { store } = createStore(api);
    const first = await store.write("検証用マップ.md", MD, null);
    await store.write("検証用マップ.md", MD2, first);
    return { api, history: createHistory(api) };
  }

  it("コミットを新しい順の版として返す", async () => {
    const { history } = await withCommits();
    const entries = await history.list("検証用マップ.md");

    expect(entries).toHaveLength(2);
    expect(entries[0]?.at).toBeGreaterThan(entries[1]?.at ?? 0);
    // 大きさは返らない。出すには版ごとに本文を取りに行くことになる（設計書 8.7.8）
    expect(entries[0]?.size).toBeUndefined();
  });

  it("版の本文はその時点の内容になる", async () => {
    const { history } = await withCommits();
    const entries = await history.list("検証用マップ.md");

    expect(await history.read("検証用マップ.md", entries[0]?.id ?? "")).toBe(MD2);
    expect(await history.read("検証用マップ.md", entries[1]?.id ?? "")).toBe(MD);
  });

  it("一覧は本文を取りに行かない", async () => {
    // 50版で 1+N リクエストになるのを避ける（設計書 8.7.8）
    const { api, history } = await withCommits();
    api.reset();
    await history.list("検証用マップ.md");
    expect(api.requests).toHaveLength(1);
  });

  it("まだ何も置かれていないパスは版0件として返す", async () => {
    // 「使えない」ではなく「まだ無い」である
    const api = new FakeGitHub();
    expect(await createHistory(api).list("まだ無いマップ.md")).toEqual([]);
  });

  it("コミットが1つも無いリポジトリ（409）も版0件として扱う", async () => {
    const api = new FakeGitHub();
    api.failNext = 409;
    expect(await createHistory(api).list("検証用マップ.md")).toEqual([]);
  });

  it("読めない応答は握りつぶさない", async () => {
    const api = new FakeGitHub();
    api.failNext = 500;
    await expect(createHistory(api).list("検証用マップ.md")).rejects.toBeInstanceOf(GitHubApiError);
  });

  it("無い版を読もうとしたら MapNotFoundError", async () => {
    const { history } = await withCommits();
    await expect(history.read("検証用マップ.md", "c9-deadbee")).rejects.toBeInstanceOf(
      MapNotFoundError,
    );
  });

  it("控える手段を持たない", async () => {
    // 持たせると、リポジトリと IndexedDB の二重持ちになり片方だけが古くなる
    const api = new FakeGitHub();
    const history: HistoryStore = createHistory(api);
    // 添字で見るのは、メソッドを値として取り出すと unbound-method に掛かるため
    const asRecord = history as unknown as Record<string, unknown>;
    for (const name of ["record", "forget", "rename"]) {
      expect(asRecord[name]).toBeUndefined();
    }
    await Promise.resolve();
  });
});
