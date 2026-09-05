import { useEffect, useRef, useState } from "react";

import type { Template } from "../state/templates.js";
import { Wordmark } from "./Wordmark.js";

/**
 * マップを開いていないときの主表示領域（F-01 / F-36 / 2.5-4〜2.5-6）。
 *
 * ホーム（何ができる道具か）と新規作成を1つの画面に置く。
 * サイドバーの一覧に入力欄を差し込む方式をやめた理由は設計書 7.2 にある。
 * 既存のマップと見分けが付かず、狭い欄に下敷きの選択と表題の入力を詰め込んでいた。
 * モーダルは削除確認以外で使わない（原則4）ので、空いている主表示領域に出す。
 */

interface Props {
  /** 作成の入力を出しているか */
  creating: boolean;
  /** 既にマップを持っているか。初回かどうかで言うことが変わる */
  hasMaps: boolean;
  templates: Template[];
  templateId: string;
  onTemplateChange: (id: string) => void;
  onStartCreating: () => void;
  onCancelCreating: () => void;
  onCreate: (title: string) => void;
  onCopyImportPrompt: () => void;
}

const DEFAULT_TITLE = "新しいマップ";

/** 表題と下敷きを決める。ここだけで作成が完結する */
function CreateForm({
  templates,
  templateId,
  onTemplateChange,
  onCancelCreating,
  onCreate,
  onCopyImportPrompt,
}: Pick<
  Props,
  | "templates"
  | "templateId"
  | "onTemplateChange"
  | "onCancelCreating"
  | "onCreate"
  | "onCopyImportPrompt"
>): React.JSX.Element {
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const ref = useRef<HTMLInputElement>(null);

  // 開いたらすぐ書き始められるようにする。
  // select() だけでは入力位置が移らないので focus() と対で呼ぶ
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <form
      className="home-create"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = title.trim();
        onCreate(trimmed === "" ? DEFAULT_TITLE : trimmed);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancelCreating();
      }}
    >
      <h2>新しいマップを作る</h2>

      <label className="home-field">
        <span className="home-field-label">中心テーマ</span>
        <input
          ref={ref}
          className="home-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <div className="home-field" role="radiogroup" aria-label="下敷き">
        <span className="home-field-label">下敷き</span>
        <div className="home-templates">
          {templates.map((template) => (
            <button
              type="button"
              key={template.id}
              role="radio"
              aria-checked={template.id === templateId}
              className="home-template"
              onClick={() => onTemplateChange(template.id)}
            >
              <span className="home-template-name">{template.name}</span>
              <span className="home-template-desc">{template.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="home-actions">
        <button type="submit" className="primary">
          作成する
        </button>
        <button type="button" onClick={onCancelCreating}>
          やめる
        </button>
      </div>

      <p className="home-note">
        表題はファイル名になります。<kbd>Enter</kbd> で作成、<kbd>Esc</kbd> でやめます。
      </p>

      {/*
       * 別の AI で整理してから持ち込む道もここで示す。
       * 「何を書けばいいか分からない」状態で開くのがこの画面だからである
       */}
      <div className="home-aside">
        <span className="home-field-label">AI で整理したものを取り込むなら</span>
        <p className="home-note">
          Mieru が読める Markdown を書かせる指示文をコピーします。 AI の返事をそのまま .md
          として置けば、このアプリで開けます。
        </p>
        <div className="home-actions">
          <button type="button" onClick={onCopyImportPrompt}>
            取り込み指示をコピー
          </button>
        </div>
      </div>
    </form>
  );
}

export function HomeScreen({
  creating,
  hasMaps,
  templates,
  templateId,
  onTemplateChange,
  onStartCreating,
  onCancelCreating,
  onCreate,
  onCopyImportPrompt,
}: Props): React.JSX.Element {
  if (creating) {
    return (
      <div className="home">
        <CreateForm
          templates={templates}
          templateId={templateId}
          onTemplateChange={onTemplateChange}
          onCancelCreating={onCancelCreating}
          onCreate={onCreate}
          onCopyImportPrompt={onCopyImportPrompt}
        />
      </div>
    );
  }

  return (
    <div className="home">
      <div className="home-head">
        <h1 className="home-title">
          {/* 見出しの中身がロゴなので、読み上げ名はロゴ側が持つ */}
          <Wordmark />
        </h1>
        <p className="home-lead">考えを整理し、そのまま AI に渡せるマインドマップ。</p>
      </div>

      <div className="home-actions">
        <button type="button" className="primary" onClick={onStartCreating}>
          新規作成
        </button>
        {hasMaps && <span className="home-note">左の一覧からも開けます。</span>}
      </div>

      <section className="home-section">
        <h2>使い方</h2>
        <dl className="home-steps">
          <div>
            <dt>枝を伸ばす</dt>
            <dd>
              <kbd>Tab</kbd> で子、<kbd>Enter</kbd> で兄弟。<kbd>?</kbd> で一覧が出ます。
            </dd>
          </div>
          <div>
            <dt>保存する</dt>
            <dd>保存ボタンはありません。入力が止まって 0.8 秒で .md に書き込みます。</dd>
          </div>
          <div>
            <dt>AI へ渡す</dt>
            <dd>
              ツールバーの「テキスト出力」、または <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>{" "}
              でコピーします。
            </dd>
          </div>
        </dl>
      </section>

      <section className="home-section">
        <h2>AI で整理したものを取り込む</h2>
        <p className="home-note">
          Mieru が読める Markdown を書かせるための指示文をコピーします。 AI の返事をそのまま .md
          として置けば、このアプリで開けます。
        </p>
        <div className="home-actions">
          <button type="button" onClick={onCopyImportPrompt}>
            取り込み指示をコピー
          </button>
        </div>
      </section>
    </div>
  );
}
