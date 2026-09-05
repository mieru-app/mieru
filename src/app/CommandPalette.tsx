import { useLanguage } from "../state/i18n.js";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MapIndex } from "../state/search.js";
import type { PaletteItem } from "./command-palette.js";
import { buildPaletteItems } from "./command-palette.js";

/**
 * コマンドパレット（`Ctrl+K`、設計書 7.4）。
 *
 * 覆いを被せるのは、削除確認以外にモーダルを使わないという制約（設計書 7.2）の
 * 唯一の例外である。設計書 7.2 の画面図と 7.4 の割り当て表が
 * この機能を明示しているため、例外として扱う。
 * 何も選ばずに Escape で閉じれば元の状態に戻り、判断を迫られることはない。
 */

interface Props {
  indexes: MapIndex[];
  onClose: () => void;
  onPick: (item: PaletteItem) => void;
}

export function CommandPalette({ indexes, onClose, onPick }: Props): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const s = useLanguage((state) => state.s);
  const items = useMemo(() => buildPaletteItems(query, indexes, s), [query, indexes, s]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // 絞り込むと項目が減る。選択位置が一覧の外へ出たままにしない
  useEffect(() => {
    setActive(0);
  }, [query]);

  const move = (delta: number): void => {
    if (items.length === 0) return;
    setActive((current) => (current + delta + items.length) % items.length);
  };

  let lastGroup = "";

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label={s.palette.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          className="palette-input"
          value={query}
          placeholder={s.palette.placeholder}
          aria-label={s.palette.placeholder}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowDown") {
              event.preventDefault();
              move(1);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              move(-1);
            }
            if (event.key === "Enter") {
              const item = items[active];
              if (item !== undefined) onPick(item);
            }
          }}
        />

        <div className="palette-list">
          {items.length === 0 && <p className="palette-empty">{s.palette.empty}</p>}
          {items.map((item, index) => {
            const heading = item.group === lastGroup ? null : item.group;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {heading !== null && <p className="palette-group">{heading}</p>}
                <button
                  type="button"
                  className={`palette-item${index === active ? " is-active" : ""}`}
                  // 入力欄から入力位置を奪わない。押した後も続けて絞り込める
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onPick(item)}
                >
                  <span className="palette-title">{item.title}</span>
                  {item.hint !== "" && <span className="palette-hint">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
