import { useLanguage } from "../state/i18n.js";
import { Component } from "react";

import { serializeMarkdown } from "../core/serialize.js";
import { useEditor } from "../state/editor.js";

/**
 * 描画中の例外を受け止める。
 *
 * **IMPORTANT: これが無いと、例外1つで画面が真っ白になる。**
 * 2026-09-04 の実利用で「頻繁に落ちる」と報告があり、何が起きたのか
 * 誰にも分からない状態だった。原因を突き止める前に、**まず見えるようにする。**
 *
 * ここが持つ役割は2つある。
 *
 * - **何が起きたかを画面に出す。** 写して渡せる形にしておく
 * - **書きかけを取り出せるようにする。** 自動保存の前に落ちた場合、
 *   ここで写せなければ書いたものが失われる
 *
 * 落ちた後の状態で描き直すと同じ例外を繰り返すので、再描画は試みない。
 */

interface State {
  error: Error | null;
  /** 写した直後の合図。押した手応えが無いと二度押しされる */
  copied: "md" | "error" | null;
}

/** いま開いているマップを Markdown にする。落ちた後なので失敗も想定する */
function currentMarkdown(): string | null {
  try {
    const doc = useEditor.getState().buildDoc();
    return doc === null ? null : serializeMarkdown(doc);
  } catch {
    return null;
  }
}

function describe(error: Error): string {
  return [
    `${error.name}: ${error.message}`,
    "",
    error.stack ?? useLanguage.getState().s.crash.noStack,
    "",
    `URL: ${location.href}`,
    `UA: ${navigator.userAgent}`,
  ].join("\n");
}

export class ErrorScreen extends Component<{ children: React.ReactNode }, State> {
  override state: State = { error: null, copied: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown): void {
    // 開発中は握り潰さない。console に出しておくと発生箇所まで辿れる
    console.error("描画中に例外が出た", error);
  }

  private copy(what: "md" | "error", text: string): void {
    void navigator.clipboard
      .writeText(text)
      .then(() => this.setState({ copied: what }))
      .catch(() => undefined);
  }

  override render(): React.ReactNode {
    const { error, copied } = this.state;
    if (error === null) return this.props.children;

    const md = currentMarkdown();
    const report = describe(error);
    /*
     * **フックではなくストアを直に読む。** ここはクラス部品であり、
     * かつ例外の後に描かれる。**フックの規則に依存しない方が安全である**
     */
    const s = useLanguage.getState().s;

    return (
      <div className="crash">
        <h1 className="crash-title">{s.crash.title}</h1>
        <p className="crash-lead">
          {s.crash.safe}
          {md === null ? s.crash.lost : s.crash.recoverable}
        </p>

        <div className="crash-actions">
          <button type="button" onClick={() => location.reload()}>
            {s.crash.reload}
          </button>
          <button type="button" disabled={md === null} onClick={() => this.copy("md", md ?? "")}>
            {copied === "md" ? s.crash.copied : s.crash.copyDraft}
          </button>
          <button type="button" onClick={() => this.copy("error", report)}>
            {copied === "error" ? s.crash.copied : s.crash.copyError}
          </button>
        </div>

        {/* 開いた状態で出す。畳むと「エラーを写す」が何を写すのか分からない */}
        <pre className="crash-detail">{report}</pre>
      </div>
    );
  }
}
