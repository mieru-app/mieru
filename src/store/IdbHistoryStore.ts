import { byteLength, decideHistoryWrite, trimHistory } from "./history-policy.js";
import { idbDelete, idbGet, idbPut, STORE_HISTORY } from "./idb.js";
import type { HistoryEntry, HistoryStore } from "./types.js";
import { MapNotFoundError } from "./types.js";

/**
 * IndexedDB による履歴（2.8-3、設計書 8.8）。
 *
 * ローカルフォルダ保存先には履歴の実体が無い。File System Access API は
 * 上書きするだけで、前の内容はどこにも残らない。**「誤って消した枝を取り戻す」
 * 手段が Undo しかなく、それはアプリを閉じた時点で消える。** そこを埋める。
 *
 * **1マップぶんを1件のレコードにまとめて持つ。** IndexedDB の索引とカーソルを
 * 使えば版ごとに1レコードにできるが、`idb.ts` は get/put/delete/getAll の
 * 4つしか持たない小さなラッパーで（依存を増やさないためにそうしている）、
 * 索引を足すとその前提が崩れる。版数と総量には上限があるので
 * （`history-policy.ts`）、1件にまとめても読み書きする量は知れている。
 *
 * **履歴は控えであって正本ではない**（原則1）。読み書きに失敗しても例外を
 * 投げっぱなしにせず、マップの保存を巻き込まない。
 */

/** 保管庫に入る形。`md` を持つのは `list()` 以外から使うため */
interface StoredEntry {
  id: string;
  /** 内容を取り込んだ時刻。まとめるたびに新しくなる。一覧に出すのはこちら */
  at: number;
  /**
   * その版をまとめ始めた時刻。まとめても動かさない。
   * 5分の窓をここから測る（`history-policy.ts`）
   */
  since: number;
  md: string;
}

/** 1マップぶん。古い順に並べる */
interface StoredHistory {
  entries: StoredEntry[];
  /** 次に振る番号。消しても再利用しない */
  nextSeq: number;
}

const EMPTY: StoredHistory = { entries: [], nextSeq: 1 };

/** 壊れた値でも空として扱う。控えのために起動できなくなる方が損害が大きい */
function asHistory(value: unknown): StoredHistory {
  if (typeof value !== "object" || value === null) return EMPTY;
  const record = value as Record<string, unknown>;
  const entries = record["entries"];
  const nextSeq = record["nextSeq"];
  if (!Array.isArray(entries)) return EMPTY;

  const kept: StoredEntry[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const each = entry as Record<string, unknown>;
    const id = each["id"];
    const at = each["at"];
    const since = each["since"];
    const md = each["md"];
    if (typeof id !== "string" || typeof at !== "number" || typeof md !== "string") continue;
    // `since` が欠けていれば取り込み時刻に倒す。次のまとめが早く切れるだけで害はない
    kept.push({ id, at, since: typeof since === "number" ? since : at, md });
  }
  return { entries: kept, nextSeq: typeof nextSeq === "number" ? nextSeq : kept.length + 1 };
}

export class IdbHistoryStore implements HistoryStore {
  async #load(mapId: string): Promise<StoredHistory> {
    const stored = await idbGet<unknown>(STORE_HISTORY, mapId);
    return asHistory(stored);
  }

  async list(mapId: string): Promise<HistoryEntry[]> {
    const { entries } = await this.#load(mapId);
    // 新しい版から見せる。探すのはたいてい直近の版である
    return entries
      .map((entry) => ({ id: entry.id, at: entry.at, size: byteLength(entry.md) }))
      .reverse();
  }

  async read(mapId: string, entryId: string): Promise<string> {
    const { entries } = await this.#load(mapId);
    const found = entries.find((entry) => entry.id === entryId);
    if (found === undefined) throw new MapNotFoundError(`${mapId}#${entryId}`);
    return found.md;
  }

  /**
   * 保存された内容を控える。
   *
   * 記録するかどうかは `history-policy.ts` が決める。ここは結果に従うだけにする。
   */
  async record(mapId: string, md: string, at: number): Promise<void> {
    const history = await this.#load(mapId);
    const previous = history.entries[history.entries.length - 1];
    const decision = decideHistoryWrite({
      previous: previous === undefined ? null : { since: previous.since, md: previous.md },
      md,
      at,
    });
    if (decision === "skip") return;

    let entries: StoredEntry[];
    let nextSeq = history.nextSeq;
    if (decision === "replace") {
      /*
       * まとめた版には**新しい番号を振る。** 同じ番号のまま中身だけ差し替えると、
       * 一覧を開いたまま復元した利用者が、見えている内容とは違う版を戻すことになる。
       */
      // まとめ始めた時刻は動かさない。動かすと窓が先へずれ、5分が永久に来ない
      const since = previous?.since ?? at;
      entries = [...history.entries.slice(0, -1), { id: String(nextSeq), at, since, md }];
      nextSeq += 1;
    } else {
      entries = [...history.entries, { id: String(nextSeq), at, since: at, md }];
      nextSeq += 1;
    }

    await idbPut(STORE_HISTORY, { entries: trimHistory(entries), nextSeq }, mapId);
  }

  async forget(mapId: string): Promise<void> {
    await idbDelete(STORE_HISTORY, mapId);
  }

  /** 改名は id が変わる（F-03）。引き継がないと過去の版へ辿り着けなくなる */
  async rename(oldId: string, newId: string): Promise<void> {
    if (oldId === newId) return;
    const history = await this.#load(oldId);
    if (history.entries.length === 0) {
      await idbDelete(STORE_HISTORY, oldId);
      return;
    }
    // 先に新しい名前で書けてから古い方を消す。逆にすると途中で失敗したとき履歴が消える
    await idbPut(STORE_HISTORY, history, newId);
    await idbDelete(STORE_HISTORY, oldId);
  }
}
