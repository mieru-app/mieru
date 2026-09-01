/**
 * IndexedDB の最小ラッパー。
 *
 * 用途は2つに限る。
 * 1. 選択したフォルダのハンドルを次回起動へ引き継ぐ（設計書 8.3）
 * 2. 保存できなかった編集内容の退避（設計書 11章・原則「データを失わない」）
 *
 * `idb` などのライブラリを入れないのは、必要な操作が get/put/delete/getAll の
 * 4つだけで、依存を増やす理由が乏しいため（CLAUDE.md「依存の追加は最小限」）。
 */

const DB_NAME = "minddeck";
const DB_VERSION = 1;

/** フォルダハンドルの保管庫。キーは固定の1件のみ */
export const STORE_HANDLES = "handles";
/** 保存に失敗した内容の退避先。キーは自動採番 */
export const STORE_QUARANTINE = "quarantine";

/** IndexedDB が使えない環境（プライベートウィンドウ等）では null を返す */
function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_HANDLES)) db.createObjectStore(STORE_HANDLES);
      if (!db.objectStoreNames.contains(STORE_QUARANTINE)) {
        db.createObjectStore(STORE_QUARANTINE, { keyPath: "key", autoIncrement: true });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    // 開けないこと自体は致命的ではない。呼び出し側が null を扱えるようにする
    request.onerror = () => {
      resolve(null);
    };
    request.onblocked = () => {
      resolve(null);
    };
  });
}

function runRequest<T>(request: IDBRequest<T>, transaction: IDBTransaction): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB の操作に失敗しました"));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB のトランザクションが中断されました"));
    };
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T>,
): Promise<T | null> {
  const db = await openDatabase();
  if (db === null) return null;
  try {
    const transaction = db.transaction(storeName, mode);
    return await action(transaction.objectStore(storeName), transaction);
  } finally {
    db.close();
  }
}

export function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  return withStore(storeName, "readonly", async (store, transaction) => {
    const value = await runRequest<T | undefined>(
      store.get(key) as IDBRequest<T | undefined>,
      transaction,
    );
    return value ?? null;
  });
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const values = await withStore(storeName, "readonly", (store, transaction) =>
    runRequest<T[]>(store.getAll() as IDBRequest<T[]>, transaction),
  );
  return values ?? [];
}

/** 保管庫が autoIncrement の場合は key を省略する */
export async function idbPut(storeName: string, value: unknown, key?: IDBValidKey): Promise<void> {
  await withStore(storeName, "readwrite", (store, transaction) =>
    runRequest(key === undefined ? store.put(value) : store.put(value, key), transaction),
  );
}

export async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  await withStore(storeName, "readwrite", (store, transaction) =>
    runRequest(store.delete(key), transaction),
  );
}
