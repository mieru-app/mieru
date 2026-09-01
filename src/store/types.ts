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
