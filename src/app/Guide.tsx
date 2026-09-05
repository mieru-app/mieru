import { useLanguage } from "../state/i18n.js";

/**
 * 何をすればよいかを、その場に出す。
 *
 * キーボードで完結する道具は、操作を知らないと1手も進めない。
 * 「使い方が分からない」は利用者の問題ではなく作りの問題として扱う（原則4）。
 *
 * マップを開いていないときの案内は HomeScreen へ移した（設計書 7.2）。
 */

/** マップは開いたが、まだ枝が1本も無いとき */
export function FirstBranchGuide(): React.JSX.Element {
  const s = useLanguage((state) => state.s);
  return (
    <div className="guide guide-overlay">
      <h2>{s.guide.title}</h2>
      <dl className="guide-keys">
        <div>
          <dt>
            <kbd>Tab</kbd>
          </dt>
          <dd>{s.guide.addChild}</dd>
        </div>
        <div>
          <dt>
            <kbd>Enter</kbd>
          </dt>
          <dd>{s.guide.addSibling}</dd>
        </div>
        <div>
          <dt>
            <kbd>Space</kbd>
          </dt>
          <dd>{s.guide.rename}</dd>
        </div>
      </dl>
      <p className="guide-note">
        <kbd>?</kbd> {s.guide.more}
      </p>
    </div>
  );
}
