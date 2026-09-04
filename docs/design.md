# 設計の索引

**Mieru の設計は `docs/design/` に分かれている。ここはその入口である。**

かつてこのファイルは1,667行の基本設計書だった。役割が混ざって読みにくく、
更新のたびに他の文書とずれていたため、2026-09-05 に分割した。
経緯は [ドキュメント刷新の計画](./ideas/2026-09-05-docs-restructure.md)。

文書の作り方の決まりは [`.steering/documentation.md`](../.steering/documentation.md)。

---

## 実装するときに読むもの（AI 向けの正本）

| 文書 | 内容 |
|---|---|
| [設計原則と用語](./design/principles.md) | **迷ったらここへ戻る。** 原則1〜5、不変条件、層の分け方 |
| [データ形式と変換規則](./design/data-format.md) | ファイル形式、内部モデル、変換、正規化、ラウンドトリップ保証 |
| [機能一覧とキー割り当て](./design/features.md) | 機能 ID（F-xx）とキー操作の正本 |
| [画面](./design/screens.md) | モード3つ・ツールバー1本、狭い画面の扱い |
| [テキスト出力](./design/export.md) | 形式 × 範囲の2軸、取り込み指示 |
| [永続化](./design/persistence.md) | `MapStore` の契約、`LocalFolderStore` |
| [GitHubStore](./design/github-store.md) | GitHub リポジトリを保存先にする |
| [履歴](./design/history.md) | `HistoryStore`、差分、復元 |
| [配信](./design/delivery.md) | GitHub Pages、CSP、オリジン |
| [セキュリティ](./design/security.md) | 信頼の境界、トークンの扱い |
| [非機能要件](./design/requirements.md) | NF-xx と測り方 |
| [エラー処理](./design/errors.md) | 入力を失わせない、エラー境界 |
| [テスト戦略](./design/testing.md) | どこに自動テストを置くか |

## 全体像を知りたいとき（人間向け）

| 文書 | 内容 |
|---|---|
| [アーキテクチャ解説](./human-review/architecture.md) | 構成図、データの流れ、採った判断と捨てた選択肢、リスク |
| [ロードマップと現在地](./human-review/roadmap.md) | **「いまどこにいるか」の唯一の正本** |
| [名前・アイコン・ロゴ](./human-review/identity.md) | なぜ Mieru で、なぜこの形か |
| [GitHub API 事前検証](./human-review/github-api-verification.md) | Contents API の実測値 |
| [性能試験報告](./human-review/perf-report.md) | 1000ノードでの実測値 |
| [AWS 同期（見送り）](./human-review/aws-sync.md) | Phase 3 の構想。**現行の設計ではない** |

## 検討の記録（正本ではない）

[`docs/ideas/`](./ideas/) にある。書かれた時点の事実であり、現在の仕様として読んではいけない。

---

## 旧章番号との対応

**コード中のコメントは「設計書 8.6」のように章番号で参照している**（49 ファイル・92 箇所）。
分割後も各文書は元の節番号を保っているので、この表から辿れる。

**新しく書くときは章番号ではなく、文書名か安定 ID（`F-xx` `NF-xx` `R-xx`）で参照すること。**

| 旧 | 移動先 |
|---|---|
| 1. 背景と目的 | [architecture.md](./human-review/architecture.md) 1章 |
| 2.1 対象 / 2.2 対象外 | [architecture.md](./human-review/architecture.md) 2章 |
| 2.3 利用者と信頼の境界 | [security.md](./design/security.md) |
| 3. 設計原則 | [principles.md](./design/principles.md) |
| 4. 用語定義 | [principles.md](./design/principles.md) |
| 5.1 システム構成 | [architecture.md](./human-review/architecture.md) 3章 |
| 5.2 Phase 3 構成 | [aws-sync.md](./human-review/aws-sync.md) 1章 |
| 5.3 技術スタック | [architecture.md](./human-review/architecture.md) 4章 |
| 6.1 〜 6.5 データ設計 | [data-format.md](./design/data-format.md) |
| 7.1 機能一覧 / 7.4 キー操作 | [features.md](./design/features.md) |
| 7.2 画面設計 | [screens.md](./design/screens.md) |
| 7.3 テキスト出力 | [export.md](./design/export.md) |
| 8.1 〜 8.3 MapStore | [persistence.md](./design/persistence.md) |
| 8.4 S3Store / 8.5 SyncingStore | [aws-sync.md](./human-review/aws-sync.md) 2〜3章 |
| 8.6 配信 | [delivery.md](./design/delivery.md) |
| 8.7 GitHubStore | [github-store.md](./design/github-store.md) |
| 8.8 HistoryStore | [history.md](./design/history.md) |
| 9. AWS構成詳細 | [aws-sync.md](./human-review/aws-sync.md) 9章 |
| 10. 非機能要件 | [requirements.md](./design/requirements.md) |
| 11. エラー処理方針 | [errors.md](./design/errors.md) |
| 12.1 〜 12.3 技術選定 | [architecture.md](./human-review/architecture.md) 5章 |
| 12.4 サーバレス | [aws-sync.md](./human-review/aws-sync.md) 10章 |
| 12.5 〜 12.7 名前・アイコン・ロゴ | [identity.md](./human-review/identity.md) |
| 13. リスクと対策 | [architecture.md](./human-review/architecture.md) 6章 |
| 14. 将来の拡張候補 | [architecture.md](./human-review/architecture.md) 7章 |
| 付録A. 参照資料 | [architecture.md](./human-review/architecture.md) 8章 |

**計画書（`docs/project-plan.md`）は 2026-09-05 に廃止した。**
現在地は [ロードマップ](./human-review/roadmap.md)、
作業記録は [ideas/](./ideas/2026-09-04-wbs-archive.md) にある。
