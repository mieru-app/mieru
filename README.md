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

**Phase 0（基盤・変換エンジン）完了。**

```
Phase 0  基盤・変換エンジン        ✅ 完了
Phase 1  編集機能                  ← 次はここ  ★実用開始
Phase 2  管理・出力・PWA           ★日常ツールとして完成
Phase 3  AWS同期・スマートフォン    ★どこでも使える
```

Phase 0 では Markdown とモデルの可逆変換を実装し、ラウンドトリップの強保証
（正規化 Markdown → モデル → Markdown がバイト単位で一致）をプロパティテスト1万件で検証した。

## 構成

```
src/
├─ core/     Markdown 変換エンジン
│  ├─ types.ts        データモデル
│  ├─ parse.ts        Markdown → モデル
│  ├─ serialize.ts    モデル → Markdown（正規化規則を厳守）
│  ├─ frontmatter.ts  frontmatter の入出力（mm: の隔離）
│  ├─ escape.ts       エスケープ／アンエスケープ（対でなければ冪等性が崩れる）
│  ├─ normalize.ts    ノートの正規化（パーサとシリアライザで共有）
│  ├─ yaml-emit.ts    YAML 出力
│  └─ export.ts       AI 入力用の出力（raw / expanded / subtree）
└─ store/    永続化層
   ├─ types.ts        MapStore インターフェースとエラー型
   └─ MemoryStore.ts  テスト用実装（契約の基準実装）
```

## 開発

```bash
npm install
npm test              # 全テスト
npm run test:core     # 変換エンジンのみ
npm run test:coverage # カバレッジ（90%未満で失敗）
npm run typecheck
npm run lint
```

`npm run dev` と `npm run build` は Phase 1 でアプリのエントリポイントを作る際に追加する。

- Node.js v20.20.0 / npm 10.8.2
- 対応ブラウザ（Phase 1・2）: Edge / Chrome（File System Access API を使用するため）
