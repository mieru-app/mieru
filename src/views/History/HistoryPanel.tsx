import { useLanguage } from "../../state/i18n.js";
import { useEffect, useState } from "react";

import { countChanges, diffLines } from "../../state/diff.js";
import type { HistoryEntry } from "../../store/types.js";

/**
 * 履歴パネル（2.8-4、設計書 F-07・8.8）。
 *
 * **一覧だけでは戻す判断ができない。** 「14:32 の版」と言われても、それが枝を
 * 消す前なのか後なのかは中身を見るまで分からない。版を選んだら、必ず今の内容との
 * 差分をその場に出す。
 *
 * 差分の計算は `src/state/diff.ts`、控えの読み書きは `HistoryStore` にあり、
 * ここは選ばせて描くだけにする。
 */

interface Props {
  /** 新しい順に並んだ版 */
  entries: readonly HistoryEntry[];
  /** 読み込み中か。控えの読み出しは非同期である */
  loading: boolean;
  /** 履歴を持つ保存先か */
  available: boolean;
  /** 今の内容。差分の右側になる */
  current: string;
  /** 選んだ版の本文を読む */
  onRead: (entryId: string) => Promise<string | null>;
  /** 版の中身を今の内容にする */
  onRestore: (entryId: string) => void;
  onClose: () => void;
}

/** 「14:32」まで。日付が今日でなければ日付から出す */
function stamp(at: number): string {
  const date = new Date(at);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })} ${time}`;
}

export function HistoryPanel({
  entries,
  loading,
  available,
  current,
  onRead,
  onRestore,
  onClose,
}: Props): React.JSX.Element {
  const s = useLanguage((state) => state.s);
  const [selected, setSelected] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);

  // 選ばれている版が一覧から消えたら（別のマップを開いた等）選択を外す
  useEffect(() => {
    if (selected !== null && !entries.some((entry) => entry.id === selected)) {
      setSelected(null);
      setBody(null);
    }
  }, [entries, selected]);

  useEffect(() => {
    if (selected === null) return;
    let alive = true;
    void onRead(selected).then((md) => {
      if (alive) setBody(md);
    });
    return () => {
      alive = false;
    };
  }, [selected, onRead]);

  const lines = body === null ? null : diffLines(body, current);
  const changes = lines === null ? null : countChanges(lines);

  return (
    <aside className="sheet" aria-label={s.history.title}>
      <div className="sheet-head">
        <strong>{s.history.title}</strong>
        <button type="button" aria-label={s.history.close} onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="sheet-body">
        {!available ? (
          <p className="sheet-note">{s.history.unavailable}</p>
        ) : loading ? (
          <p className="sheet-note">{s.history.loading}</p>
        ) : entries.length === 0 ? (
          /*
           * **版の作られ方は保存先で違う**（設計書 8.8）。ローカルフォルダは
           * 5分に1版、GitHub は保存1回がコミット1つである。ここで片方の
           * 刻み方を名指しすると、もう片方の利用者には合わない案内になる
           */
          <p className="sheet-note">{s.history.empty}</p>
        ) : (
          <>
            <ul className="history-list">
              {entries.map((entry, index) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-pressed={selected === entry.id}
                    onClick={() => setSelected(entry.id)}
                  >
                    <span className="history-when">{stamp(entry.at)}</span>
                    {/*
                     * 先頭が最も新しい。どれが直前かを名前で示す。
                     * 大きさは分かる保存先だけが持つ（GitHub は返さない）
                     */}
                    <span className="history-note">
                      {index === 0
                        ? s.history.latest
                        : entry.size === undefined
                          ? ""
                          : s.history.bytes(entry.size)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {selected === null ? (
              <p className="sheet-note" />
            ) : body === null ? (
              <p className="sheet-note">{s.history.loading}</p>
            ) : (
              <>
                <p className="history-summary">
                  {s.history.summary(changes?.added ?? 0, changes?.removed ?? 0)}
                </p>
                <div className="history-diff" aria-label={s.history.diff}>
                  {(lines ?? []).map((line, at) => (
                    <div key={`${String(at)}:${line.kind}`} className={`is-${line.kind}`}>
                      <span className="history-mark" aria-hidden="true">
                        {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}
                      </span>
                      {line.text}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="sheet-foot">
        {/*
         * 戻すのは枝とノートと折り畳みだけで、表題とタグは今のものが残る（設計書 8.8.3）。
         * 保存先へは直接書き戻さないので、Ctrl+Z で取り消せる
         */}
        <button
          type="button"
          className="primary"
          disabled={selected === null || body === null}
          onClick={() => {
            if (selected !== null) onRestore(selected);
          }}
        >
          {s.history.restore}
        </button>
      </div>
    </aside>
  );
}
