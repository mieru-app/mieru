import type { StoreApi } from "zustand";

import { serializeMarkdown } from "../core/serialize.js";
import type { HistoryStore, MapStore } from "../store/types.js";
import { ConflictError, MapNotFoundError, SaveFailedError } from "../store/types.js";
import type { EditorState } from "./editor.js";
import { useLanguage } from "./i18n.js";

/**
 * 自動保存。
 *
 * 「保存ボタンを探す」体験を作らないための機構であり（原則4）、
 * 同時に「保存し損ねて失う」ことがあってはならない。
 * そのため保存できなかった場合は必ず状態として残し、黙って諦めない。
 *
 * 仕様の正本: docs/design.md 7.1 の F-31 / 11章
 */

/** 入力が止まってから保存するまでの猶予（設計書 F-31） */
const DEBOUNCE_MS = 800;

export interface AutoSaveOptions {
  debounceMs?: number;
  /** 現在時刻。テストから固定するために差し替える */
  now?: () => number;
  /**
   * 保存できた内容を控える先（Phase 2.8）。
   *
   * **保存が成功した瞬間だけが、書かれたバイト列を確実に知っている場所である。**
   * ここ以外から控えると、保存に失敗した内容や、保存されなかった内容が
   * 履歴に混ざる。履歴を持たない保存先では省略する。
   */
  history?: HistoryStore | null;
}

export class AutoSave {
  readonly #store: MapStore;
  readonly #editor: StoreApi<EditorState>;
  readonly #debounceMs: number;
  readonly #now: () => number;
  readonly #history: HistoryStore | null;

  #timer: ReturnType<typeof setTimeout> | null = null;
  #unsubscribe: (() => void) | null = null;
  /** 実行中の保存。多重実行を避けるために保持する */
  #inFlight: Promise<void> | null = null;

  constructor(store: MapStore, editor: StoreApi<EditorState>, options: AutoSaveOptions = {}) {
    this.#store = store;
    this.#editor = editor;
    // 保存先が上限を持つ場合はそれに従う。GitHub は内容を作る要求が 500回/時 で、
    // 800ms のままでは集中して編集した1時間で上限に達する（設計書 8.7.5）
    this.#debounceMs = options.debounceMs ?? store.autosaveDelayMs ?? DEBOUNCE_MS;
    this.#now = options.now ?? Date.now;
    this.#history = options.history ?? null;
  }

  /** 編集の監視を始める */
  start(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = this.#editor.subscribe((state, previous) => {
      if (state.status === previous.status) return;
      if (state.status.kind === "dirty") this.#schedule();
    });
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#cancel();
  }

  #cancel(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #schedule(): void {
    this.#cancel();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.save();
    }, this.#debounceMs);
  }

  /**
   * 直ちに保存する（`Ctrl+S`、画面を離れる直前、マップの切り替え前）。
   * 保存中なら、その完了を待ってから改めて保存する。
   */
  async flush(): Promise<void> {
    this.#cancel();
    await this.save();
  }

  /** 保存を実行する。競合と失敗はどちらも状態として残し、例外を投げない */
  async save(): Promise<void> {
    if (this.#inFlight !== null) {
      // 保存中の書き込みを追い越さない。完了後に最新の内容で書き直す
      await this.#inFlight;
    }
    const run = this.#saveOnce();
    this.#inFlight = run;
    try {
      await run;
    } finally {
      this.#inFlight = null;
    }
  }

  /**
   * 1回分の保存。
   *
   * 保存中に更に編集された場合は version だけ取り込み、未保存のまま次の保存を予約する。
   * これを怠ると「保存済み」と表示しながら最後の入力が書かれていない状態になる。
   */
  async #saveOnce(): Promise<void> {
    const state = this.#editor.getState();
    const { map, status } = state;
    if (map === null) return;
    // 競合は利用者の判断待ちであり、勝手に上書きしない（設計書 8.5）
    if (status.kind === "conflict" || status.kind === "saving" || status.kind === "saved") return;

    const doc = state.buildDoc();
    if (doc === null) return;

    const rootAtSave = state.root;
    const collapsedAtSave = state.collapsedUids;

    const at = this.#now();
    const stamp = new Date(at).toISOString();
    const md = serializeMarkdown({
      ...doc,
      meta: {
        ...doc.meta,
        created: doc.meta.created === "" ? stamp : doc.meta.created,
        updated: stamp,
      },
    });

    state.setStatus({ kind: "saving" });

    try {
      const version = await this.#store.write(map.id, md, map.version === "" ? null : map.version);
      const after = this.#editor.getState();
      // 別のマップに切り替わっていたら、この結果は捨てる
      if (after.map?.id !== map.id) return;

      after.markSaved(version, at);
      await this.#record(map.id, md, at);
      if (after.root !== rootAtSave || after.collapsedUids !== collapsedAtSave) {
        // 保存中に入った編集はまだ書かれていない
        after.setStatus({ kind: "dirty" });
        this.#schedule();
      }
    } catch (error) {
      this.#handleFailure(error, map.id);
    }
  }

  /**
   * 保存できた内容を履歴へ控える。
   *
   * **失敗しても保存の成否に影響させない。** 履歴は控えであって正本ではなく（原則1）、
   * 控えられなかったことを理由に「保存できていない」と見せる方が有害である。
   * IndexedDB が使えない環境（プライベートウィンドウ）では常に失敗する。
   */
  async #record(id: string, md: string, at: number): Promise<void> {
    const history = this.#history;
    if (history?.record === undefined) return;
    try {
      await history.record(id, md, at);
    } catch {
      // 握りつぶす。控えられなかったことは保存の結果を変えない
    }
  }

  #handleFailure(error: unknown, id: string): void {
    const editor = this.#editor.getState();
    if (editor.map?.id !== id) return;

    if (error instanceof ConflictError) {
      // 自動マージはしない。両方を残して利用者に選ばせる（設計書 8.5）
      editor.setStatus({
        kind: "conflict",
        serverMd: error.serverMd,
        serverVersion: error.serverVersion,
      });
      return;
    }

    if (error instanceof MapNotFoundError) {
      // 外部で削除された。次の保存で作り直せるよう version を捨てておく
      editor.setVersion("");
      editor.setStatus({
        kind: "failed",
        reason: useLanguage.getState().s.error.fileRemoved,
      });
      return;
    }

    // SaveFailedError の時点で内容は退避済み。それ以外も失われたとは限らない
    const reason =
      error instanceof SaveFailedError
        ? `${error.reason}（編集内容は退避しました）`
        : error instanceof Error
          ? error.message
          : String(error);
    editor.setStatus({ kind: "failed", reason });
  }
}
