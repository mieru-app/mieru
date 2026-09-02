# Mieru — プロジェクト規約

考えを整理し、そのまま AI に渡せるマインドマップツール。
設計の正本は `docs/design.md`、計画の正本は `docs/project-plan.md`。
構造に関わる判断をする前に、該当箇所を読んで根拠を確認すること。

## 現在地

**Phase 2 は配信まで完了し、実利用に入っている。次は Phase 2.5（言葉と導線）。**
フェーズ定義と完了条件は `docs/project-plan.md` の3〜4章。改修要望への対応は
同 Phase 2.5〜2.10（2026-09-02 追加）。

**Phase 3（AWS同期）は見送りが決定している。** `GitHubStore`（Phase 2.6）で保存先を
確保すれば、主目的だったスマートフォン対応（同 2.7）が AWS 無しで成立するため。
**利用者の指示なく Phase 3 のタスクに着手しないこと。**

**IMPORTANT: Phase 1・2 の DoD には未達項目が残る。** 机上で埋められないものに偏っている。

- Phase 1: 実データで2週間使用し、ファイル破損・内容変質が0件
- Phase 2: 性能要件 NF-01 / NF-02 / NF-03（`docs/perf-report.md` の3章）
- PWA インストールとオフライン動作は 2026-09-02 に達成済み

計画（第5章）はマイルストーン間に必ず実利用期間を挟むと定めている。

**要望を実装に落とす前に、前提を実測すること。** Phase 2.5〜2.10 の起案時、「表が消える」
「記法が扱えない」という要望の前提が2件とも誤りだった（実際には往復している）。
`parse` → `serialize` を通せば数分で分かる。詳細は計画書「着手前に実測した事実」。

決定済み: 名称 **Mieru**（設計書 12.5）／アイコン **「放射する光条」**（同 12.6、`assets/icon/generate.mjs` で生成）／
配信 **GitHub Pages**・独自ドメインなし（同 8.6）。公開先は https://kyritk.github.io/mieru/ 。
変換警告は**表示しない**と決定した（同 11章。利用者が1人のため）。
未決: テンプレート（2-10）の中身、全文検索（2-3）の想定規模、引用とコードブロックの逐語保持（Phase 2.10）。

## コマンド

| 用途 | コマンド |
|---|---|
| 開発サーバ | `npm run dev` |
| 本番ビルド | `npm run build`（型検査を伴う） |
| 型検査 | `npm run typecheck` |
| Lint | `npm run lint` / `npm run lint:fix` |
| 整形 | `npm run format`（Markdown は対象外） |
| テスト（全体） | `npm test` |
| テスト（変換エンジンのみ） | `npm run test:core` |
| カバレッジ | `npm run test:coverage`（90% 未満で失敗する） |
| 性能実測 | `npm run perf`（`npm test` には含めない。結果は `docs/perf-report.md`） |
| 監視実行 | `npm run test:watch` |
| アイコン生成 | `node assets/icon/generate.mjs`（`public/icons/` へ書き出す。dev / build が自動実行） |

一連の変更を終えたら `npm run typecheck` と `npm test` を実行し、**その出力を示してから完了を報告する**。

## 破ってはいけない不変条件

1. **Markdown が保存形式である。** 独自形式や JSON でマップを保存しない
2. **表示状態は frontmatter の `mm:` 配下にのみ書く。** 折り畳み・配色・座標を本文に書き込まない
3. **UI 層は `MapStore` 経由でのみ永続化する。** File System Access API や AWS SDK を `src/views/`・`src/features/` から直接呼ばない
4. **`mind-elixir` を import してよいのは `src/views/Canvas/` のみ。** 他所から直接使わない
5. **ラウンドトリップの強保証を壊さない。** 正規化 Markdown → モデル → Markdown はバイト単位で一致する

これらは `docs/design.md` 3章の設計原則1〜5に対応する。変更したくなった場合は、実装より先に `docs/design.md` を更新して合意を取ること。

## 層の分け方

| 場所 | 役割 | 自動テスト |
|---|---|---|
| `src/core/` | Markdown とモデルの相互変換 | あり（プロパティテスト含む） |
| `src/store/` | `MapStore` と実装。永続化に触れるのはここまで | あり（FSA と IndexedDB の偽物を使う） |
| `src/state/` | 編集ロジック・状態・自動保存。React にも mind-elixir にも依存しない | あり |
| `src/app/` `src/views/` | React の描画と入力 | なし（手動試験） |

例外として `src/app/keymap.ts`・`shortcuts.ts`・`command-palette.ts` は自動テストを持つ。
キー割り当てとその表示は「一覧が嘘をつくと復帰手段が無くなる」種類の情報であり、
描画ではなく判断だからである。

**描画層に判断を書かない。** 「このキーで何が起きるか」「保存すべきか」といった判断は
`src/state/` に置き、描画層はそれを呼ぶだけにする。UI を自動テストしない方針を採る以上、
判断が描画層に漏れた分だけ検証できない領域が増える。

## スコープ

新機能を実装する前に `docs/design.md` 2.2「対象外」を確認する。
そこに挙がっているもの（複数人の共同編集、画像埋め込み、自由配置キャンバス、AI による自動マップ生成など）は実装しない。
機能追加の是非は「設計原則1〜5に反しないか」で判断する。

## 依存関係

- `mind-elixir` は **5.15.1 に固定**する。npm の `latest` タグが prerelease（6.0.0-next）を指しているため、`npm install mind-elixir` で更新してはいけない
- **`remark-gfm` を入れてはいけない。** 現在パイプ表記の表は「表」ではなく段落として解析され、ノートに逐語で格納されてバイト単位で往復している。GFM 拡張を足すと表が `table` ノードになり、**変換不可要素として破棄されるようになる**（設計書 6.3）。表を扱いたくなった場合でも入れない
- 依存の追加は最小限に留める。追加する場合は理由を述べてから入れる

## コードとドキュメント

- コメント・ドキュメント・コミットメッセージは日本語。識別子・型名・ファイル名は英語
- TypeScript は `strict: true` と `noUncheckedIndexedAccess: true` を前提に書く
- 設計に影響する変更をしたら、同じコミットで `docs/design.md` も更新する

## Git

- ブランチは `main`。改行は LF（`.gitattributes` で強制済み）
- コミットメッセージは `docs:` `feat:` `fix:` `test:` `chore:` のいずれかを接頭辞にし、要約は日本語で書く
- コミット前に `npm run lint` と `npm test` を通す
- 指示がない限り push しない
