import { useEffect, useRef } from "react";

import type { CommandDeps } from "../state/commands.js";
import { runCommand } from "../state/commands.js";
import { useEditor } from "../state/editor.js";
import { isTypingTarget, resolveShortcut } from "./keymap.js";

/**
 * キーボード操作を画面全体へ結び付ける。
 *
 * 割り当ての判定は `keymap.ts`、実行は `state/commands.ts` にあり、
 * ここが受け持つのはブラウザのイベントとの接続だけである。
 */

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** 画面側から渡す依存。クリップボードだけはここで補う */
export type KeymapDeps = Omit<CommandDeps, "copyText">;

export function useKeymap(deps: KeymapDeps): void {
  // 依存は毎回新しい物になるため、購読し直さずに最新を参照する
  const latest = useRef(deps);
  latest.current = deps;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const typing = isTypingTarget(event.target) || useEditor.getState().editingUid !== null;
      const command = resolveShortcut(event, typing);
      if (command === null) return;

      // Tab による移動や Ctrl+S の保存ダイアログなど、既定の動作を止める
      event.preventDefault();
      void runCommand(command, { copyText, ...latest.current });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
