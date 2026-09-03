# Mieru

考えを整理するためのマインドマップツール。整理した内容をそのままAIへの入力ドキュメントとして使えることを目的とする。

**中核となる設計思想: Markdown は出力形式ではなく保存形式である。**
編集結果は常に人間可読な `.md` ファイルとして存在し、AIへの入力は「そのファイルを渡す」だけで完了する。

公開先: **https://mieru-app.github.io/mieru/**

## 保存先は2つから選ぶ

| 保存先 | 置かれるもの | 使える環境 |
|---|---|---|
| **このパソコンのフォルダ** | 選んだフォルダ直下の `.md` | デスクトップ版 Edge / Chrome |
| **GitHub のリポジトリ** | 指定したリポジトリの `.md`（保存はコミットになる） | どの端末でも |

どちらも Obsidian や VS Code でそのまま開ける。設定からいつでも切り替えられる。

## セキュリティ — 何を預かり、何を預からないか

**サーバもデータベースも存在しない。** Mieru は静的ファイルとして配られるだけで、
あなたのマップが開発者に届くことはない。GitHub を保存先にした場合、通信は
**あなたのブラウザから `api.github.com` へ直接**行われる。

そのうえで、**知っておいてほしいことが3つある。**

**1. トークンはあなたのブラウザに平文で保存される。**
GitHub を保存先にすると、アクセストークンがこの端末の IndexedDB に入る。
**暗号化していない。** 合言葉を毎回入力させない限り復号鍵も同じブラウザに置くことになり、
守っているように見えて守っていない実装になるためである。
接続時に「この端末に記憶する」を外せば、閉じた時点で消える。共用の端末では外すこと。

**2. だからトークンの権限を絞ってほしい。**
Fine-grained PAT を、**マップ置き場のリポジトリ1つだけ**に、**Contents 権限のみ**、
**有効期限つき**で作る。これが事故のときに被害が届く範囲そのものになる。
アプリ内の「トークンの作り方」に手順がある。

**3. あなたは配信元のオリジンを信用することになる。**
ブラウザだけで動き資格情報を扱うアプリは、**配信されたコードがブラウザの中で
その鍵に触れられる**という性質を避けられない。これは Mieru に限った話ではない。
だから確かめられる形にしてある。

- **OSS である。** 配っているコードはこのリポジトリで全部読める
- **外部リソースを一切読み込まない。** CDN も Web フォントも解析ツールも使わない。
  確認すべき範囲がこのリポジトリだけで閉じる
- **CSP で強制している。** 通信先は `api.github.com` に限定されており、
  仮にトークンを読むコードが混入しても**送り先が無い**（`vite.config.ts`）
- **配信は Mieru 専用の Organization から行う。** GitHub Pages は
  `<名前>.github.io` が丸ごと1つのオリジンで、同じオリジンに置いた別のページから
  保管庫を読める。`mieru-app` には Mieru 以外を公開しない（設計書 NF-44）

配信元を信用したくない場合は、**自分でホストできる**（下記）。

## 自分でホストする

```bash
git clone https://github.com/mieru-app/mieru.git
cd mieru
npm install
npm run build     # dist/ を任意の HTTPS サーバへ置く
```

GitHub Pages に置く場合は、fork して Settings → Pages → Source を「GitHub Actions」にする。
`base` は配信先の形から Actions が自動で決めるので、書き換えなくてよい。

**ただし、自己ホストが自動的に安全なわけではない。**
自分の `<ユーザー名>.github.io` に置くと、そこに同居する他のページと同一オリジンになる。
専用のアカウントか Organization を使うか、そのオリジンに他を置かないこと。

## ドキュメント

| 文書 | 内容 |
|---|---|
| [基本設計書](./docs/design.md) | 設計原則、データ設計、機能設計、永続化設計、技術選定の根拠、リスク |
| [プロジェクト計画書](./docs/project-plan.md) | 成功基準、フェーズ構成、WBS、マイルストーン、品質計画、リスク管理 |
| [GitHub API 事前検証メモ](./docs/github-api-verification.md) | Contents API の実測値。楽観ロック、レート制限、キャッシュ |
| [性能試験報告](./docs/perf-report.md) | 1000ノードでの実測値と、ブラウザでの実測が残っている項目 |

## 現在の状態

```
Phase 0    基盤・変換エンジン        ✅ 完了
Phase 1    編集機能                  ✅ 完了（DoD の実利用2週間は未達）
Phase 2    管理・出力・PWA           ✅ 完了（性能要件の実測が残り）
Phase 2.5  言葉と導線                ✅ 完了
Phase 2.6  置き場所（GitHub）        ✅ 完了
Phase 2.7  スマートフォン対応        ✅ 完了
Phase 3    AWS同期                   見送り（2.6 で目的が満たせるため）
```

| できること | 呼び出し方 |
|---|---|
| キャンバス／アウトラインの2表示、キーボードのみでの編集 | `?` でキー操作の一覧 |
| マップの一覧・全文検索・タグ絞り込み | `Ctrl+B` / `Ctrl+F` |
| マップの新規作成（下敷きあり）・改名・削除 | サイドバー |
| テキスト出力（見出し／箇条書き × 全体／選択部分）とコピー・`.md` 保存 | ツールバーの「テキスト出力」／`Ctrl+Shift+C` |
| 操作とマップを名前で呼ぶ | `Ctrl+K` |
| 絵文字・横断リンク（`[[ ]]`）・ブランチ自動配色 | ノートパネル |
| 自動保存、競合の提示、保存できなかった内容の退避 | 自動（ステータスバーに常時表示） |

## 構成

```
src/
├─ core/     Markdown 変換エンジン（parse / serialize / frontmatter / escape / export）
├─ store/    永続化層（MapStore と LocalFolderStore / GitHubStore、IndexedDB、資格情報）
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
- ローカルフォルダを保存先にする場合は Edge / Chrome（File System Access API を使うため）。
  GitHub を保存先にする場合はブラウザを問わない

### 配信（GitHub Pages）

`main` への push で `.github/workflows/deploy.yml` が lint とテストを通してからビルドし、公開する。
`BASE_PATH` は配信先の形から Actions が決める（設計書 8.6）。

```bash
BASE_PATH=/mieru/ npm run build   # 配信と同じ条件でビルドする
npm run preview                   # Service Worker と CSP は本番ビルドでのみ有効
```
