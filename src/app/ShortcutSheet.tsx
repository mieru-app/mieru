import { useLanguage } from "../state/i18n.js";
import { paletteOnlyItems, SHORTCUT_GROUPS } from "./shortcuts.js";

/**
 * キー操作の一覧。
 *
 * モーダルにしない（設計書 7.2）。画面の右側に寄せて開き、
 * 見ながらそのまま操作できるようにする。
 */

interface Props {
  onClose: () => void;
}

export function ShortcutSheet({ onClose }: Props): React.JSX.Element {
  const s = useLanguage((state) => state.s);
  return (
    <aside className="sheet" aria-label={s.toolbar.shortcuts}>
      <div className="sheet-head">
        <strong>{s.toolbar.shortcuts}</strong>
        <button type="button" onClick={onClose} aria-label={s.settings.close}>
          ✕
        </button>
      </div>

      <div className="sheet-body">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title(s)}>
            <h2 className="sheet-group">{group.title(s)}</h2>
            <dl className="sheet-list">
              {group.entries.map((entry) => (
                <div className="sheet-item" key={entry.keys.join("/")}>
                  <dt>
                    {entry.keys.map((key, index) => (
                      <span key={key}>
                        {index > 0 && <span className="sheet-or"> / </span>}
                        <kbd>{key}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{entry.description(s)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        {/*
         * キーを持たない操作。**載せないと「見つけられない機能」になる。**
         * 押すのは毎回 Ctrl+K なので、キーの欄はそれで揃う
         */}
        <section>
          <h2 className="sheet-group">{s.keys.groupPalette}</h2>
          <dl className="sheet-list">
            {paletteOnlyItems(s).map((item) => (
              <div className="sheet-item" key={item.command}>
                <dt>
                  <kbd>Ctrl + K</kbd>
                </dt>
                <dd>{item.title}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="sheet-note">{s.keys.autosaveNote}</p>
      </div>
    </aside>
  );
}
