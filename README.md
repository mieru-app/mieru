# Mieru

考えを整理するためのマインドマップツール。整理した内容をそのままAIへの入力ドキュメントとして使えることを目的とする。

**中核となる設計思想: Markdown は出力形式ではなく保存形式である。**
編集結果は常に人間可読な `.md` ファイルとして存在し、AIへの入力は「そのファイルを渡す」だけで完了する。

## ドキュメント

| 文書 | 内容 |
|---|---|
| [基本設計書](./docs/design.md) | 設計原則、データ設計、機能設計、永続化設計、AWS構成、技術選定の根拠、リスク |
| [プロジェクト計画書](./docs/project-plan.md) | 成功基準、フェーズ構成、WBS、マイルストーン、品質計画、リスク管理 |

## 現在の状態

**Phase 1（編集機能）完了。Phase 2 の準備まで済み、本体は未着手。**

```
Phase 0  基盤・変換エンジン        ✅ 完了
Phase 1  編集機能                  ✅ 完了（DoD の実利用2週間は未達）
Phase 2  管理・出力・PWA           ← 次はここ  ★日常ツールとして完成
Phase 3  AWS同期・スマートフォン    ★どこでも使える
```

ローカルフォルダを選ぶと、その直下の `.md` をマップとして読み書きする。
キャンバスとアウトラインの2つの表示、キーボードのみでの編集、800ms デバウンスの自動保存、
外部変更の検知、`Ctrl+Shift+C` での AI 用 Markdown 出力までが動く。

## 構成

```
src/
├─ core/     Markdown 変換エンジン（parse / serialize / frontmatter / escape / export）
├─ store/    永続化層（MapStore と LocalFolderStore、IndexedDB、ファイル名規則）
├─ state/    編集ロジック・状態・自動保存（React にも mind-elixir にも依存しない）
├─ app/      画面の骨格（ツールバー、ステータスバー、キー割り当て）
└─ views/    描画（Canvas は mind-elixir、Outline、NotePanel）

assets/icon/ アイコンの生成（generate.mjs → dist/ に SVG と PNG）
```

**判断は `src/state/` に集める。** 描画層は自動テストを持たないため、
そこに判断を書いた分だけ検証できない領域が増える。詳細は `CLAUDE.md`。

## 開発

```bash
npm install
npm run dev           # 開発サーバ
npm run build         # 型検査つき本番ビルド
npm test              # 全テスト
npm run test:coverage # カバレッジ（90%未満で失敗）
npm run typecheck
npm run lint

node assets/icon/generate.mjs   # アイコンの SVG / PNG を生成
```

- Node.js v20.20.0 / npm 10.8.2
- 対応ブラウザ（Phase 1・2）: Edge / Chrome（File System Access API を使用するため）
