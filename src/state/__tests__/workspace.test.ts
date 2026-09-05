import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DirectoryHandleLike } from "../../store/fsa.js";
import { clearBackend, loadBackend } from "../../store/backend-preference.js";
import { clearCredential, loadCredential } from "../../store/github-auth.js";
import type { GitHubRequestInit } from "../../store/github-auth.js";
import { FakeDirectory } from "../../store/__tests__/fake-fs.js";
import { IdbHistoryStore } from "../../store/IdbHistoryStore.js";
import { idbDelete, STORE_HISTORY } from "../../store/idb.js";
import { FakeGitHub } from "../../store/__tests__/fake-github.js";
import { useEditor } from "../editor.js";
import { useLanguage } from "../i18n.js";
import { useWorkspace } from "../workspace.js";

/**
 * 作業フォルダの状態遷移の検証。
 *
 * 「フォルダを選ぶ → 開く → 編集する → 保存される」という一連が
 * 途中で切れていないことを確かめる。ここが切れると、
 * 画面上は動いているのにファイルへ何も書かれない、という最悪の状態になる。
 */

const stub = vi.hoisted(() => ({
  supported: true,
  stored: null as DirectoryHandleLike | null,
  picked: null as DirectoryHandleLike | null,
  permission: "granted",
  afterRequest: "granted",
}));

vi.mock("../../store/directory-handle.js", () => ({
  isFileSystemAccessSupported: () => stub.supported,
  loadDirectoryHandle: () => Promise.resolve(stub.stored),
  pickDirectory: () => Promise.resolve(stub.picked),
  saveDirectoryHandle: (handle: DirectoryHandleLike) => {
    stub.stored = handle;
    return Promise.resolve();
  },
  clearDirectoryHandle: () => {
    stub.stored = null;
    return Promise.resolve();
  },
  ensurePermission: (_handle: DirectoryHandleLike, interactive: boolean) =>
    Promise.resolve(interactive ? stub.afterRequest : stub.permission),
}));

const MD = `---
title: 既存のマップ
created: 2026-09-01T00:00:00Z
updated: 2026-09-01T00:00:00Z
---

# 既存のマップ

- 枝
`;

function reset(): FakeDirectory {
  const dir = new FakeDirectory("作業用");
  stub.supported = true;
  stub.stored = null;
  stub.picked = dir;
  stub.permission = "granted";
  stub.afterRequest = "granted";
  useEditor.getState().close();
  useWorkspace.setState({
    backend: { kind: "loading" },
    github: null,
    localAvailable: false,
    maps: [],
    error: null,
    externallyChanged: false,
    quarantined: [],
    indexes: [],
  });
  return dir;
}

beforeEach(() => {
  /*
   * **エラー文の言語を固定する。** 既定は英語だが、ここで確かめたいのは
   * 「失敗を状態として残すこと」であって字面ではない。
   * 言語を固定しないと、既定を変えるたびにこの一式が落ちる。
   * 文言表そのものの完全性は `i18n.test.ts` が見ている
   */
  useLanguage.getState().setLanguage("ja");
  return reset();
});

describe("起動時のフォルダ復帰", () => {
  it("File System Access API が無くても行き止まりにしない", async () => {
    // Phase 2.6 以降、フォルダが使えないことは「使えない」を意味しない。
    // GitHub を選ぶ道が残っている（設計書 8.7）
    stub.supported = false;
    await useWorkspace.getState().init();
    expect(useWorkspace.getState().backend).toEqual({ kind: "none", localAvailable: false });
  });

  it("フォルダ未選択なら選択を促す", async () => {
    await useWorkspace.getState().init();
    expect(useWorkspace.getState().backend).toEqual({ kind: "none", localAvailable: true });
  });

  it("前回のフォルダがあれば黙って復帰する", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    stub.stored = dir;

    await useWorkspace.getState().init();

    expect(useWorkspace.getState().backend).toEqual({
      kind: "ready",
      backend: "local",
      label: "作業用",
    });
    expect(useWorkspace.getState().maps.map((meta) => meta.title)).toEqual(["既存のマップ"]);
  });

  it("権限が切れていたら再許可を促す。起動時に勝手に要求しない", async () => {
    const dir = reset();
    stub.stored = dir;
    stub.permission = "prompt";

    await useWorkspace.getState().init();

    expect(useWorkspace.getState().backend).toEqual({
      kind: "needsPermission",
      folderName: "作業用",
    });
  });

  it("利用者の操作で再許可すれば使えるようになる", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    stub.stored = dir;
    stub.permission = "prompt";

    await useWorkspace.getState().init();
    await useWorkspace.getState().grantPermission();

    expect(useWorkspace.getState().backend).toEqual({
      kind: "ready",
      backend: "local",
      label: "作業用",
    });
  });

  it("再許可を断られたら理由を残す", async () => {
    const dir = reset();
    stub.stored = dir;
    stub.permission = "prompt";
    stub.afterRequest = "denied";

    await useWorkspace.getState().init();
    await useWorkspace.getState().grantPermission();

    expect(useWorkspace.getState().backend.kind).toBe("needsPermission");
    expect(useWorkspace.getState().error).toContain("許可されませんでした");
  });
});

describe("フォルダの選択", () => {
  it("選ぶと一覧が読める", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);

    await useWorkspace.getState().chooseFolder();

    expect(useWorkspace.getState().backend).toEqual({
      kind: "ready",
      backend: "local",
      label: "作業用",
    });
    expect(useWorkspace.getState().maps).toHaveLength(1);
  });

  it("ダイアログを閉じただけなら何も変わらない", async () => {
    reset();
    stub.picked = null;
    await useWorkspace.getState().chooseFolder();
    expect(useWorkspace.getState().backend.kind).toBe("loading");
  });
});

describe("マップの作成と読み書き", () => {
  it("作成すると md ファイルができ、そのまま開かれる", async () => {
    const dir = reset();
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().createMap("新規事業の論点整理");

    expect([...dir.entries.keys()]).toEqual(["新規事業の論点整理.md"]);
    expect(useEditor.getState().map?.id).toBe("新規事業の論点整理.md");
    expect(useEditor.getState().root?.label).toBe("新規事業の論点整理");
    expect(dir.entries.get("新規事業の論点整理.md")?.content).toContain("# 新規事業の論点整理");
  });

  it("下敷きの Markdown から作れる。表題は利用者が入れたものに揃う", async () => {
    const dir = reset();
    await useWorkspace.getState().chooseFolder();

    await useWorkspace.getState().createMap("今週の振返り", "# ひな形\n\n- 良かったこと\n- 課題\n");

    const content = dir.entries.get("今週の振返り.md")?.content ?? "";
    expect(content).toContain("title: 今週の振返り");
    expect(content).toContain("# 今週の振返り");
    expect(content).toContain("- 良かったこと");
    expect(content).not.toContain("ひな形");
  });

  it("同じ表題でも上書きせず別ファイルにする", async () => {
    const dir = reset();
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().createMap("メモ");
    await useWorkspace.getState().createMap("メモ");

    expect([...dir.entries.keys()].sort()).toEqual(["メモ 2.md", "メモ.md"]);
  });

  it("開いたマップを編集すると、そのままファイルへ書かれる", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("書き換えた枝");
    await useWorkspace.getState().saveNow();

    expect(dir.entries.get("既存のマップ.md")?.content).toContain("- 書き換えた枝");
    expect(useEditor.getState().status.kind).toBe("saved");
  });

  it("マップを切り替える前に書きかけを保存する", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("切り替え前の入力");
    await useWorkspace.getState().createMap("別のマップ");

    // 切り替えで失われていないこと
    expect(dir.entries.get("既存のマップ.md")?.content).toContain("- 切り替え前の入力");
  });

  it("開けないマップは理由を残す", async () => {
    reset();
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("無い.md");
    expect(useWorkspace.getState().error).toContain("開けませんでした");
  });
});

describe("マップの改名（F-03）", () => {
  it("表題・H1・ファイル名を同時に変える", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();

    await useWorkspace.getState().renameMap("既存のマップ.md", "改名した名前");

    expect([...dir.entries.keys()]).toEqual(["改名した名前.md"]);
    const content = dir.entries.get("改名した名前.md")?.content ?? "";
    expect(content).toContain("title: 改名した名前");
    expect(content).toContain("# 改名した名前");
    // 中身は失われていない
    expect(content).toContain("- 枝");
  });

  it("開いているマップを改名すると、新しいファイルを開いたままになる", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    await useWorkspace.getState().renameMap("既存のマップ.md", "改名した名前");

    expect(useEditor.getState().map?.id).toBe("改名した名前.md");
    expect(useEditor.getState().root?.label).toBe("改名した名前");
  });

  it("書きかけを確定させてから改名する", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("改名前に入れた枝");
    await useWorkspace.getState().renameMap("既存のマップ.md", "改名した名前");

    expect(dir.entries.get("改名した名前.md")?.content).toContain("- 改名前に入れた枝");
  });

  it("既にある名前とは重ならない", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    dir.putRaw("読書メモ.md", MD.replace(/既存のマップ/g, "読書メモ"));
    await useWorkspace.getState().chooseFolder();

    await useWorkspace.getState().renameMap("既存のマップ.md", "読書メモ");

    expect([...dir.entries.keys()].sort()).toEqual(["読書メモ 2.md", "読書メモ.md"]);
  });

  it("ファイル名が変わらない改名でも中身は更新される", async () => {
    const dir = reset();
    // ファイル名に使えない文字は同じ字へ畳まれるため、基底部分が変わらない
    dir.putRaw("問いの整理.md", MD.replace(/既存のマップ/g, "問いの整理"));
    await useWorkspace.getState().chooseFolder();

    await useWorkspace.getState().renameMap("問いの整理.md", "問いの整理");

    expect([...dir.entries.keys()]).toEqual(["問いの整理.md"]);
    expect(dir.entries.get("問いの整理.md")?.content).toContain("# 問いの整理");
  });

  it("空の表題は受け付けない", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();

    await useWorkspace.getState().renameMap("既存のマップ.md", "   ");

    expect([...dir.entries.keys()]).toEqual(["既存のマップ.md"]);
  });

  it("失敗したら理由を残し、元のファイルは残す", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    dir.failWrites(3);

    await useWorkspace.getState().renameMap("既存のマップ.md", "改名した名前");

    expect(useWorkspace.getState().error).toContain("名前を変えられませんでした");
    expect([...dir.entries.keys()]).toEqual(["既存のマップ.md"]);
  });
});

describe("ホームへ戻る（F-38）", () => {
  it("閉じる前に書き終える。待ち時間中の編集を捨てない", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    // 自動保存の 800ms を待たずに閉じる、という最短の操作を再現する
    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("閉じる直前の入力");
    await useWorkspace.getState().closeMap();

    expect(dir.entries.get("既存のマップ.md")?.content).toContain("- 閉じる直前の入力");
    expect(useEditor.getState().map).toBeNull();
    expect(useEditor.getState().status.kind).toBe("empty");
  });

  it("開いていなければ何もしない", async () => {
    reset();
    await useWorkspace.getState().chooseFolder();

    await useWorkspace.getState().closeMap();

    expect(useEditor.getState().map).toBeNull();
  });
});

describe("マップの削除（F-02）", () => {
  it("ファイルごと消え、一覧から外れる", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();

    await useWorkspace.getState().deleteMap("既存のマップ.md");

    expect([...dir.entries.keys()]).toEqual([]);
    expect(useWorkspace.getState().maps).toEqual([]);
  });

  it("開いているマップを消したら閉じる。書き戻さない", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("消す直前の入力");
    await useWorkspace.getState().deleteMap("既存のマップ.md");

    expect([...dir.entries.keys()]).toEqual([]);
    expect(useEditor.getState().map).toBeNull();
    expect(useEditor.getState().status.kind).toBe("empty");
  });

  it("別のマップを消しても、開いているマップはそのまま", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    dir.putRaw("消す方.md", MD.replace(/既存のマップ/g, "消す方"));
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    await useWorkspace.getState().deleteMap("消す方.md");

    expect(useEditor.getState().map?.id).toBe("既存のマップ.md");
    expect([...dir.entries.keys()]).toEqual(["既存のマップ.md"]);
  });

  it("無いマップを消そうとしたら理由を残す", async () => {
    reset();
    await useWorkspace.getState().chooseFolder();

    await useWorkspace.getState().deleteMap("無い.md");

    expect(useWorkspace.getState().error).toContain("削除できませんでした");
  });
});

describe("検索の索引", () => {
  it("一覧を読むたびに索引が付いてくる", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();

    const [index] = useWorkspace.getState().indexes;
    expect(index?.id).toBe("既存のマップ.md");
    expect(index?.entries.some((entry) => entry.text === "枝")).toBe(true);
  });

  it("削除したマップは索引からも消える", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().deleteMap("既存のマップ.md");

    expect(useWorkspace.getState().indexes).toEqual([]);
  });
});

describe("外部変更と競合", () => {
  it("外部の変更を読み込み直せる", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    dir.putRaw("既存のマップ.md", MD.replace("- 枝", "- 外部で書き換えた枝"));
    useWorkspace.setState({ externallyChanged: true });
    await useWorkspace.getState().reloadOpen();

    expect(useEditor.getState().root?.children[0]?.label).toBe("外部で書き換えた枝");
    expect(useWorkspace.getState().externallyChanged).toBe(false);
  });

  it("競合したら自動保存を止め、内容を保持する", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    // 別のアプリが先に書き換えた状況
    dir.putRaw("既存のマップ.md", MD.replace("- 枝", "- 外部の変更"));
    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("こちらの変更");
    await useWorkspace.getState().saveNow();

    expect(useEditor.getState().status.kind).toBe("conflict");
    // 外部の内容が残り、こちらの入力もモデル上に残っていること
    expect(dir.entries.get("既存のマップ.md")?.content).toContain("- 外部の変更");
    expect(useEditor.getState().root?.children[0]?.label).toBe("こちらの変更");
  });

  it("利用者が選べば、こちらの内容で上書きできる", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    dir.putRaw("既存のマップ.md", MD.replace("- 枝", "- 外部の変更"));
    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("こちらの変更");
    await useWorkspace.getState().saveNow();

    await useWorkspace.getState().overwriteWithMine();

    expect(useEditor.getState().status.kind).toBe("saved");
    expect(dir.entries.get("既存のマップ.md")?.content).toContain("- こちらの変更");
  });

  it("競合していないときの上書き要求は無視する", async () => {
    reset();
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().createMap("メモ");
    await useWorkspace.getState().overwriteWithMine();
    expect(useEditor.getState().status.kind).toBe("saved");
  });
});

describe("退避した内容の扱い", () => {
  it("退避を復元すると編集中の状態に戻り、未保存として扱う", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");

    const entry = {
      key: 1,
      id: "既存のマップ.md",
      md: MD.replace("- 枝", "- 保存できなかった入力"),
      at: new Date().toISOString(),
      reason: "権限がありません",
    };
    useWorkspace.setState({ quarantined: [entry] });

    await useWorkspace.getState().restoreQuarantined(entry);

    expect(useEditor.getState().root?.children[0]?.label).toBe("保存できなかった入力");
    expect(useEditor.getState().status.kind).toBe("dirty");
    // 復元済みの退避は一覧から消える
    expect(useWorkspace.getState().quarantined).toEqual([]);
  });

  it("退避を破棄できる", async () => {
    reset();
    const entry = {
      key: 2,
      id: "a.md",
      md: "# 破棄する\n",
      at: new Date().toISOString(),
      reason: "理由",
    };
    useWorkspace.setState({ quarantined: [entry] });

    await useWorkspace.getState().discardQuarantined(entry);
    expect(useWorkspace.getState().quarantined).toEqual([]);
  });
});

describe("フォルダ未選択のときは何もしない", () => {
  it("一覧・作成・保存が例外にならない", async () => {
    reset();
    await expect(useWorkspace.getState().refresh()).resolves.toBeUndefined();
    await expect(useWorkspace.getState().createMap("メモ")).resolves.toBeUndefined();
    await expect(useWorkspace.getState().openMap("a.md")).resolves.toBeUndefined();
    await expect(useWorkspace.getState().reloadOpen()).resolves.toBeUndefined();
    await expect(useWorkspace.getState().saveNow()).resolves.toBeUndefined();
  });

  it("改名・削除も例外にならない", async () => {
    reset();
    await expect(useWorkspace.getState().renameMap("a.md", "別名")).resolves.toBeUndefined();
    await expect(useWorkspace.getState().deleteMap("a.md")).resolves.toBeUndefined();
  });
});

describe("失敗しても状態として残す", () => {
  it("フォルダが失われていたら選択画面へ戻す", async () => {
    reset();
    await useWorkspace.getState().chooseFolder();
    stub.stored = null;

    await useWorkspace.getState().grantPermission();
    expect(useWorkspace.getState().backend).toEqual({ kind: "none", localAvailable: true });
  });

  it("一覧の読み込みに失敗したら理由を残す", async () => {
    const dir = reset();
    await useWorkspace.getState().chooseFolder();
    vi.spyOn(dir, "values").mockImplementation(() => {
      throw new Error("読めません");
    });

    await useWorkspace.getState().refresh();
    expect(useWorkspace.getState().error).toContain("マップ一覧を読めませんでした");
  });

  it("作成に失敗したら理由を残す", async () => {
    const dir = reset();
    await useWorkspace.getState().chooseFolder();
    dir.failWrites(3);

    await useWorkspace.getState().createMap("作れないマップ");
    expect(useWorkspace.getState().error).toContain("マップを作成できませんでした");
  });
});

describe("保存先を GitHub にする（2.6-4）", () => {
  /**
   * 接続の判断は state 層にある。**トークンを保管する前に到達確認を通すこと**、
   * **記憶しない選択が本当に残さないこと**が守れているかを確かめる。
   */
  function githubFetch(api: FakeGitHub, repoStatus = 200): typeof fetch {
    const impl = (url: string, init: GitHubRequestInit): Promise<unknown> => {
      // verifyCredential の到達確認は /contents を含まない
      if (!url.includes("/contents")) {
        return Promise.resolve({
          status: repoStatus,
          headers: { get: () => null },
          json: () =>
            Promise.resolve({ default_branch: "main", private: true, permissions: { push: true } }),
        });
      }
      return api.fetchImpl(url, init);
    };
    return impl as unknown as typeof fetch;
  }

  const INPUT = {
    token: "github_pat_11ABCDEFG0123456789abc",
    repo: "kyritk/mieru-maps",
    branch: "",
    directory: "maps",
  };

  beforeEach(async () => {
    await clearCredential();
    await clearBackend();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("接続すると保存先が GitHub になる", async () => {
    const api = new FakeGitHub();
    api.files.set("maps/既存のマップ.md", MD);
    vi.stubGlobal("fetch", githubFetch(api));

    await expect(useWorkspace.getState().connectGitHub(INPUT, true)).resolves.toEqual({ ok: true });

    expect(useWorkspace.getState().backend).toEqual({
      kind: "ready",
      backend: "github",
      label: "kyritk/mieru-maps (既定ブランチ) /maps",
    });
    expect(useWorkspace.getState().maps.map((meta) => meta.title)).toEqual(["既存のマップ"]);
  });

  it("入力の不備はどの欄かと共に返し、保存先を変えない", async () => {
    const result = await useWorkspace.getState().connectGitHub({ ...INPUT, repo: "mieru" }, true);
    expect(result).toMatchObject({ ok: false, field: "repo" });
    expect(useWorkspace.getState().backend.kind).toBe("loading");
    await expect(loadCredential()).resolves.toBeNull();
  });

  it("届かないトークンは保管しない", async () => {
    // 保管してしまうと、次の起動が「保存できない状態」から始まる
    vi.stubGlobal("fetch", githubFetch(new FakeGitHub(), 401));

    const result = await useWorkspace.getState().connectGitHub(INPUT, true);
    expect(result).toMatchObject({ ok: false });
    await expect(loadCredential()).resolves.toBeNull();
    expect(useWorkspace.getState().backend.kind).toBe("loading");
  });

  it("記憶しない選択なら、その場では使えてもトークンを残さない", async () => {
    vi.stubGlobal("fetch", githubFetch(new FakeGitHub()));

    await useWorkspace.getState().connectGitHub(INPUT, false);

    expect(useWorkspace.getState().backend.kind).toBe("ready");
    await expect(loadCredential()).resolves.toBeNull();
    await expect(loadBackend()).resolves.toBeNull();
  });

  it("記憶した接続は次の起動で復帰する", async () => {
    const api = new FakeGitHub();
    api.files.set("maps/既存のマップ.md", MD);
    vi.stubGlobal("fetch", githubFetch(api));
    await useWorkspace.getState().connectGitHub(INPUT, true);

    // 起動し直しの再現
    useWorkspace.setState({ backend: { kind: "loading" }, maps: [] });
    await useWorkspace.getState().init();

    expect(useWorkspace.getState().backend).toMatchObject({ kind: "ready", backend: "github" });
    expect(useWorkspace.getState().maps).toHaveLength(1);
  });

  it("解除するとトークンが消え、フォルダ運用に戻る", async () => {
    const dir = reset();
    stub.stored = dir;
    vi.stubGlobal("fetch", githubFetch(new FakeGitHub()));
    await useWorkspace.getState().connectGitHub(INPUT, true);

    await useWorkspace.getState().disconnectGitHub();

    await expect(loadCredential()).resolves.toBeNull();
    expect(useWorkspace.getState().github).toBeNull();
    expect(useWorkspace.getState().backend).toMatchObject({ kind: "ready", backend: "local" });
  });

  it("ローカルへ切り替えても接続情報は残る", async () => {
    // 切り替えのたびにトークンを入れ直させないため（設計書 8.7 / backend-preference）
    const dir = reset();
    stub.stored = dir;
    vi.stubGlobal("fetch", githubFetch(new FakeGitHub()));
    await useWorkspace.getState().connectGitHub(INPUT, true);

    await useWorkspace.getState().useLocalFolder();
    expect(useWorkspace.getState().backend).toMatchObject({ kind: "ready", backend: "local" });
    await expect(loadCredential()).resolves.not.toBeNull();

    await useWorkspace.getState().useGitHub();
    expect(useWorkspace.getState().backend).toMatchObject({ kind: "ready", backend: "github" });
  });
});

describe("履歴（Phase 2.8）", () => {
  /**
   * DoD の「誤って消した枝を、履歴から取り戻せる」を、保存から復元まで通しで確かめる。
   *
   * **ローカルフォルダ保存先には履歴の実体が無い。** File System Access API は
   * 上書きするだけで前の内容がどこにも残らないため、ここが切れていると
   * 消した枝を取り戻す手段が Undo しか無く、それはアプリを閉じた時点で消える。
   */
  async function openWithHistory(): Promise<FakeDirectory> {
    /*
     * **時計を止めるのは `AutoSave` を組み立てる前でなければならない。**
     * `AutoSave` は構築時に `Date.now` の参照を持つため、後から
     * `useFakeTimers` を呼んでも差し替わらず、控える時刻が実時刻のままになる。
     * すると2回の保存が同じ窓に入り、まとめられて1つの版になる。
     */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-04T00:00:00Z"));

    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    await idbDelete(STORE_HISTORY, "既存のマップ.md");
    await useWorkspace.getState().chooseFolder();
    await useWorkspace.getState().openMap("既存のマップ.md");
    return dir;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("保存した内容が版として残り、消した枝を取り戻せる", async () => {
    await openWithHistory();
    const branch = useEditor.getState().root?.children[0]?.uid ?? "";
    useEditor.getState().select(branch);
    useEditor.getState().rename("大事な枝");
    useEditor.getState().endEdit();
    await useWorkspace.getState().saveNow();

    // 5分の窓を跨がせる。跨がないと1つの版にまとめられる（history-policy）
    vi.setSystemTime(new Date("2026-09-04T00:06:00Z"));
    useEditor.getState().select(branch);
    useEditor.getState().remove();
    await useWorkspace.getState().saveNow();
    expect(useEditor.getState().root?.children).toHaveLength(0);

    const entries = await useWorkspace.getState().listHistory();
    expect(entries).toHaveLength(2);

    // 新しい順に並ぶので、消す前の版は後ろにある
    const before = entries[1]?.id ?? "";
    await useWorkspace.getState().restoreVersion(before);
    expect(useEditor.getState().root?.children[0]?.label).toBe("大事な枝");
  });

  it("復元は Undo で取り消せる。保存先へは直接書き戻さない", async () => {
    const dir = await openWithHistory();
    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("大事な枝");
    useEditor.getState().endEdit();
    await useWorkspace.getState().saveNow();

    vi.setSystemTime(new Date("2026-09-04T00:06:00Z"));
    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().remove();
    await useWorkspace.getState().saveNow();

    const wasWritten = dir.entries.get("既存のマップ.md")?.content ?? "";
    const entries = await useWorkspace.getState().listHistory();
    await useWorkspace.getState().restoreVersion(entries[1]?.id ?? "");

    // ファイルはまだ書き換わっていない。書き戻すと取り消す手段が無くなる
    expect(dir.entries.get("既存のマップ.md")?.content).toBe(wasWritten);

    useEditor.getState().undo();
    expect(useEditor.getState().root?.children).toHaveLength(0);
  });

  it("内容が変わらない保存では版を増やさない", async () => {
    await openWithHistory();
    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("大事な枝");
    useEditor.getState().endEdit();
    await useWorkspace.getState().saveNow();

    // 折り畳んで戻すだけでも保存は走る。同じ内容の版が並ぶと一覧が読めなくなる
    vi.setSystemTime(new Date("2026-09-04T01:00:00Z"));
    useEditor.getState().toggleCollapse();
    useEditor.getState().toggleCollapse();
    await useWorkspace.getState().saveNow();

    expect(await useWorkspace.getState().listHistory()).toHaveLength(1);
  });

  it("マップを消したら履歴も消える", async () => {
    await openWithHistory();
    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("大事な枝");
    useEditor.getState().endEdit();
    await useWorkspace.getState().saveNow();

    await useWorkspace.getState().deleteMap("既存のマップ.md");

    // 残すと、削除したはずの内容が端末に残り続ける
    expect(await new IdbHistoryStore().list("既存のマップ.md")).toEqual([]);
  });

  it("改名しても過去の版へ辿り着ける", async () => {
    await openWithHistory();
    await idbDelete(STORE_HISTORY, "新しい名前.md");
    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("大事な枝");
    useEditor.getState().endEdit();
    await useWorkspace.getState().saveNow();

    await useWorkspace.getState().renameMap("既存のマップ.md", "新しい名前");

    expect(useEditor.getState().map?.id).toBe("新しい名前.md");
    expect(await useWorkspace.getState().listHistory()).toHaveLength(1);
  });

  it("GitHub 保存先ではコミットが版になる（2.8-5）", async () => {
    // 保存1回がコミット1つなので、控える先が保存先の側にある。
    // IndexedDB にも積むと二重に持ったうえ片方だけが古くなる
    reset();
    await clearCredential();
    await clearBackend();
    const api = new FakeGitHub();
    api.files.set("maps/既存のマップ.md", MD);
    vi.stubGlobal("fetch", (url: string, init: GitHubRequestInit) => {
      // 到達確認だけがリポジトリそのものを見る。内容とコミットは偽の API へ回す
      if (!url.includes("/contents") && !url.includes("/commits")) {
        return Promise.resolve({
          status: 200,
          headers: { get: () => null },
          json: () =>
            Promise.resolve({ default_branch: "main", private: true, permissions: { push: true } }),
        });
      }
      return api.fetchImpl(url, init);
    });

    await useWorkspace.getState().connectGitHub(
      {
        token: "github_pat_11ABCDEFG0123456789abc",
        repo: "kyritk/mieru-maps",
        branch: "",
        directory: "maps",
      },
      true,
    );
    await useWorkspace.getState().openMap("既存のマップ.md");

    // 置いただけのファイルにはコミットが無い。「使えない」ではなく「まだ無い」
    expect(await useWorkspace.getState().listHistory()).toEqual([]);
    expect(useWorkspace.getState().historyAvailable).toBe(true);

    useEditor.getState().select(useEditor.getState().root?.children[0]?.uid ?? "");
    useEditor.getState().rename("大事な枝");
    useEditor.getState().endEdit();
    await useWorkspace.getState().saveNow();

    const entries = await useWorkspace.getState().listHistory();
    expect(entries).toHaveLength(1);
    // 大きさは返らない。出すには版ごとに本文を取りに行くことになる（設計書 8.7.8）
    expect(entries[0]?.size).toBeUndefined();

    const restored = await useWorkspace.getState().readVersion(entries[0]?.id ?? "");
    expect(restored).toContain("大事な枝");

    vi.unstubAllGlobals();
  });
});
