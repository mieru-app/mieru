import { useEffect, useState } from "react";

import type { MapNode } from "../../core/types.js";
import { EMOJI_GROUPS } from "./emoji.js";

/**
 * ノートパネル。
 *
 * ラベル（短いキーワード）とノート（説明文）の2層構造の後者を編集する（原則5）。
 * 選択中のノードがあるときだけ表示し、常時表示はしない（設計書 7.2）。
 *
 * 絵文字（F-15）と横断リンク（F-17）もここに置く。どちらも
 * 「選択中のノードに何かを足す」操作であり、置き場所を分ける理由が無い。
 */

interface Props {
  node: MapNode;
  /** 同じマップにある他のノードのラベル。横断リンクの候補になる */
  linkCandidates: string[];
  onChange: (note: string) => void;
  onChangeEmoji: (emoji: string) => void;
  onAddLink: (label: string) => void;
  /**
   * 閉じる手段。狭い画面ではノート欄が主表示に重なるため要る。
   * 広い画面では列として並ぶので渡らない（`App.tsx`）
   */
  onClose?: (() => void) | undefined;
}

export function NotePanel({
  node,
  linkCandidates,
  onChange,
  onChangeEmoji,
  onAddLink,
  onClose,
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState(node.note ?? "");
  const [showEmoji, setShowEmoji] = useState(false);

  // 選択が変わったら編集中の内容を選択先のものに入れ替える
  useEffect(() => {
    setDraft(node.note ?? "");
  }, [node.uid, node.note]);

  return (
    <aside className="notepanel">
      <div className="notepanel-head">
        <span className="notepanel-label">
          {node.label === "" ? "（無題のノード）" : node.label}
        </span>
        <button
          type="button"
          className="notepanel-emoji"
          aria-pressed={showEmoji}
          aria-label="絵文字を選ぶ"
          onClick={() => setShowEmoji((open) => !open)}
        >
          {node.emoji ?? "＋"}
        </button>
        {onClose !== undefined && (
          <button type="button" className="notepanel-close" aria-label="ノートを閉じる" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {showEmoji && (
        <div className="emoji-picker">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.title} className="emoji-group">
              <span className="emoji-group-title">{group.title}</span>
              <div className="emoji-row">
                {group.emoji.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    aria-pressed={node.emoji === emoji}
                    onClick={() => {
                      onChangeEmoji(node.emoji === emoji ? "" : emoji);
                      setShowEmoji(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="emoji-clear"
            disabled={node.emoji === undefined}
            onClick={() => {
              onChangeEmoji("");
              setShowEmoji(false);
            }}
          >
            絵文字を外す
          </button>
        </div>
      )}

      {/*
       * 名前は見出しとして常に出す。プレースホルダは書き始めると消えるため、
       * 何を書く欄なのかが入力後に分からなくなる。
       * 「AI へ渡すときに本文段落として展開されます」という説明は外した。
       * 動きの説明であって、書く前に読んで役立つものではなかった
       */}
      <label className="notepanel-hint notepanel-note-label" htmlFor="node-note">
        ノード説明
      </label>
      <textarea
        id="node-note"
        className="notepanel-input"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
      />

      <div className="notepanel-links">
        <label className="notepanel-hint" htmlFor="link-target">
          横断リンク
        </label>
        {node.links.length > 0 && (
          <ul className="link-list">
            {node.links.map((link) => (
              <li key={link} className={linkCandidates.includes(link) ? "" : "is-unresolved"}>
                [[{link}]]
                {!linkCandidates.includes(link) && <span className="link-note">宛先なし</span>}
              </li>
            ))}
          </ul>
        )}
        <select
          id="link-target"
          className="sidebar-input"
          value=""
          disabled={linkCandidates.length === 0}
          onChange={(event) => {
            if (event.target.value !== "") onAddLink(event.target.value);
          }}
        >
          <option value="">つなぐノードを選ぶ…</option>
          {linkCandidates.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
