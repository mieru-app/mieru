import type { ExportFormat } from "../core/export.js";
import { exportMarkdown } from "../core/export.js";
import type { Command } from "../app/keymap.js";
import { toFileNameBase } from "../store/file-name.js";
import { useEditor } from "./editor.js";
import { locate } from "./tree.js";
import { nextViewMode } from "./view-mode.js";
import { useWorkspace } from "./workspace.js";

/**
 * キー操作やツールバーから呼ばれる操作の実体。
 *
 * 画面側に散らさず1か所へ集めているのは、
 * 「このキーを押すと何が起きるか」を画面を動かさずに検証できるようにするためである。
 */

export interface CommandDeps {
  /** クリップボードへの書き出し。ブラウザ API を直接触らせないために注入する */
  copyText(text: string): Promise<void>;
  /** 結果の短い通知。UI 側でトーストなどに使う */
  notify?(message: string): void;
  /** キー操作一覧の開閉。表示の都合なので UI 側から渡す */
  toggleHelp?(): void;
  /** サイドバーの開閉 */
  toggleSidebar?(): void;
  /** 検索欄へ入力位置を移す */
  focusSearch?(): void;
  /** AI 出力パネルの開閉 */
  toggleExport?(): void;
  /** コマンドパレットを開く */
  openPalette?(): void;
}

/**
 * 出力の範囲（設計書 7.3）。
 *
 * `src/core/` に渡すのは構造パスだけであり、「いま何を選んでいるか」を解決するのは
 * この層の仕事である。選択は編集状態であって変換の入力ではない。
 */
export type ExportScope = "whole" | "selection";

/** 出力の結果。何を出したのかが利用者に分かる形で返す */
export interface ExportResult {
  md: string;
  /** 「全体」または起点ノードのラベル。通知とファイル名に使う */
  scope: string;
  /** `.md` として保存するときの既定のファイル名 */
  fileName: string;
}

/**
 * 指定した形式と範囲で Markdown を作る（設計書 7.3）。
 *
 * 選択部分の起点は選択中のノード。中心テーマを選んでいるときは全体と同じになる。
 */
export function exportAs(format: ExportFormat, scope: ExportScope = "whole"): ExportResult | null {
  const state = useEditor.getState();
  const doc = state.buildDoc();
  if (doc === null) return null;

  const title = doc.meta.title === "" ? "無題" : doc.meta.title;
  const selected =
    state.selectedUid === null ? null : (locate(doc.root, state.selectedUid)?.node ?? null);

  // 選択部分でも、中心テーマを選んでいるなら全体を出す。
  // 「部分のつもりで全体が出た」より「全体が出た」と分かる方がよい
  if (scope !== "selection" || selected === null || selected.path === "") {
    return {
      md: exportMarkdown(doc, format),
      scope: "全体",
      fileName: `${toFileNameBase(title)}.md`,
    };
  }

  const label = selected.label === "" ? "無題の枝" : selected.label;
  return {
    md: exportMarkdown(doc, format, { fromPath: selected.path }),
    scope: label,
    fileName: `${toFileNameBase(`${title} - ${label}`)}.md`,
  };
}

/**
 * `Ctrl+Shift+C` の出力。
 *
 * 中心テーマを選んでいるときは全体、それ以外のノードを選んでいるときは
 * その部分木のみを出力する（設計書 7.3 の操作表）。
 * 中心テーマかどうかの判定は `exportAs` が持っているため、ここでは範囲を指定するだけでよい。
 */
export function exportForAi(): ExportResult | null {
  return exportAs("heading", "selection");
}

/** 操作を実行する。割り当ての無い状態では何もしない */
export async function runCommand(command: Command, deps: CommandDeps): Promise<void> {
  const editor = useEditor.getState();

  switch (command) {
    case "addSibling":
      editor.addSibling();
      return;
    case "addChild":
      editor.addChild();
      return;
    case "outdent":
      editor.outdent();
      return;
    case "beginEdit":
      if (editor.selectedUid !== null) editor.beginEdit(editor.selectedUid);
      return;
    case "remove":
      editor.remove();
      return;
    case "moveUp":
      editor.move("up");
      return;
    case "moveDown":
      editor.move("down");
      return;
    case "moveLeft":
      editor.move("left");
      return;
    case "moveRight":
      editor.move("right");
      return;
    case "reorderUp":
      editor.reorder(-1);
      return;
    case "reorderDown":
      editor.reorder(1);
      return;
    case "toggleCollapse":
      editor.toggleCollapse();
      return;
    case "undo":
      editor.undo();
      return;
    case "redo":
      editor.redo();
      return;
    case "toggleMode":
      // 巡回の順は `view-mode.ts` が持つ。ツールバーの並び順と同じ配列から出す
      editor.setMode(nextViewMode(editor.mode));
      return;

    case "copyForAi": {
      const result = exportForAi();
      if (result === null) return;
      try {
        await deps.copyText(result.md);
        const what = result.scope === "全体" ? "全体" : `「${result.scope}」`;
        deps.notify?.(`${what}を Markdown でコピーしました`);
      } catch {
        // クリップボードは権限やフォーカスの都合で失敗しうる。黙って失わせない
        deps.notify?.("クリップボードへコピーできませんでした");
      }
      return;
    }

    case "toggleHelp":
      deps.toggleHelp?.();
      return;

    case "toggleSidebar":
      deps.toggleSidebar?.();
      return;

    case "focusSearch":
      deps.focusSearch?.();
      return;

    case "toggleExport":
      deps.toggleExport?.();
      return;

    case "openPalette":
      deps.openPalette?.();
      return;

    case "saveNow":
      await useWorkspace.getState().saveNow();
      return;
  }
}
