import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contentHash } from "../hash.js";
import { LocalFolderStore } from "../LocalFolderStore.js";
import { ConflictError, MapNotFoundError, SaveFailedError } from "../types.js";
import { describeMapStoreContract } from "./contract.js";
import { domError, FakeDirectory, FakeQuarantine } from "./fake-fs.js";

/**
 * LocalFolderStore の検証。
 *
 * MapStore の契約は共通スイートを流用して通す。それに加えて
 * この実装に固有の関心事――内容ハッシュによる版管理、保存の再試行と退避、
 * 外部変更の検知――を個別に検証する。
 */

const MD = `---
title: テスト
tags: [a]
created: 2026-09-01T00:00:00Z
updated: 2026-09-01T00:00:00Z
---

# テスト

- 子
`;

/** 待たない sleep。再試行のテストを実時間で遅くしないため */
const noSleep = (): Promise<void> => Promise.resolve();

function newStore(directory = new FakeDirectory()): LocalFolderStore {
  return new LocalFolderStore(directory, { quarantine: new FakeQuarantine(), sleep: noSleep });
}

describeMapStoreContract("LocalFolderStore", () => newStore());

describe("LocalFolderStore はフォルダ直下の md だけを扱う", () => {
  it("md 以外・隠しファイルを一覧に含めない", async () => {
    const dir = new FakeDirectory();
    dir.putRaw("a.md", MD);
    dir.putRaw("メモ.txt", "無関係");
    dir.putRaw(".hidden.md", MD);

    await expect(
      newStore(dir)
        .list()
        .then((m) => m.map((x) => x.id)),
    ).resolves.toEqual(["a.md"]);
  });

  it("frontmatter を持たないファイルはファイル名を表題に使う", async () => {
    const dir = new FakeDirectory();
    dir.putRaw("手書き.md", "# 見出しだけ\n");

    const [meta] = await newStore(dir).list();
    expect(meta?.title).toBe("手書き");
    expect(meta?.tags).toEqual([]);
  });

  it("フォルダ外へ書き出そうとする id を拒む", async () => {
    const store = newStore();
    for (const id of ["../外.md", "sub/内.md", "a\b.md"]) {
      await expect(store.write(id, MD, null)).rejects.toBeInstanceOf(SaveFailedError);
      await expect(store.read(id)).rejects.toBeInstanceOf(MapNotFoundError);
    }
  });

  it("拡張子が md でない id を拒む", async () => {
    await expect(newStore().write("a.txt", MD, null)).rejects.toBeInstanceOf(SaveFailedError);
  });

  it("フォルダ名を公開する（ステータスバー表示用）", () => {
    expect(newStore(new FakeDirectory("作業用")).folderName).toBe("作業用");
  });
});

describe("version は内容ハッシュである", () => {
  it("read が返す version は内容から決まる", async () => {
    const dir = new FakeDirectory();
    dir.putRaw("a.md", MD);
    await expect(newStore(dir).read("a.md")).resolves.toEqual({ md: MD, version: contentHash(MD) });
  });

  it("外部で内容が変わると、握っていた version での保存が競合になる", async () => {
    const dir = new FakeDirectory();
    const store = newStore(dir);
    const version = await store.write("a.md", MD, null);

    dir.putRaw("a.md", `${MD}- 外部で足された行\n`);

    const error = await store.write("a.md", "# 上書き\n", version).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).serverMd).toContain("外部で足された行");
  });

  it("外部から同じ内容で書き直されても競合にしない", async () => {
    // 更新日時を版にしていると内容が同じでも競合になる。
    // 内容ハッシュを版にしている利点がここに出る
    const dir = new FakeDirectory();
    const store = newStore(dir);
    const version = await store.write("a.md", MD, null);

    dir.putRaw("a.md", MD);

    await expect(store.write("a.md", "# 更新\n", version)).resolves.toBe(contentHash("# 更新\n"));
  });

  it("更新日時とサイズが変わらない限り内容を読み直さない", async () => {
    const dir = new FakeDirectory();
    dir.putRaw("a.md", MD);
    const store = newStore(dir);

    await store.list();
    const readsAfterFirst = dir.reads.length;
    await store.list();
    await store.read("a.md");

    // getFile() は毎回呼ぶ（更新日時の確認に要る）が、結果は記憶と一致する
    expect(dir.reads.length).toBeGreaterThan(readsAfterFirst);
    await expect(store.read("a.md")).resolves.toEqual({ md: MD, version: contentHash(MD) });
  });
});

describe("保存の堅牢化", () => {
  it("一時的な失敗は再試行して保存できる", async () => {
    const dir = new FakeDirectory();
    dir.failWrites(2);
    const quarantine = new FakeQuarantine();
    const store = new LocalFolderStore(dir, { quarantine, sleep: noSleep });

    await expect(store.write("a.md", MD, null)).resolves.toBe(contentHash(MD));
    expect(quarantine.saved).toEqual([]);
    expect(dir.entries.get("a.md")?.content).toBe(MD);
  });

  it("3回失敗したら内容を退避してから SaveFailedError を投げる", async () => {
    const dir = new FakeDirectory();
    dir.failWrites(3);
    const quarantine = new FakeQuarantine();
    const store = new LocalFolderStore(dir, { quarantine, sleep: noSleep });

    await expect(store.write("a.md", MD, null)).rejects.toBeInstanceOf(SaveFailedError);
    expect(quarantine.saved).toEqual([{ id: "a.md", md: MD, reason: "書き込みに失敗" }]);
    // 書きかけの内容がファイルとして残っていないこと
    expect(dir.entries.has("a.md")).toBe(false);
  });

  it("権限が失効しているときは再試行せず即座に退避する", async () => {
    const dir = new FakeDirectory();
    dir.permission = "prompt";
    // 3回分の失敗を仕込み、1つも消費されない＝再試行していないことを見る
    dir.failWrites(3);
    const quarantine = new FakeQuarantine();
    const store = new LocalFolderStore(dir, { quarantine, sleep: noSleep });

    await expect(store.write("a.md", MD, null)).rejects.toBeInstanceOf(SaveFailedError);
    expect(quarantine.saved).toHaveLength(1);
    expect(quarantine.saved[0]?.md).toBe(MD);
    expect(dir.writeFailures).toHaveLength(3);
  });

  it("退避そのものが失敗しても保存失敗を握りつぶさない", async () => {
    const dir = new FakeDirectory();
    dir.failWrites(3);
    const store = new LocalFolderStore(dir, {
      quarantine: { put: () => Promise.reject(domError("QuotaExceededError")) },
      sleep: noSleep,
    });

    await expect(store.write("a.md", MD, null)).rejects.toBeInstanceOf(SaveFailedError);
  });

  it("保存に失敗した後は記憶を捨て、実ファイルを読み直す", async () => {
    const dir = new FakeDirectory();
    const store = newStore(dir);
    const version = await store.write("a.md", MD, null);

    dir.failWrites(3);
    await expect(store.write("a.md", "# 失敗\n", version)).rejects.toBeInstanceOf(SaveFailedError);

    // 失敗した内容が記憶に残って「保存済み」に見えてはいけない
    await expect(store.read("a.md")).resolves.toEqual({ md: MD, version });
  });
});

describe("外部変更の監視", () => {
  /**
   * 監視は一定周期の見回りで成り立っている。
   * 実時間で待つと、機械が混んでいるときに見回りが間に合わず稀に落ちる。
   * 偽タイマーで周期を明示的に進め、実行のたびに同じ結果になるようにする。
   */
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const INTERVAL = 5;

  function watchable(dir: FakeDirectory): LocalFolderStore {
    return new LocalFolderStore(dir, {
      quarantine: new FakeQuarantine(),
      sleep: noSleep,
      watchIntervalMs: INTERVAL,
    });
  }

  /** 見回りを1回分進め、その中の非同期処理が終わるまで待つ */
  const tick = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(INTERVAL);
  };

  it("外部で書き換えられたら通知する", async () => {
    const dir = new FakeDirectory();
    dir.putRaw("a.md", MD);
    const changed: string[] = [];
    const stop = watchable(dir).watch((id) => changed.push(id));

    await tick();
    expect(changed).toEqual([]); // 初回は現状を記憶するだけ

    dir.putRaw("a.md", `${MD}- 追記\n`);
    await tick();
    stop();

    expect(changed).toEqual(["a.md"]);
  });

  it("自分の保存では通知しない", async () => {
    const dir = new FakeDirectory();
    const store = watchable(dir);
    const changed: string[] = [];
    const stop = store.watch((id) => changed.push(id));

    await tick();
    await store.write("a.md", MD, null);
    await tick();
    stop();

    expect(changed).toEqual([]);
  });

  it("外部での追加と削除を通知する", async () => {
    const dir = new FakeDirectory();
    dir.putRaw("a.md", MD);
    const changed: string[] = [];
    const stop = watchable(dir).watch((id) => changed.push(id));

    await tick();
    dir.putRaw("b.md", MD);
    await tick();
    dir.deleteRaw("a.md");
    await tick();
    stop();

    expect(changed).toEqual(["b.md", "a.md"]);
  });

  it("停止したら通知しなくなる", async () => {
    const dir = new FakeDirectory();
    dir.putRaw("a.md", MD);
    const changed: string[] = [];
    const stop = watchable(dir).watch((id) => changed.push(id));

    await tick();
    stop();
    dir.putRaw("a.md", "# 変更\n");
    await tick();

    expect(changed).toEqual([]);
  });
});
describe("contentHash", () => {
  it("同じ入力からは同じ値を返す", () => {
    expect(contentHash("# あ\n")).toBe(contentHash("# あ\n"));
  });

  it("1文字違えば値が変わる", () => {
    expect(contentHash("# あ\n")).not.toBe(contentHash("# い\n"));
  });

  it("長さだけが違う入力を区別する", () => {
    expect(contentHash("a")).not.toBe(contentHash("aa"));
  });

  it("16桁の16進文字列を返す", () => {
    expect(contentHash("任意")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("ブラウザ由来の例外の扱い", () => {
  it("「見つからない」以外の例外は握りつぶさず投げ直す", async () => {
    const dir = new FakeDirectory();
    dir.putRaw("a.md", MD);
    const store = newStore(dir);
    const failure = domError("InvalidStateError", "ハンドルが無効です");
    vi.spyOn(dir, "getFileHandle").mockRejectedValue(failure);

    await expect(store.read("a.md")).rejects.toBe(failure);
  });

  it("削除の直前に消えていたら MapNotFoundError にする", async () => {
    const dir = new FakeDirectory();
    dir.putRaw("a.md", MD);
    const store = newStore(dir);
    // 存在確認の後、removeEntry の直前に外部から消された状況
    vi.spyOn(dir, "removeEntry").mockRejectedValue(domError("NotFoundError", "a.md"));

    await expect(store.remove("a.md")).rejects.toBeInstanceOf(MapNotFoundError);
  });

  it("削除で「見つからない」以外の例外はそのまま投げる", async () => {
    const dir = new FakeDirectory();
    dir.putRaw("a.md", MD);
    const store = newStore(dir);
    const failure = domError("NoModificationAllowedError", "他のプロセスが掴んでいます");
    vi.spyOn(dir, "removeEntry").mockRejectedValue(failure);

    await expect(store.remove("a.md")).rejects.toBe(failure);
  });

  it("保存直後にファイルが消えていても、保存自体は成功として扱う", async () => {
    const dir = new FakeDirectory();
    const store = newStore(dir);
    const original = dir.getFileHandle.bind(dir);
    let writes = 0;
    vi.spyOn(dir, "getFileHandle").mockImplementation((name, options) => {
      // 書き込み用の取得の後、確認のための取得だけを失敗させる
      if (options?.create === true) writes += 1;
      if (writes > 0 && options?.create !== true) {
        return Promise.reject(domError("NotFoundError", name));
      }
      return original(name, options);
    });

    await expect(store.write("a.md", MD, null)).resolves.toBe(contentHash(MD));
  });
});
