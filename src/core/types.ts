/**
 * マインドマップの内部データモデル。
 *
 * このモデルは Markdown から導出される派生物であり、その逆ではない（設計原則1）。
 * 保存される実体は常に Markdown 文字列であり、ここで定義する型は
 * 編集中にメモリ上で扱うための表現にすぎない。
 *
 * 仕様の正本: docs/design.md 6.2
 */

/**
 * 表示状態。
 *
 * Markdown 本文には一切出力せず、frontmatter の `mm:` 配下にのみ保存する（設計原則2）。
 * AI に渡す本文を制御情報で汚さないための隔離である。
 */
export interface ViewState {
  /** 折り畳み中ノードの構造パス。例: ["1.0", "2.1"] */
  collapsed: string[];
  /** ブランチ配色。"auto" はブランチ順に既定パレットを適用する */
  colors: "auto" | string[];
}

/**
 * 一覧表示に必要な軽量メタ情報。
 * MapStore.list() は本文を読まずにこれだけを返せなければならない。
 */
export interface MapMeta {
  /** ストア内での識別子。ローカルはファイル名、S3 はオブジェクトキー */
  id: string;
  title: string;
  tags: string[];
  /** ISO8601 (UTC) */
  created: string;
  /** ISO8601 (UTC) */
  updated: string;
  /** 楽観ロック用。ローカルは更新日時、S3 は ETag */
  version: string;
}

/**
 * マップを構成するノード。
 *
 * ラベル（短いキーワード）とノート（任意の説明文）の2層構造をとる（設計原則5）。
 * キャンバス上には label のみを表示し、note は Markdown 出力時に本文段落として展開される。
 */
export interface MapNode {
  /**
   * セッション内でのみ有効な一時 ID。
   * 永続化してはいけない。Markdown 本文にノード ID を書き込まないため（設計原則2）。
   */
  uid: string;
  /**
   * 構造から導出されるパス ID。例: "1.0.2"（第1ブランチの第0子の第2子）。
   * ルートは空文字列。折り畳み状態の記録にのみ使用する。
   */
  path: string;
  /** 1〜3語のキーワードを推奨。インライン記法は解釈せずそのまま保持する */
  label: string;
  /** 絵文字1文字 */
  emoji?: string;
  /** 複数行可。AI 出力時に本文段落として展開される */
  note?: string;
  /** 横断リンク先のラベル。`[[Y]]` から収集するが label からは除去しない */
  links: string[];
  children: MapNode[];
}

/** マップ1件の完全な表現。1つの `.md` ファイルに1対1で対応する */
export interface MapDoc {
  meta: MapMeta;
  /** 中心テーマ。Markdown の H1 に対応する */
  root: MapNode;
  view: ViewState;
}

/**
 * 解析時に検出した問題。
 *
 * 変換不可能な要素を破棄する場合は、黙って捨てず必ずこれを呼び出し側へ返す。
 * UI は保存前に破棄される内容を提示して確認を取る（docs/design.md 11章）。
 */
export interface ParseWarning {
  kind:
    /** 箇条書き・見出し・段落以外の要素を破棄した */
    | "unsupported-element"
    /** H1 が2つ以上あったため2つ目以降を第1階層として扱った */
    | "multiple-h1"
    /** H1 が無かったため frontmatter の title などから補完した */
    | "missing-h1"
    /** frontmatter が YAML として解釈できなかったため既定値を使った */
    | "invalid-frontmatter";
  message: string;
  /** 1 始まりの行番号。位置を特定できない場合は省略する */
  line?: number;
}

export interface ParseResult {
  doc: MapDoc;
  warnings: ParseWarning[];
}

/** ViewState の既定値 */
export const DEFAULT_VIEW_STATE: ViewState = {
  collapsed: [],
  colors: "auto",
};
