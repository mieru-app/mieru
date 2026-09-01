import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DirectoryHandleLike } from "../../store/fsa.js";
import { FakeDirectory } from "../../store/__tests__/fake-fs.js";
import { useEditor } from "../editor.js";
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
    folder: { kind: "loading" },
    maps: [],
    error: null,
    externallyChanged: false,
    quarantined: [],
  });
  return dir;
}

beforeEach(reset);

describe("起動時のフォルダ復帰", () => {
  it("非対応ブラウザだと分かる", async () => {
    stub.supported = false;
    await useWorkspace.getState().init();
    expect(useWorkspace.getState().folder).toEqual({ kind: "unsupported" });
  });

  it("フォルダ未選択なら選択を促す", async () => {
    await useWorkspace.getState().init();
    expect(useWorkspace.getState().folder).toEqual({ kind: "none" });
  });

  it("前回のフォルダがあれば黙って復帰する", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);
    stub.stored = dir;

    await useWorkspace.getState().init();

    expect(useWorkspace.getState().folder).toEqual({ kind: "ready", folderName: "作業用" });
    expect(useWorkspace.getState().maps.map((meta) => meta.title)).toEqual(["既存のマップ"]);
  });

  it("権限が切れていたら再許可を促す。起動時に勝手に要求しない", async () => {
    const dir = reset();
    stub.stored = dir;
    stub.permission = "prompt";

    await useWorkspace.getState().init();

    expect(useWorkspace.getState().folder).toEqual({
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

    expect(useWorkspace.getState().folder).toEqual({ kind: "ready", folderName: "作業用" });
  });

  it("再許可を断られたら理由を残す", async () => {
    const dir = reset();
    stub.stored = dir;
    stub.permission = "prompt";
    stub.afterRequest = "denied";

    await useWorkspace.getState().init();
    await useWorkspace.getState().grantPermission();

    expect(useWorkspace.getState().folder.kind).toBe("needsPermission");
    expect(useWorkspace.getState().error).toContain("許可されませんでした");
  });
});

describe("フォルダの選択", () => {
  it("選ぶと一覧が読める", async () => {
    const dir = reset();
    dir.putRaw("既存のマップ.md", MD);

    await useWorkspace.getState().chooseFolder();

    expect(useWorkspace.getState().folder).toEqual({ kind: "ready", folderName: "作業用" });
    expect(useWorkspace.getState().maps).toHaveLength(1);
  });

  it("ダイアログを閉じただけなら何も変わらない", async () => {
    reset();
    stub.picked = null;
    await useWorkspace.getState().chooseFolder();
    expect(useWorkspace.getState().folder.kind).toBe("loading");
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
});

describe("失敗しても状態として残す", () => {
  it("フォルダが失われていたら選択画面へ戻す", async () => {
    reset();
    await useWorkspace.getState().chooseFolder();
    stub.stored = null;

    await useWorkspace.getState().grantPermission();
    expect(useWorkspace.getState().folder).toEqual({ kind: "none" });
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
