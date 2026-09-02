import { exportMarkdown } from "../core/export.js";
import type { Command } from "../app/keymap.js";
import { useEditor } from "./editor.js";
import { locate } from "./tree.js";
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
}

/**
 * AI へ渡す Markdown を作る。
 *
 * 中心テーマを選んでいるときは全体、それ以外のノードを選んでいるときは
 * その部分木のみを出力する（設計書 7.3 の操作表）。
 */
export function exportForAi(): { md: string; scope: "全体" | "部分" } | null {
  const state = useEditor.getState();
  const doc = state.buildDoc();
  if (doc === null) return null;

  const selected =
    state.selectedUid === null ? null : (locate(doc.root, state.selectedUid)?.node ?? null);

  if (selected === null || selected.path === "") {
    return { md: exportMarkdown(doc, "expanded"), scope: "全体" };
  }
  return { md: exportMarkdown(doc, "subtree", { fromPath: selected.path }), scope: "部分" };
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
      editor.setMode(editor.mode === "canvas" ? "outline" : "canvas");
      return;

    case "copyForAi": {
      const result = exportForAi();
      if (result === null) return;
      try {
        await deps.copyText(result.md);
        deps.notify?.(`${result.scope}を Markdown でコピーしました`);
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

    case "saveNow":
      await useWorkspace.getState().saveNow();
      return;
  }
}
