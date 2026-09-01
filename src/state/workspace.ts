import { create } from "zustand";

import { parseMarkdown } from "../core/parse.js";
import { serializeMarkdown } from "../core/serialize.js";
import type { MapMeta } from "../core/types.js";
import {
  ensurePermission,
  isFileSystemAccessSupported,
  loadDirectoryHandle,
  pickDirectory,
  saveDirectoryHandle,
} from "../store/directory-handle.js";
import { fileNameFor } from "../store/file-name.js";
import type { FsaPermissionState } from "../store/fsa.js";
import { LocalFolderStore } from "../store/LocalFolderStore.js";
import type { QuarantinedEntry } from "../store/quarantine.js";
import { dropQuarantined, listQuarantined } from "../store/quarantine.js";
import { AutoSave } from "./autosave.js";
import { useEditor } from "./editor.js";

/**
 * 作業フォルダとマップ一覧の状態。
 *
 * 永続化に触れるのはこの層までで、React 側は `MapStore` の存在を知らない（設計原則3）。
 * 自動保存と外部変更の監視の生存期間もここで管理する。
 */

/** フォルダの状態。画面はこれを見て何を出すかを決める */
export type FolderState =
  /** File System Access API 非対応のブラウザ（Firefox / Safari / モバイル） */
  | { kind: "unsupported" }
  /** 起動直後。保存済みのフォルダを調べている最中 */
  | { kind: "loading" }
  /** フォルダが未選択 */
  | { kind: "none" }
  /** 前回のフォルダはあるが、再許可が要る */
  | { kind: "needsPermission"; folderName: string }
  | { kind: "ready"; folderName: string };

export interface WorkspaceState {
  folder: FolderState;
  maps: MapMeta[];
  /** 一覧や読み込みの失敗。保存の失敗は編集ストアの status が持つ */
  error: string | null;
  /** 開いているマップが外部で書き換えられた */
  externallyChanged: boolean;
  /** 保存できずに退避された内容。起動時に提示して書き戻しを促す */
  quarantined: QuarantinedEntry[];

  /** 起動時に呼ぶ。前回のフォルダを復帰させる */
  init(): Promise<void>;
  /** 利用者の操作でフォルダを選ぶ */
  chooseFolder(): Promise<void>;
  /** 「アクセスを許可」ボタン。利用者の操作が要る */
  grantPermission(): Promise<void>;
  refresh(): Promise<void>;
  openMap(id: string): Promise<void>;
  createMap(title: string): Promise<void>;
  /** 外部の変更を取り込む（未保存の変更は破棄される） */
  reloadOpen(): Promise<void>;
  /** 競合を「こちらの内容で上書き」で解決する */
  overwriteWithMine(): Promise<void>;
  /** 退避された内容を現在のマップとして開く */
  restoreQuarantined(entry: QuarantinedEntry): Promise<void>;
  discardQuarantined(entry: QuarantinedEntry): Promise<void>;
  /** 直ちに保存する（Ctrl+S、画面を離れる前） */
  saveNow(): Promise<void>;
}

/** 現在の作業フォルダ。UI からは触らせない */
let store: LocalFolderStore | null = null;
let autoSave: AutoSave | null = null;
let unwatch: (() => void) | null = null;

/** テストと画面遷移のために、現在のストアを片付ける */
function teardown(): void {
  autoSave?.stop();
  autoSave = null;
  unwatch?.();
  unwatch = null;
  store = null;
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

export const useWorkspace = create<WorkspaceState>((set, get) => {
  /** フォルダが決まった後の共通処理。監視と自動保存を開始する */
  async function attach(folderName: string): Promise<void> {
    if (store === null) return;

    autoSave = new AutoSave(store, useEditor);
    autoSave.start();
    unwatch = store.watch((id) => {
      // 開いているマップが外部で変わったときだけ知らせる。
      // 勝手に読み直すと編集中の内容が消えるため、判断は利用者に委ねる
      if (useEditor.getState().map?.id === id) set({ externallyChanged: true });
      void get().refresh();
    });

    set({ folder: { kind: "ready", folderName }, error: null });
    await get().refresh();
    set({ quarantined: await listQuarantined() });
  }

  return {
    folder: { kind: "loading" },
    maps: [],
    error: null,
    externallyChanged: false,
    quarantined: [],

    async init() {
      if (!isFileSystemAccessSupported()) {
        set({ folder: { kind: "unsupported" } });
        return;
      }

      const handle = await loadDirectoryHandle();
      if (handle === null) {
        set({ folder: { kind: "none" } });
        return;
      }

      // 起動時は利用者の操作が無いため、権限を要求せず確認だけする
      const permission: FsaPermissionState = await ensurePermission(handle, false);
      if (permission !== "granted") {
        set({ folder: { kind: "needsPermission", folderName: handle.name } });
        return;
      }

      teardown();
      store = new LocalFolderStore(handle);
      await attach(handle.name);
    },

    async chooseFolder() {
      const handle = await pickDirectory();
      if (handle === null) return;

      await saveDirectoryHandle(handle);
      useEditor.getState().close();
      teardown();
      store = new LocalFolderStore(handle);
      await attach(handle.name);
    },

    async grantPermission() {
      const handle = await loadDirectoryHandle();
      if (handle === null) {
        set({ folder: { kind: "none" } });
        return;
      }

      if ((await ensurePermission(handle, true)) !== "granted") {
        set({ error: "フォルダへのアクセスが許可されませんでした。" });
        return;
      }

      teardown();
      store = new LocalFolderStore(handle);
      await attach(handle.name);
    },

    async refresh() {
      if (store === null) return;
      try {
        set({ maps: await store.list(), error: null });
      } catch (error) {
        set({ error: `マップ一覧を読めませんでした: ${messageOf(error)}` });
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
        set({ error: `マップを開けませんでした: ${messageOf(error)}` });
      }
    },

    async createMap(title) {
      if (store === null) return;
      await get().saveNow();

      const at = new Date().toISOString();
      const id = fileNameFor(
        title,
        get().maps.map((meta) => meta.id),
      );
      try {
        await store.write(id, initialMarkdown(title, at), null);
        await get().refresh();
        await get().openMap(id);
      } catch (error) {
        set({ error: `マップを作成できませんでした: ${messageOf(error)}` });
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
  };
});
