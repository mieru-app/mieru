import type { MapMeta, MapNode, ViewState } from "../core/types.js";

/**
 * 主表示領域のモード。3つが同じ場所で入れ替わる（設計書 7.2）。
 *
 * 実体は `view-mode.ts` にある。並び順・名前・巡回の順と1文字もずれないよう、
 * 型もそこから導いている。ここでは今までどおり読めるように再輸出するだけ。
 */
export type { ViewMode } from "./view-mode.js";

/**
 * 保存状態。ステータスバーに常時表示し、「保存ボタンを探す」体験を作らない（原則4）。
 *
 * `conflict` と `failed` は利用者の判断を要する状態であり、
 * どちらも編集内容が失われていないことを併せて伝えなければならない。
 */
export type SaveStatus =
  /** マップ未読み込み */
  | { kind: "empty" }
  /** 保存済み。`at` は保存時刻 */
  | { kind: "saved"; at: number }
  /** 未保存の変更がある */
  | { kind: "dirty" }
  | { kind: "saving" }
  /** 外部で更新されていた。両方を残して利用者に選ばせる（設計書 8.5） */
  | { kind: "conflict"; serverMd: string; serverVersion: string }
  /** 再試行しても保存できなかった。内容は退避済み */
  | { kind: "failed"; reason: string };

/** Undo / Redo が巻き戻す対象 */
export interface EditorSnapshot {
  root: MapNode;
  collapsedUids: ReadonlySet<string>;
  selectedUid: string;
}

/** 開いているマップの素性 */
export interface OpenMap {
  /** ストア上の id（ファイル名） */
  id: string;
  meta: MapMeta;
  /** 折り畳み以外の表示状態。折り畳みは編集中 uid で持つため別扱いにする */
  colors: ViewState["colors"];
  /** 読み込んだ時点の version。楽観ロックに使う */
  version: string;
}
