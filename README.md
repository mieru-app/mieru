# Mieru

考えを整理するためのマインドマップツール。整理した内容をそのままAIへの入力ドキュメントとして使えることを目的とする。

**中核となる設計思想: Markdown は出力形式ではなく保存形式である。**
編集結果は常に人間可読な `.md` ファイルとして存在し、AIへの入力は「そのファイルを渡す」だけで完了する。

## ドキュメント

| 文書 | 内容 |
|---|---|
| [基本設計書](./docs/design.md) | 設計原則、データ設計、機能設計、永続化設計、AWS構成、技術選定の根拠、リスク |
| [プロジェクト計画書](./docs/project-plan.md) | 成功基準、フェーズ構成、WBS、マイルストーン、品質計画、リスク管理 |
| [性能試験報告](./docs/perf-report.md) | 1000ノードでの実測値と、ブラウザでの実測が残っている項目 |

## 現在の状態

**Phase 2（管理・出力・PWA）の実装が一巡した。実機確認と配信が残っている。**

```
Phase 0  基盤・変換エンジン        ✅ 完了
Phase 1  編集機能                  ✅ 完了（DoD の実利用2週間は未達）
Phase 2  管理・出力・PWA           🔧 実装済み・実機確認と配信が残り
Phase 3  AWS同期・スマートフォン    ★どこでも使える
```

ローカルフォルダを選ぶと、その直下の `.md` をマップとして読み書きする。

| できること | 呼び出し方 |
|---|---|
| キャンバス／アウトラインの2表示、キーボードのみでの編集 | `?` でキー操作の一覧 |
| マップの一覧・全文検索・タグ絞り込み | `Ctrl+B` / `Ctrl+F` |
| マップの新規作成（下敷きあり）・改名・削除 | サイドバー |
| AI 用の出力3モード（そのまま／見出し展開／部分）とコピー・`.md` 保存 | ツールバーの「AI 用に出力」／`Ctrl+Shift+C` |
| 操作とマップを名前で呼ぶ | `Ctrl+K` |
| 絵文字・横断リンク（`[[ ]]`）・ブランチ自動配色 | ノートパネル |
| 800ms デバウンスの自動保存、外部変更の検知、競合の提示 | 自動（ステータスバーに常時表示） |

## 構成

```
src/
├─ core/     Markdown 変換エンジン（parse / serialize / frontmatter / escape / export）
├─ store/    永続化層（MapStore と LocalFolderStore、IndexedDB、ファイル名規則）
├─ state/    編集ロジック・状態・自動保存（React にも mind-elixir にも依存しない）
├─ app/      画面の骨格（ツールバー、キー割り当て、コマンドパレット、設定）
└─ views/    描画（Canvas は mind-elixir、Outline、Sidebar、NotePanel、Export）

assets/icon/ アイコンの生成（generate.mjs → public/icons/ に SVG と PNG）
public/      Vite が素通しで配るもの（Service Worker）
scripts/     性能実測（npm run perf）
```

**判断は `src/state/` に集める。** 描画層は自動テストを持たないため、
そこに判断を書いた分だけ検証できない領域が増える。詳細は `CLAUDE.md`。

## 開発

```bash
npm install
npm run dev           # 開発サーバ（アイコンを生成してから起動）
npm run build         # 型検査つき本番ビルド
npm test              # 全テスト
npm run test:coverage # カバレッジ（90%未満で失敗）
npm run perf          # 性能実測（npm test には含めない）
npm run typecheck
npm run lint

node assets/icon/generate.mjs   # アイコンの SVG / PNG を public/icons/ へ生成
```

- Node.js v20.20.0 / npm 10.8.2
- 対応ブラウザ（Phase 1・2）: Edge / Chrome（File System Access API を使用するため）

### 配信（GitHub Pages）

`main` への push で `.github/workflows/deploy.yml` がビルドして公開する。
**リポジトリ側で1度だけ Settings → Pages → Source を「GitHub Actions」にする必要がある。**
サブパス配信のため、`BASE_PATH` 環境変数で `base` を切り替える（設計書 8.6）。

```bash
BASE_PATH=/mindmap_app/ npm run build   # 配信と同じ条件でビルドする
npm run preview                          # Service Worker は本番ビルドでのみ登録される
```
