import { create } from "zustand";

import { parseMarkdown } from "../core/parse.js";
import { serializeMarkdown } from "../core/serialize.js";
import type { MapMeta } from "../core/types.js";
import type { BackendKind } from "../store/backend-preference.js";
import { clearBackend, loadBackend, saveBackend } from "../store/backend-preference.js";
import {
  ensurePermission,
  isFileSystemAccessSupported,
  loadDirectoryHandle,
  pickDirectory,
  saveDirectoryHandle,
} from "../store/directory-handle.js";
import { fileNameFor } from "../store/file-name.js";
import { useLanguage } from "./i18n.js";
import type { Strings } from "./strings/ja.js";
import { copyAllMaps } from "../store/copy-maps.js";
import { MemoryStore } from "../store/MemoryStore.js";
import type { FsaPermissionState } from "../store/fsa.js";
import type { CredentialInput } from "../store/github-auth.js";
import {
  browserFetch,
  clearCredential,
  describeCredential,
  loadCredential,
  parseCredentialInput,
  saveCredential,
  verifyCredential,
} from "../store/github-auth.js";
import { GitHubHistoryStore, GitHubStore } from "../store/GitHubStore.js";
import { IdbHistoryStore } from "../store/IdbHistoryStore.js";
import { LocalFolderStore } from "../store/LocalFolderStore.js";
import type { QuarantinedEntry } from "../store/quarantine.js";
import { dropQuarantined, listQuarantined } from "../store/quarantine.js";
import type { HistoryEntry, HistoryStore, MapStore } from "../store/types.js";
import { AutoSave } from "./autosave.js";
import { useEditor } from "./editor.js";
import { collapsedPathsToUids } from "./tree.js";
import type { MapIndex } from "./search.js";
import { SearchIndex } from "./search.js";

/**
 * 作業フォルダとマップ一覧の状態。
 *
 * 永続化に触れるのはこの層までで、React 側は `MapStore` の存在を知らない（設計原則3）。
 * 自動保存と外部変更の監視の生存期間もここで管理する。
 */

/**
 * 保存先の状態。画面はこれを見て何を出すかを決める。
 *
 * **Phase 2.6 で「フォルダの状態」から「保存先の状態」へ広げた。**
 * GitHub を選べるようになったため、File System Access API が使えないことは
 * もはや「使えない」を意味しない（設計書 8.7）。
 */
/**
 * いま動いている保存先。
 *
 * **`BackendKind`（記憶する種類）とは別にする。** ゲストは決して記憶してはならず、
 * 永続化の型に混ぜると `saveBackend("guest")` が書けてしまう。
 */
export type ActiveBackend = BackendKind | "guest";

export type BackendState =
  /** 起動直後。保存先を調べている最中 */
  | { kind: "loading" }
  /**
   * 保存先が未選択。
   * `localAvailable` は File System Access API が使えるか。
   * Firefox / Safari / スマートフォンでは false になるが、GitHub は選べる
   */
  | { kind: "none"; localAvailable: boolean }
  /** 前回のフォルダはあるが、再許可が要る */
  | { kind: "needsPermission"; folderName: string }
  /** 使える状態。`label` は保存先の表示名 */
  | { kind: "ready"; backend: ActiveBackend; label: string };

/** 接続を試みた結果。失敗はどの欄の問題かまで返す */
export type GitHubConnectResult =
  { ok: true } | { ok: false; field?: "token" | "repo" | "branch" | "directory"; message: string };

export interface WorkspaceState {
  backend: BackendState;
  /** 接続済みの GitHub の表示名。**トークンは持たせない**（設計書 8.7.2） */
  github: string | null;
  /**
   * このブラウザでローカルフォルダを保存先にできるか。
   * 描画層が `src/store/` を直接呼ばないよう、ここで解決して渡す（NF-51）
   */
  localAvailable: boolean;
  maps: MapMeta[];
  /** 一覧や読み込みの失敗。保存の失敗は編集ストアの status が持つ */
  error: string | null;
  /** 開いているマップが外部で書き換えられた */
  externallyChanged: boolean;
  /** 保存できずに退避された内容。起動時に提示して書き戻しを促す */
  quarantined: QuarantinedEntry[];
  /** 全文検索とタグ絞り込みの索引。突き合わせは `queryIndex` が行う */
  indexes: MapIndex[];
  /**
   * 履歴を持つ保存先か（Phase 2.8）。
   * GitHub はコミットが履歴そのものなので、こちらでは控えない
   */
  historyAvailable: boolean;

  /** 起動時に呼ぶ。前回の保存先を復帰させる */
  init(): Promise<void>;
  /** 利用者の操作でフォルダを選ぶ */
  chooseFolder(): Promise<void>;
  /**
   * 保存先を決めずに使い始める（ゲストモード）。
   * **書いたものはメモリにしか無い。** 保存先を選んだ時点で引き取られる
   */
  startGuest(): Promise<void>;
  /**
   * GitHub へ接続する。
   * @param remember false なら記憶せず、この画面を閉じた時点で消える（共用端末向け）
   */
  connectGitHub(input: CredentialInput, remember: boolean): Promise<GitHubConnectResult>;
  /** 接続を解除し、トークンをこの端末から消す */
  disconnectGitHub(): Promise<void>;
  /** 記憶済みの GitHub 接続に切り替える */
  useGitHub(): Promise<void>;
  /** ローカルフォルダに切り替える。GitHub の接続情報は消さない */
  useLocalFolder(): Promise<void>;
  /** 「アクセスを許可」ボタン。利用者の操作が要る */
  grantPermission(): Promise<void>;
  refresh(): Promise<void>;
  openMap(id: string): Promise<void>;
  createMap(title: string, markdown?: string): Promise<void>;
  /** 表題を変える。frontmatter の title と H1 とファイル名を同時に更新する（F-03） */
  renameMap(id: string, title: string): Promise<void>;
  /** マップを削除する。確認は呼び出し側で取る */
  deleteMap(id: string): Promise<void>;
  /** 開いているマップを閉じ、ホーム（マップ未選択）の状態へ戻す */
  closeMap(): Promise<void>;
  /** 外部の変更を取り込む（未保存の変更は破棄される） */
  reloadOpen(): Promise<void>;
  /** 競合を「こちらの内容で上書き」で解決する */
  overwriteWithMine(): Promise<void>;
  /** 退避された内容を現在のマップとして開く */
  restoreQuarantined(entry: QuarantinedEntry): Promise<void>;
  discardQuarantined(entry: QuarantinedEntry): Promise<void>;
  /** 直ちに保存する（Ctrl+S、画面を離れる前） */
  saveNow(): Promise<void>;

  /**
   * 開いているマップの過去の版を新しい順に返す（Phase 2.8、F-07）。
   * 履歴を持たない保存先では空を返す
   */
  listHistory(): Promise<HistoryEntry[]>;
  /** 版の本文を読む。差分の表示に使う */
  readVersion(entryId: string): Promise<string | null>;
  /**
   * 版の中身を今の内容にする。
   *
   * **戻すのは枝とノートと折り畳みだけで、表題とタグは今のものを保つ。**
   * 表題まで戻すとファイル名（id）が変わり、復元が改名を巻き込む（F-03）。
   * Undo スタックに積むので `Ctrl+Z` で取り消せる
   */
  restoreVersion(entryId: string): Promise<void>;
}

/** 現在の保存先。UI からは触らせない（設計原則3） */
/**
 * いまの言語の文言。**呼ぶ側は React ではないのでフックが使えない。**
 * 出す瞬間に引くので、言語を切り替えた後のエラーも切り替わる
 */
function texts(): Strings {
  return useLanguage.getState().s;
}

let store: MapStore | null = null;
let autoSave: AutoSave | null = null;
/**
 * 過去の版の控え（Phase 2.8）。保存先ごとに実体が違う。
 * ローカルフォルダは IndexedDB、GitHub はコミットそのもの
 */
let history: HistoryStore | null = null;
let unwatch: (() => void) | null = null;
let searchIndex: SearchIndex | null = null;

/** テストと画面遷移のために、現在のストアを片付ける */
function teardown(): void {
  autoSave?.stop();
  autoSave = null;
  history = null;
  unwatch?.();
  unwatch = null;
  store = null;
  searchIndex = null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 新規マップの初期内容 */
function initialMarkdown(title: string, at: string): string {
  return serializeMarkdown({
    meta: { id: "", title, tags: [], created: at, updated: at, version: "" },
    root: { uid: "root", path: "", label: title, links: [], children: [] },
    view: { collapsed: [], colors: "auto" },
  });
}

/**
 * 表題を差し替えた Markdown を作る（F-03）。
 *
 * frontmatter の `title` と本文の H1 を必ず同時に変える。片方だけを書き換えると、
 * 一覧に出る名前と開いたときの中心テーマが食い違い、どちらが正しいのか
 * 利用者には判断できなくなる。
 *
 * 正規化を通すため、アプリの外で書かれた Markdown は整形され直す。
 * これは保存時に常に起きることであり、改名だけの特別な副作用ではない。
 */
export function retitle(md: string, id: string, title: string, at: string): string {
  const { doc } = parseMarkdown(md, { id });
  return serializeMarkdown({
    ...doc,
    meta: { ...doc.meta, title, updated: at },
    root: { ...doc.root, label: title },
  });
}

export const useWorkspace = create<WorkspaceState>((set, get) => {
  /** 保存先が決まった後の共通処理。監視と自動保存を開始する */
  async function attach(
    backend: ActiveBackend,
    label: string,
    historyStore: HistoryStore | null = new IdbHistoryStore(),
  ): Promise<void> {
    const current = store;
    if (current === null) return;

    /*
     * **履歴の実体は保存先で違う**（設計書 8.8）。ローカルフォルダには履歴が無く
     * （File System Access API は上書きするだけである）、IndexedDB で控える。
     * GitHub は保存1回がコミット1つなので、控える先が既にある。同じ内容を
     * IndexedDB にも積むと、二重に持ったうえに片方だけが古くなる
     */
    history = historyStore;

    autoSave = new AutoSave(current, useEditor, { history });
    autoSave.start();
    searchIndex = new SearchIndex(current);
    // 外部変更の監視は任意メソッド。GitHubStore は持たない（設計書 8.7.6）
    unwatch =
      current.watch?.((id) => {
        // 開いているマップが外部で変わったときだけ知らせる。
        // 勝手に読み直すと編集中の内容が消えるため、判断は利用者に委ねる
        if (useEditor.getState().map?.id === id) set({ externallyChanged: true });
        void get().refresh();
      }) ?? null;

    set({
      backend: { kind: "ready", backend, label },
      error: null,
      historyAvailable: history !== null,
    });
    await get().refresh();
    set({ quarantined: await listQuarantined() });
  }

  /**
   * ゲストで書いたものを、これから使う保存先へ引き取る（2.12）。
   *
   * **保存先を差し替える前に写し元を掴んでおく。** ゲストの中身はメモリにしか無く、
   * `teardown()` を通した後では読めない。
   *
   * 写す判断そのものは `copyAllMaps` にある。**この層は自動テストを持たない**ため、
   * 引き取りのように失敗が即データ消失になる処理は外へ出してある。
   */
  function guestStoreIfAny(): MapStore | null {
    const state = get().backend;
    return state.kind === "ready" && state.backend === "guest" ? store : null;
  }

  async function adoptGuestMaps(from: MapStore | null): Promise<void> {
    const target = store;
    if (from === null || target === null) return;
    try {
      await copyAllMaps(from, target);
      await get().refresh();
    } catch (error) {
      // **引き取りに失敗しても保存先の切り替えは成立している。**
      // ここで投げると、切り替わった後の画面が出ない
      set({ error: texts().error.guestAdopt(messageOf(error)) });
    }
  }

  /** GitHub のストアを組み立てて使い始める */
  async function attachGitHub(credential: Parameters<typeof describeCredential>[0]): Promise<void> {
    teardown();
    store = new GitHubStore(credential);
    await attach("github", describeCredential(credential), new GitHubHistoryStore(credential));
  }

  return {
    backend: { kind: "loading" },
    github: null,
    localAvailable: false,
    maps: [],
    error: null,
    externallyChanged: false,
    quarantined: [],
    indexes: [],
    historyAvailable: false,

    async init() {
      // GitHub を使っている間も、フォルダへ戻せるかどうかは要る（設定画面が出し分ける）
      set({ localAvailable: isFileSystemAccessSupported() });

      const credential = await loadCredential();
      set({ github: credential === null ? null : describeCredential(credential) });

      // 記憶した選択があればそれに従う。無ければローカルフォルダを試す
      if ((await loadBackend()) === "github" && credential !== null) {
        await attachGitHub(credential);
        return;
      }

      const localAvailable = get().localAvailable;
      if (!localAvailable) {
        // File System Access API が無くても、GitHub を選ぶ道が残っている
        set({ backend: { kind: "none", localAvailable: false } });
        return;
      }

      const handle = await loadDirectoryHandle();
      if (handle === null) {
        set({ backend: { kind: "none", localAvailable: true } });
        return;
      }

      // 起動時は利用者の操作が無いため、権限を要求せず確認だけする
      const permission: FsaPermissionState = await ensurePermission(handle, false);
      if (permission !== "granted") {
        set({ backend: { kind: "needsPermission", folderName: handle.name } });
        return;
      }

      teardown();
      store = new LocalFolderStore(handle);
      await attach("local", handle.name);
    },

    async chooseFolder() {
      const handle = await pickDirectory();
      if (handle === null) return;

      // **差し替える前に掴む。** ゲストの中身はメモリにしか無い
      const guest = guestStoreIfAny();
      await saveDirectoryHandle(handle);
      await saveBackend("local");
      useEditor.getState().close();
      teardown();
      store = new LocalFolderStore(handle);
      await attach("local", handle.name);
      await adoptGuestMaps(guest);
    },

    /**
     * 保存先を決めずに使い始める（2.12）。
     *
     * **初めての人にいきなりフォルダの許可を求めない。** 何も見ないうちに
     * 決めさせるのが不信の元であり、触ってから決められるようにする
     * （NN/g のアクセス許可の指針）。
     *
     * **履歴を持たせない。** ゲストの控えを IndexedDB に積むと、
     * 「保存していない」と言いながらブラウザに残ることになる。
     */
    async startGuest() {
      useEditor.getState().close();
      teardown();
      store = new MemoryStore();
      await attach("guest", "ゲストモード", null);
    },

    async connectGitHub(input, remember) {
      const parsed = parseCredentialInput(input);
      if (!parsed.ok) return { ok: false, field: parsed.field, message: parsed.message };

      // 保管する前に、実際に届くかを確かめる。
      // 届かない設定を記憶すると、次の起動が「保存できない状態」から始まる
      const verified = await verifyCredential(parsed.credential, browserFetch);
      if (!verified.ok) return { ok: false, message: verified.message };

      if (remember) {
        await saveCredential(parsed.credential);
        await saveBackend("github");
      } else {
        // 記憶しない選択のときは、前に記憶したものも残さない
        await clearCredential();
        await clearBackend();
      }

      useEditor.getState().close();
      const guest = guestStoreIfAny();
      set({ github: describeCredential(parsed.credential) });
      await attachGitHub(parsed.credential);
      await adoptGuestMaps(guest);
      return { ok: true };
    },

    async disconnectGitHub() {
      await clearCredential();
      await clearBackend();
      useEditor.getState().close();
      teardown();
      set({ github: null, maps: [], indexes: [], externallyChanged: false, error: null });
      await get().init();
    },

    async useGitHub() {
      const credential = await loadCredential();
      if (credential === null) {
        set({ error: texts().error.noGitHub });
        return;
      }
      await get().saveNow();
      await saveBackend("github");
      useEditor.getState().close();
      await attachGitHub(credential);
    },

    async useLocalFolder() {
      await get().saveNow();
      await saveBackend("local");
      useEditor.getState().close();
      teardown();
      set({ maps: [], indexes: [], externallyChanged: false, error: null });
      await get().init();
    },

    async grantPermission() {
      const handle = await loadDirectoryHandle();
      if (handle === null) {
        set({ backend: { kind: "none", localAvailable: isFileSystemAccessSupported() } });
        return;
      }

      if ((await ensurePermission(handle, true)) !== "granted") {
        set({ error: texts().error.folderDenied });
        return;
      }

      teardown();
      store = new LocalFolderStore(handle);
      await attach("local", handle.name);
    },

    async refresh() {
      if (store === null) return;
      try {
        const maps = await store.list();
        set({ maps, error: null });
        // 索引は検索とタグ絞り込みのためのもので、一覧の表示には要らない。
        // 作り直しに失敗しても一覧は出す
        await searchIndex?.refresh(maps);
        set({ indexes: searchIndex?.all() ?? [] });
      } catch (error) {
        set({ error: texts().error.listMaps(messageOf(error)) });
      }
    },

    async openMap(id) {
      if (store === null) return;
      // 切り替えの前に、書きかけを必ず書き出す
      await get().saveNow();

      try {
        const { md, version } = await store.read(id);
        const { doc } = parseMarkdown(md, { id, version });
        useEditor.getState().open({ id, meta: doc.meta, colors: doc.view.colors, version }, doc);
        set({ externallyChanged: false, error: null });
      } catch (error) {
        set({ error: texts().error.openMap(messageOf(error)) });
      }
    },

    async createMap(title, markdown) {
      if (store === null) return;
      await get().saveNow();

      const at = new Date().toISOString();
      const id = fileNameFor(
        title,
        get().maps.map((meta) => meta.id),
      );
      // テンプレートから作る場合も、表題だけは利用者が入れたものに揃える
      const md =
        markdown === undefined ? initialMarkdown(title, at) : retitle(markdown, id, title, at);
      try {
        await store.write(id, md, null);
        await get().refresh();
        await get().openMap(id);
      } catch (error) {
        set({ error: texts().error.createMap(messageOf(error)) });
      }
    },

    async renameMap(id, title) {
      if (store === null) return;
      const next = title.trim();
      if (next === "") return;

      // 開いているマップなら、書きかけを先に確定させてから読み直す
      await get().saveNow();
      const wasOpen = useEditor.getState().map?.id === id;

      try {
        const { md, version } = await store.read(id);
        const at = new Date().toISOString();
        const body = retitle(md, id, next, at);
        const newId = fileNameFor(
          next,
          get()
            .maps.map((meta) => meta.id)
            .filter((other) => other !== id),
        );

        if (newId === id) {
          await store.write(id, body, version);
        } else {
          // 新しい名前で書けてから古い方を消す。順序を逆にすると、
          // 消した後で書き込みに失敗したときにマップそのものが失われる
          await store.write(newId, body, null);
          await store.remove(id);
          // 引き継がないと、改名した瞬間に過去の版へ辿り着けなくなる
          await history?.rename?.(id, newId);
        }

        await get().refresh();
        if (wasOpen) await get().openMap(newId);
      } catch (error) {
        set({ error: texts().error.renameMap(messageOf(error)) });
      }
    },

    async closeMap() {
      if (useEditor.getState().map === null) return;

      // 自動保存は入力が止まってから 800ms 待つ。その待ち時間中に閉じると
      // 最後の編集が消えるため、先に書き終える
      await get().saveNow();
      useEditor.getState().close();
      set({ externallyChanged: false });
    },

    async deleteMap(id) {
      if (store === null) return;

      if (useEditor.getState().map?.id === id) {
        // 進行中の保存を先に終わらせる。書き込みと削除が交差すると、
        // 消したはずのファイルが書き戻される
        await get().saveNow();
        useEditor.getState().close();
        set({ externallyChanged: false });
      }

      try {
        await store.remove(id);
        // 履歴も片付ける。残すと、削除したはずの内容が端末に残り続ける
        await history?.forget?.(id);
        await get().refresh();
      } catch (error) {
        set({ error: texts().error.deleteMap(messageOf(error)) });
      }
    },

    async reloadOpen() {
      const open = useEditor.getState().map;
      if (open === null) return;
      set({ externallyChanged: false });
      await get().openMap(open.id);
    },

    async overwriteWithMine() {
      const status = useEditor.getState().status;
      if (status.kind !== "conflict") return;
      // 相手の版を基準に取り直したうえで、こちらの内容を書く。
      // 相手の内容は失われるが、利用者が明示的に選んだ場合に限る（設計書 8.5）
      useEditor.getState().setVersion(status.serverVersion);
      useEditor.getState().setStatus({ kind: "dirty" });
      await get().saveNow();
    },

    async restoreQuarantined(entry) {
      // 退避した内容を編集中の状態として復元する。
      // ファイルへ書き戻すのは通常の自動保存に任せる
      const { doc } = parseMarkdown(entry.md, { id: entry.id });
      const current = useEditor.getState().map;
      useEditor.getState().open(
        {
          id: entry.id,
          meta: doc.meta,
          colors: doc.view.colors,
          // 元の版が分からないので、保存時に競合として検出させる
          version: current?.id === entry.id ? current.version : "",
        },
        doc,
      );
      useEditor.getState().setStatus({ kind: "dirty" });
      await get().discardQuarantined(entry);
    },

    async discardQuarantined(entry) {
      await dropQuarantined(entry.key);
      set({ quarantined: get().quarantined.filter((item) => item.key !== entry.key) });
    },

    async saveNow() {
      await autoSave?.flush();
    },

    async listHistory() {
      const open = useEditor.getState().map;
      if (history === null || open === null) return [];
      try {
        return await history.list(open.id);
      } catch (error) {
        // 控えが読めないことでマップの編集を止めない（原則1: `.md` が正）
        set({ error: texts().error.loadHistory(messageOf(error)) });
        return [];
      }
    },

    async readVersion(entryId) {
      const open = useEditor.getState().map;
      if (history === null || open === null) return null;
      try {
        return await history.read(open.id, entryId);
      } catch (error) {
        set({ error: texts().error.loadVersion(messageOf(error)) });
        return null;
      }
    },

    async restoreVersion(entryId) {
      const open = useEditor.getState().map;
      if (history === null || open === null) return;

      let md: string;
      try {
        md = await history.read(open.id, entryId);
      } catch (error) {
        set({ error: texts().error.loadVersion(messageOf(error)) });
        return;
      }

      /*
       * 木ごと差し替える。**保存先へ直接書き戻さない。**
       * `replaceTree` は Undo スタックへ積むので `Ctrl+Z` で取り消せるが、
       * ファイルを上書きしてしまうと取り消す手段が無くなる。
       * 書き込みは、いつもどおり自動保存に任せる。
       */
      const { doc } = parseMarkdown(md, { id: open.id });
      useEditor
        .getState()
        .replaceTree(doc.root, collapsedPathsToUids(doc.root, doc.view.collapsed));
    },
  };
});
