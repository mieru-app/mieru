import type { Command } from "./keymap.js";
import { EDIT_BAR_ITEMS, isEnabled } from "./edit-bar.js";

/**
 * 狭い画面の編集バー（2.7-5）。
 *
 * **指しか無い端末での唯一の構造編集の入口である。** 並べる操作と押せる条件は
 * `edit-bar.ts` が持ち、自動テストが付いている。ここは押して渡すだけにする。
 *
 * 広い画面には出さない。キーボードがあり、ツールバー1本の原則を崩す理由がない
 * （設計書 7.2）。出す・出さないの判断は `src/state/layout.ts`。
 */

interface Props {
  hasSelection: boolean;
  canUndo: boolean;
  onRun: (command: Command) => void;
}

export function EditBar({ hasSelection, canUndo, onRun }: Props): React.JSX.Element {
  return (
    <div className="editbar" role="toolbar" aria-label="編集">
      {EDIT_BAR_ITEMS.map((item) => (
        <button
          key={item.command}
          type="button"
          className={item.danger === true ? "is-danger" : undefined}
          title={item.title}
          aria-label={item.title}
          disabled={!isEnabled(item, { hasSelection, canUndo })}
          onClick={() => onRun(item.command)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
