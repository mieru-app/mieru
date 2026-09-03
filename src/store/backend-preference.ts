import { idbDelete, idbGet, idbPut, STORE_SETTINGS } from "./idb.js";

/**
 * どの保存先を使うかの記憶（Phase 2.6-4）。
 *
 * **資格情報とは別に持つ。** 「GitHub の接続情報は残したまま、いまはローカルフォルダを使う」
 * を成り立たせるためである。ここを一緒にすると、保存先を切り替えるたびに
 * トークンを入れ直させることになる。
 *
 * 仕様の正本: docs/design.md 8.7
 */

const BACKEND_KEY = "backend";

export type BackendKind = "local" | "github";

export async function saveBackend(kind: BackendKind): Promise<void> {
  await idbPut(STORE_SETTINGS, kind, BACKEND_KEY);
}

/** 記憶が無ければ null。**既定値をここで決めない**（呼び出し側の状況で変わるため） */
export async function loadBackend(): Promise<BackendKind | null> {
  const stored = await idbGet<unknown>(STORE_SETTINGS, BACKEND_KEY);
  return stored === "local" || stored === "github" ? stored : null;
}

export async function clearBackend(): Promise<void> {
  await idbDelete(STORE_SETTINGS, BACKEND_KEY);
}
