import type { MapMeta } from "../core/types.js";

/**
 * 永続化層の抽象インターフェース。
 *
 * UI 層と永続化の唯一の境界であり、Phase 3 のクラウド同期をこの背後で
 * 差し替えられることが存在意義である（設計原則3）。
 * UI の都合でメソッドを追加してはいけない。4つの実装
 * （MemoryStore / LocalFolderStore / S3Store / SyncingStore）すべてで
 * 意味が通るものだけを置く。
 *
 * 仕様の正本: docs/design.md 8.1
 */
export interface MapStore {
  /** マップ一覧を取得する。本文は読み込まない（軽量） */
  list(): Promise<MapMeta[]>;

  /** マップ本文を取得する */
  read(id: string): Promise<{ md: string; version: string }>;

  /**
   * マップを保存する（楽観ロック）。
   *
   * 全実装が満たすべき契約:
   * | baseVersion | 保存先の状態 | 挙動 |
   * |---|---|---|
   * | `null`      | 存在しない | 新規作成する |
   * | `null`      | 存在する   | ConflictError（他所で作成済み） |
   * | 版を指定    | 版が一致   | 上書きする |
   * | 版を指定    | 版が不一致 | ConflictError |
   * | 版を指定    | 存在しない | MapNotFoundError（他所で削除済み） |
   *
   * @param baseVersion 読み込んだ時点の version。新規作成時は null を渡す
   * @returns 保存後の新しい version
   */
  write(id: string, md: string, baseVersion: string | null): Promise<string>;

  /** マップを削除する。存在しない場合は MapNotFoundError */
  remove(id: string): Promise<void>;

  /**
   * 外部変更の監視。対応可能な実装のみが提供する。
   * @returns 監視を停止する関数
   */
  watch?(onChange: (id: string) => void): () => void;

  /**
   * 自動保存の推奨待機時間（ミリ秒）。省略時は `src/state/` の既定（800ms）を使う。
   *
   * 保存先ごとに書き込み頻度の上限が違うために要る。`GitHubStore` は保存1回が
   * コミット1つで、GitHub は内容を作る要求を 500回/時 に制限している
   * （設計書 8.7.5）。UI の都合ではなく保存先の制約なので、ここに置く。
   */
  readonly autosaveDelayMs?: number;
}

/**
 * 履歴の1版（Phase 2.8）。本文は含まない。
 *
 * 一覧を出すのに本文は要らない。50版を並べるたびに全文を読むと、
 * 保存先が GitHub のときは往復が 1+N 回になる（設計書 8.7.8）。
 */
export interface HistoryEntry {
  /** その保存先で版を一意に指す文字列。IndexedDB は採番、GitHub はコミットの sha */
  id: string;
  /** 記録した時刻（エポックミリ秒） */
  at: number;
  /**
   * 版の大きさ（UTF-8 バイト数）。**分かる実装だけが入れる。**
   *
   * GitHub のコミット一覧は各版の大きさを返さない。出すには版ごとに本文を
   * 取りに行くことになり、50版で 1+N リクエストになる（設計書 8.7.8）。
   * 一覧を出すためだけに払う代償として大きすぎるので、無い場合は出さない。
   */
  size?: number;
}

/**
 * 履歴の閲覧と復元（Phase 2.8、設計書 F-07・8.8）。
 *
 * **`MapStore` に足さない。** あちらは「UI の都合でメソッドを追加してはいけない」と
 * 定めた境界であり（8.1）、履歴閲覧はその契約に含まれない。同じ層に別の
 * インターフェースとして置くことで、保存先ごとに履歴の実体を変えられる
 * （ローカルは IndexedDB、GitHub はコミット）。
 *
 * **履歴は控えであって正本ではない。** `.md` が唯一の真実であることは変わらず
 * （原則1）、履歴はそこから導かれる控えとして扱う。履歴の読み書きに失敗しても
 * マップの保存を失敗させてはならない。
 */
export interface HistoryStore {
  /** 版を新しい順に返す。本文は読み込まない（軽量） */
  list(mapId: string): Promise<HistoryEntry[]>;

  /** 指定した版の本文を読む。無ければ MapNotFoundError */
  read(mapId: string, entryId: string): Promise<string>;

  /**
   * 保存された内容を控える。保存が成功した直後に呼ぶ。
   *
   * **実際に記録するかどうかは実装が決める**（`history-policy.ts`）。
   * 自動保存は入力停止から 800ms で走るため、素直に全部残すと一覧が
   * 数秒刻みで埋まり、目当ての版を探せなくなる。
   *
   * 履歴を保存先そのものが持っている実装（`GitHubStore`。保存1回が
   * コミット1つ）は、控える先が既にあるので省略する。
   */
  record?(mapId: string, md: string, at: number): Promise<void>;

  /**
   * マップが消えたときに履歴も片付ける。
   *
   * 残すと、削除したはずの内容が利用者の端末に残り続ける。
   * 保存先の側で履歴が消える実装は省略してよい。
   */
  forget?(mapId: string): Promise<void>;

  /**
   * マップの名前が変わったときに履歴を引き継ぐ（F-03 は id ごと変える）。
   *
   * 引き継がないと、改名した瞬間に過去の版へ辿り着けなくなる。
   */
  rename?(oldId: string, newId: string): Promise<void>;
}

/**
 * 楽観ロックの衝突。
 *
 * 競合時は自動マージせず、サーバ版とローカル版の両方を残して
 * 判断を利用者に委ねる（docs/design.md 8.5）。そのため
 * 呼び出し側が両者を提示できるよう、サーバ側の内容を保持して投げる。
 */
export class ConflictError extends Error {
  override readonly name = "ConflictError";

  constructor(
    readonly id: string,
    readonly serverVersion: string,
    readonly serverMd: string,
  ) {
    super(`Conflict on ${id}`);
  }
}

/** 指定された id のマップが存在しない */
export class MapNotFoundError extends Error {
  override readonly name = "MapNotFoundError";

  constructor(readonly id: string) {
    super(`Map not found: ${id}`);
  }
}

/**
 * 再試行しても保存できなかった。
 *
 * この例外が投げられた時点で、内容は退避済みである（`QuarantineSink`）。
 * 利用者には「保存できていないが失われてもいない」ことを伝えなければならない。
 */
export class SaveFailedError extends Error {
  override readonly name = "SaveFailedError";

  constructor(
    readonly id: string,
    readonly reason: string,
    override readonly cause: unknown,
  ) {
    super(`Failed to save ${id}: ${reason}`);
  }
}
