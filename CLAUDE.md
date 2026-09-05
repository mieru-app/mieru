# Mieru — プロジェクト規約

考えを整理し、そのまま AI に渡せるマインドマップツール。

## 正本の場所

**同じことを2箇所に書かない。** 迷ったらここから辿る。

| 知りたいこと | 見る場所 |
|---|---|
| 設計全般 | [`docs/design.md`](docs/design.md)（索引）→ `docs/design/` |
| **迷ったときの判断基準** | [`docs/design/principles.md`](docs/design/principles.md) |
| **いまどこにいるか・次に何をするか** | [`docs/human-review/roadmap.md`](docs/human-review/roadmap.md) |
| 全体像を人に説明する | [`docs/human-review/architecture.md`](docs/human-review/architecture.md) |
| なぜそう決めたかの記録 | `docs/ideas/`（**正本ではない。書かれた時点の事実**） |
| 層ごとの細則 | `.claude/rules/*.md`（該当パスを触ると自動で読み込まれる） |
| 文書の作り方 | [`.steering/documentation.md`](.steering/documentation.md) |

**現在地をこのファイルに書かない。** ロードマップとずれる。

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
| 性能実測 | `npm run perf`（`npm test` には含めない。結果は `docs/human-review/perf-report.md`） |
| 監視実行 | `npm run test:watch` |
| アイコン生成 | `node assets/icon/generate.mjs`（dev / build が自動実行） |

一連の変更を終えたら `npm run typecheck` と `npm test` を実行し、
**その出力を示してから完了を報告する**。
**`npm test` の出力は末尾だけを見ずに保存すること**（理由は `docs/design/testing.md`）。

## 破ってはいけない不変条件

**5つある。正本は [`docs/design/principles.md`](docs/design/principles.md)。**
変更したくなった場合は、実装より先にそちらを更新して合意を取る。

1. Markdown が保存形式である
2. 表示状態は frontmatter の `mm:` 配下にのみ書く
3. UI 層は `MapStore` 経由でのみ永続化する
4. `mind-elixir` を import してよいのは `src/views/Canvas/` のみ
5. ラウンドトリップの強保証を壊さない

**描画層に判断を書かない。** 判断は `src/state/` に置き、描画層はそれを呼ぶだけにする。
`src/app/` と `src/views/` は自動テストを持たないため、
**判断が漏れた分だけ検証できない領域が増える。**

## やってはいけないこと

- **`remark-gfm` を入れてはいけない。** いま表は段落として解析され、ノートに逐語で入って
  バイト単位で往復している。GFM を足すと表が `table` ノードになり**破棄されるようになる**。
  表を扱いたくなった場合でも入れない
- **`mind-elixir` は 5.15.1 に固定する。** npm の `latest` が prerelease（6.0.0-next）を
  指しているため、`npm install mind-elixir` で更新してはいけない
- **第三者のスクリプト・フォント・解析ツールを読み込まない。** 他人のトークンを預かる以上、
  外部リソースは持ち出し口になる。CSP で強制済みで、通信先は `api.github.com` だけである。
  別の接続先が要るときは、CSP を緩める前に「本当にブラウザから直接通信する必要があるか」を先に問う
- **`mieru-app` に Mieru 以外を公開してはいけない**（NF-44）。同一オリジンから保管庫が読める
- **トークン文字列を持つのは `src/store/github-auth.ts` だけにする。** 表示・記録には
  `describeCredential()` を使う。**資格情報をそのまま `console.log` へ渡すと漏れる**
- 依存の追加は最小限に留める。追加する場合は理由を述べてから入れる
- **利用者の指示なく、見送り中の Phase 3（AWS 同期）に着手しない**

## 進め方

- **要望を実装に落とす前に、前提を実測する。** Phase 2.5 の起案時、要望の前提が2件とも
  誤っていた（`parse` → `serialize` を通せば数分で分かった）
- **「実装した」を「できた」と報告しない。** `src/app/` と `src/views/` は自動テストを
  持たないので、机上では確かめられない。判断は `src/state/` へ出して検証し、残りは実機で通す
- **描画層の不具合を、コードを読むだけで直そうとしない。** 先にブラウザで実測する
- **いまは実利用期間である。** 使ってみて出たことを、次の工程より優先する

## コードとドキュメント

- コメント・ドキュメント・コミットメッセージは日本語。識別子・型名・ファイル名は英語
- TypeScript は `strict: true` と `noUncheckedIndexedAccess: true` を前提に書く
- 設計に影響する変更をしたら、同じコミットで `docs/design/` も更新する
- **文書を作る・直す前に [`.steering/documentation.md`](.steering/documentation.md) を読む**

## Git

- ブランチは `main`。改行は LF（`.gitattributes` で強制済み）
- **`main` は保護されている。** 直接 push できない。ブランチを切って Pull Request を出す
- **`git commit -s` で署名する（DCO）。** 署名の無いコミットは CI が弾く。
  理由は `CONTRIBUTING.md`、全文は直下の `DCO`
- コミットメッセージは `docs:` `feat:` `fix:` `test:` `chore:` のいずれかを接頭辞にし、要約は日本語
- コミット前に `npm run lint` と `npm test` を通す
- **指示がない限り push しない**
