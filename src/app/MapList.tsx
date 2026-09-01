import type { MapMeta } from "../core/types.js";

/**
 * マップ一覧。Phase 2 のサイドバー（検索・タグ絞り込み）の前身であり、
 * Phase 1 では「開く」「作る」だけを担う。
 */

interface Props {
  maps: MapMeta[];
  openId: string | null;
  onOpen: (id: string) => void;
}

export function MapList({ maps, openId, onOpen }: Props): React.JSX.Element {
  return (
    <nav className="maplist" aria-label="マップ一覧">
      {maps.length === 0 && <p className="maplist-empty">まだマップがありません。</p>}
      {maps.map((meta) => (
        <button
          type="button"
          key={meta.id}
          className={`maplist-item${meta.id === openId ? " is-open" : ""}`}
          onClick={() => onOpen(meta.id)}
        >
          <span className="maplist-title">{meta.title === "" ? meta.id : meta.title}</span>
          {meta.updated !== "" && (
            <span className="maplist-date">
              {new Date(meta.updated).toLocaleDateString("ja-JP")}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
