import { useLanguage } from "../state/i18n.js";
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
  templates: Template[];
  templateId: string;
  onTemplateChange: (id: string) => void;
  onStartCreating: () => void;
  onCancelCreating: () => void;
  onCreate: (title: string) => void;
  onCopyImportPrompt: () => void;
}

const DEFAULT_TITLE = "New Document";

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
  const s = useLanguage((state) => state.s);
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
      <h2>{s.home.create}</h2>

      <label className="home-field">
        <span className="home-field-label">{s.home.fileName}</span>
        {/* 拡張子は付け外しできないので、入力欄の外に添えて既成事実として見せる */}
        <span className="home-input-row">
          <input
            ref={ref}
            className="home-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <span className="home-input-suffix">.md</span>
        </span>
      </label>

      <div className="home-field" role="radiogroup" aria-label={s.home.template}>
        <span className="home-field-label">{s.home.template}</span>
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
              <span className="home-template-name">{template.name(s)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="home-actions">
        {/*
         * **「やめる」を置かない**（2.12）。Esc で閉じられ、
         * 一覧から別のマップを選んでも抜けられる（`App.tsx`）
         */}
        <button type="submit" className="primary">
          {s.home.submit}
        </button>
      </div>

      {/*
       * 別の AI で整理してから持ち込む道もここで示す。
       * 「何を書けばいいか分からない」状態で開くのがこの画面だからである。
       * **説明文は置かない。** 何が起きるかはボタンの字で言い切れる
       */}
      <div className="home-aside">
        <div className="home-actions">
          <button type="button" onClick={onCopyImportPrompt}>
            {s.home.importPrompt}
          </button>
        </div>
      </div>
    </form>
  );
}

export function HomeScreen({
  creating,
  templates,
  templateId,
  onTemplateChange,
  onStartCreating,
  onCancelCreating,
  onCreate,
  onCopyImportPrompt,
}: Props): React.JSX.Element {
  const s = useLanguage((state) => state.s);
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
      </div>

      <div className="home-actions">
        <button type="button" className="primary" onClick={onStartCreating}>
          {s.home.create}
        </button>
      </div>

      {/*
       * **説明の節を置かない**（2.12）。ここは毎回戻ってくる場所であり、
       * 初回しか読まれない文が居座ると、押すもの（新規作成と一覧）が埋もれる。
       * キー操作の正本は `?` の一覧で、写しを置くと二重管理になる（原則3）
       */}
      <div className="home-actions">
        <button type="button" onClick={onCopyImportPrompt}>
          {s.home.importPrompt}
        </button>
      </div>
    </div>
  );
}
