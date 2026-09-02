import { useEffect, useRef, useState } from "react";

import type { SearchHit } from "../../state/search.js";

/**
 * サイドバー（F-04 / F-05 / F-06 と F-01 / F-02 / F-03 の入口）。
 *
 * 絞り込みと並べ替えの判断は `src/state/search.ts` にあり、
 * ここは渡された結果を描くだけにしてある。
 *
 * 改名はその場で入力させる。`window.prompt` を使わないのは、
 * モーダルダイアログを削除確認以外に使わないという制約（設計書 7.2）のためである。
 *
 * **新規作成はここに置かない。** 一覧に入力欄を差し込むと既存のマップと見分けが付かず、
 * 狭い欄に下敷きと表題を詰め込むことになっていた。作成は主表示領域で行う（同 7.2）。
 */

/** 一致した場所の種類。なぜ引っ掛かったのかを一言で示す */
const KIND_LABEL: Record<SearchHit["kind"], string> = {
  title: "表題",
  label: "ノード",
  note: "ノート",
};

interface RowInputProps {
  initial: string;
  placeholder: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

/** その場で名前を入れる欄。Enter で確定、Escape で取り消す */
function RowInput({ initial, placeholder, onCommit, onCancel }: RowInputProps): React.JSX.Element {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className="sidebar-input"
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(value);
        if (event.key === "Escape") onCancel();
      }}
      // 別の場所を押したら取り消す。書きかけを黙って確定させない
      onBlur={onCancel}
    />
  );
}

interface Props {
  hits: SearchHit[];
  /** 索引に現れるタグ。多い順 */
  tags: { tag: string; count: number }[];
  activeTags: readonly string[];
  query: string;
  /** 検索語が入っているか。抜粋を出すかの判断に使う */
  searching: boolean;
  openId: string | null;
  /** 索引がまだ1件も無い（＝マップが1つも無い）か */
  empty: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  /** 作成画面を主表示領域に出す */
  onNewMap: () => void;
  onQueryChange: (query: string) => void;
  onToggleTag: (tag: string) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string, title: string) => void;
}

export function Sidebar({
  hits,
  tags,
  activeTags,
  query,
  searching,
  openId,
  empty,
  searchRef,
  onNewMap,
  onQueryChange,
  onToggleTag,
  onOpen,
  onRename,
  onDelete,
}: Props): React.JSX.Element {
  /** 改名中のマップ。null なら改名していない */
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <nav className="sidebar" aria-label="マップ">
      <div className="sidebar-search">
        <input
          ref={searchRef}
          type="search"
          className="sidebar-input"
          value={query}
          placeholder="全マップを検索"
          aria-label="全マップを検索"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      {tags.length > 0 && (
        <div className="sidebar-tags" role="group" aria-label="タグで絞り込む">
          {tags.map(({ tag, count }) => (
            <button
              type="button"
              key={tag}
              className="sidebar-tag"
              aria-pressed={activeTags.includes(tag)}
              onClick={() => onToggleTag(tag)}
            >
              #{tag}
              <span className="sidebar-tag-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sidebar-list">
        {hits.length === 0 && (
          <p className="sidebar-empty">
            {empty ? "まだマップがありません。" : "条件に合うマップはありません。"}
          </p>
        )}

        {hits.map((hit) =>
          renaming === hit.id ? (
            <RowInput
              key={hit.id}
              initial={hit.title}
              placeholder="新しい表題"
              onCommit={(value) => {
                setRenaming(null);
                onRename(hit.id, value);
              }}
              onCancel={() => setRenaming(null)}
            />
          ) : (
            <div key={hit.id} className={`sidebar-row${hit.id === openId ? " is-open" : ""}`}>
              <button type="button" className="sidebar-open" onClick={() => onOpen(hit.id)}>
                <span className="sidebar-title">{hit.title}</span>
                {searching && hit.excerpt !== "" ? (
                  <span className="sidebar-excerpt">
                    <span className="sidebar-kind">{KIND_LABEL[hit.kind]}</span>
                    {hit.excerpt}
                  </span>
                ) : (
                  hit.updated !== "" && (
                    <span className="sidebar-date">
                      {new Date(hit.updated).toLocaleDateString("ja-JP")}
                    </span>
                  )
                )}
              </button>
              <span className="sidebar-actions">
                <button
                  type="button"
                  title="名前を変える"
                  aria-label={`${hit.title} の名前を変える`}
                  onClick={() => setRenaming(hit.id)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  title="削除する"
                  aria-label={`${hit.title} を削除する`}
                  onClick={() => onDelete(hit.id, hit.title)}
                >
                  ✕
                </button>
              </span>
            </div>
          ),
        )}
      </div>

      <button type="button" className="sidebar-new" onClick={onNewMap}>
        ＋ 新規作成
      </button>
    </nav>
  );
}
