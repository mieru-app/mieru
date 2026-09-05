import { fileNameFor } from "./file-name.js";
import type { MapStore } from "./types.js";

/**
 * 保存先から保存先へマップを丸ごと写す（2.12）。
 *
 * **ゲストモードで書いたものを、選ばれた保存先へ引き取るために使う。**
 * ゲストの中身はメモリにしか無いので、ここで写さなければ
 * 「保存先を選んだ瞬間に、それまで書いたものが消える」ことになる。
 *
 * **`workspace.ts` から切り出してあるのは、あちらが自動テストを持たない層だからである。**
 * 引き取りは失敗するとその場で内容が消えるため、机上で確かめられる形にしておく。
 *
 * 名前は写し先の状況で採番し直す。同じ名前が先にあると `write` は
 * `ConflictError` を投げ、**そこで引き取りが止まって残りが消える。**
 */

export interface CopiedMap {
  /** 写し先で付いた名前 */
  id: string;
  /** 写し元での名前 */
  from: string;
}

/**
 * `from` の全てのマップを `to` へ写す。**`from` は変更しない。**
 *
 * @returns 写した結果。1件も無ければ空
 */
export async function copyAllMaps(from: MapStore, to: MapStore): Promise<CopiedMap[]> {
  const sources = await from.list();
  if (sources.length === 0) return [];

  // 採番は写し先の現状から始める。**写しながら増える分も数に入れる**
  const used = (await to.list()).map((meta) => meta.id);
  const copied: CopiedMap[] = [];

  for (const meta of sources) {
    const { md } = await from.read(meta.id);
    // 表題が空でも名前は要る。`fileNameFor` が既定へ倒す
    const id = fileNameFor(meta.title, used);
    used.push(id);
    await to.write(id, md, null);
    copied.push({ id, from: meta.id });
  }

  return copied;
}
