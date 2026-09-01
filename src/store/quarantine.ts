import { idbDelete, idbGetAll, idbPut, STORE_QUARANTINE } from "./idb.js";

/**
 * 保存できなかった編集内容の退避。
 *
 * **利用者の入力を失わせないための最後の砦である。**
 * フォルダの権限が失効した、ディスクがいっぱい、ファイルが他プロセスに掴まれている――
 * どの理由であれ、書けなかった内容はここへ退避してから利用者へエラーを見せる。
 *
 * 仕様の正本: docs/design.md 11章 / .claude/rules/store.md
 */

export interface QuarantinedEntry {
  /** IndexedDB の自動採番キー */
  key: number;
  /** 退避元のマップ id（ファイル名） */
  id: string;
  md: string;
  /** 退避した時刻（ISO 8601） */
  at: string;
  /** 保存が失敗した理由。利用者への提示用 */
  reason: string;
}

/**
 * 退避先。テストで差し替えられるようインターフェースにしている。
 * 既定の実装は IndexedDB を使う。
 */
export interface QuarantineSink {
  put(id: string, md: string, reason: string): Promise<void>;
}

export const indexedDbQuarantine: QuarantineSink = {
  async put(id, md, reason) {
    await idbPut(STORE_QUARANTINE, { id, md, reason, at: new Date().toISOString() });
  },
};

/** 退避済みの内容を古い順に返す。起動時に提示して書き戻しを促すために使う */
export async function listQuarantined(): Promise<QuarantinedEntry[]> {
  const entries = await idbGetAll<QuarantinedEntry>(STORE_QUARANTINE);
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

/** 書き戻しに成功した退避を捨てる */
export async function dropQuarantined(key: number): Promise<void> {
  await idbDelete(STORE_QUARANTINE, key);
}
