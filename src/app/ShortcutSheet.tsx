import { useLanguage } from "../state/i18n.js";
import { SHORTCUT_GROUPS } from "./shortcuts.js";

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

        <p className="sheet-note">
          保存ボタンはありません。入力が止まって 0.8 秒で自動保存し、状態は下のバーに出ます。
        </p>
      </div>
    </aside>
  );
}
