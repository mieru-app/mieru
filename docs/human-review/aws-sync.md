# AWS 同期（Phase 3・見送り）

**この文書は保留中の構想であり、現行の設計ではない。**
Phase 3（AWS による端末間同期）は **2026-09-03 に見送りが決定した**。
`GitHubStore`（Phase 2.6）で保存先を確保したことで、主目的だった
スマートフォン対応（Phase 2.7）が AWS 無しで成立したためである。

**現行の設計を読む人はここを読まなくてよい。** 隔離してあるのは、
検討の結果を捨てないためと、現行の文書から Phase 3 の記述を追い出すためである。
再開するときは、まず前提が今も成り立つかを測り直すこと。

関連: [ロードマップ](./roadmap.md) ／ [設計の索引](../design.md)

---

## 1. 全体構成


```
┌── Windows PC ──┐          ┌── スマートフォン ──┐
│  PWA           │          │  PWA              │
│  ├ LocalFolder │          │  └ IndexedDB      │
│  └ IndexedDB   │          │    （キャッシュ）  │
└───────┬────────┘          └────────┬──────────┘
        │                            │
        │  ① Cognito でサインイン（Google連携可）
        │  ② 一時的なAWS認証情報を取得
        │  ③ S3 を直接読み書き
        └──────────────┬─────────────┘
                       │  HTTPS
        ┌──────────────▼──────────────────────────────┐
        │  AWS                                        │
        │                                             │
        │  Cognito User Pool ── Identity Pool         │
        │        │ 一時credential発行                  │
        │        ▼                                    │
        │  S3: mieru-data （非公開バケット）        │
        │     users/{cognito-sub}/maps/*.md           │
        │     ※ IAM条件で自分のプレフィックスのみ許可  │
        │                                             │
        │  S3: mieru-web ── CloudFront             │
        │     PWA本体の静的配信                        │
        └─────────────────────────────────────────────┘

Lambda / API Gateway / DynamoDB は使用しない（サーバコード0行）
```


---

## 2. S3Store


```
S3キー設計:
  s3://mieru-data/users/{cognito-identity-id}/maps/{uuid}.md

  ・ファイル名ではなくUUIDをキーにする（改名時にオブジェクトを移動せずに済む）
  ・表示名は frontmatter の title から取得する
  ・一覧は ListObjectsV2 + オブジェクトメタデータで取得する
```

| 操作 | 実装 |
|---|---|
| `list()` | `ListObjectsV2` でキー・更新日時・ETagを取得。title/tags はオブジェクトのユーザー定義メタデータに複製して保持し、本文取得を回避する |
| `read()` | `GetObject`。ETag を version として返す |
| `write()` | `PutObject` に `If-Match: {baseVersion}` を付与。412 応答なら `ConflictError` |
| `remove()` | `DeleteObject` |

> **要検証（Phase 3 着手時）:** S3 の条件付き書き込み（`PutObject` の `If-Match`）の利用可否と対象リージョンでの対応状況を実装前に確認すること。利用できない場合は「ETag比較 → 書き込み」の2段構えにフォールバックし、競合検出の窓が僅かに残ることを許容する（単一利用者のため実害は限定的）。


---

## 3. SyncingStore と競合解決


```
       編集
        ↓
   IndexedDB（即座に書き込み・オフラインでも動作）
        ↓ デバウンス / オンライン復帰時
   S3 へ push（If-Match で楽観ロック）
        ↓ 412 が返った場合
   ┌──────────── 競合解決 ────────────┐
   │ 1. サーバ版を取得                 │
   │ 2. ローカル版を                   │
   │    「{title} (競合 2026-09-01)」  │
   │    として別マップに保存            │
   │ 3. UIで両者の差分を提示し選択させる │
   └──────────────────────────────────┘
```

**設計方針: データを失わないことを最優先する。** 自動マージは行わない。競合時は必ず両方を残し、判断は利用者に委ねる。単一利用者の複数端末間という状況では競合の発生頻度自体が低く、複雑な自動解決（CRDT等）を導入する費用対効果がないと判断する。

---


---

## 9. AWS構成詳細（Phase 3）

### 9.1 リソース一覧

| リソース | 用途 | 設定要点 |
|---|---|---|
| S3 `mieru-data` | マップデータ保管 | パブリックアクセス全ブロック、バージョニング有効、CORS設定 |
| S3 `mieru-web` | PWA静的ファイル | CloudFront の OAC 経由でのみ参照可 |

> **バケット名は全世界で一意であり、作成後に改名できない。** `mieru-data` / `mieru-web` は既に他者が使用している可能性が高いため、Phase 3 の着手時に実際の取得可否を確認し、取れなければ接尾辞を付けた名前（例 `mieru-app-data-<任意の文字列>`）に決め直す。本書の記載は役割を示すもので、確定した名前ではない。
| CloudFront | PWA配信 | SPA向けに 403/404 を `/index.html` にフォールバック |
| Cognito User Pool | 利用者認証 | Googleフェデレーション、MFA任意 |
| Cognito Identity Pool | 一時AWS認証情報の発行 | 認証済みロールのみ許可（ゲストアクセス無効） |
| IAM Role (authenticated) | S3アクセス権限 | 下記ポリシー |

**Lambda・API Gateway・DynamoDB は使用しない。** ブラウザが Cognito から得た一時認証情報で S3 を直接操作するため、サーバサイドのコードは1行も存在しない。

### 9.2 IAMポリシー（認証済みロール）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "OwnObjectsOnly",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::mieru-data/users/${cognito-identity.amazonaws.com:sub}/*"
    },
    {
      "Sid": "ListOwnPrefixOnly",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::mieru-data",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["users/${cognito-identity.amazonaws.com:sub}/*"]
        }
      }
    }
  ]
}
```

`${cognito-identity.amazonaws.com:sub}` はIAMがリクエスト時に実際のIdentity IDへ置換する変数である。これにより**利用者は自分のプレフィックス配下以外に一切アクセスできない**。アプリ側のコードにバグがあっても他者のデータには到達しない。

### 9.3 想定コスト（個人利用）

| 項目 | 想定量 | 月額 |
|---|---|---|
| S3 ストレージ | 500マップ × 10KB ≒ 5MB | 約 $0.001 |
| S3 リクエスト | 月10,000リクエスト | 約 $0.01 |
| CloudFront 転送 | 1GB未満 | 無料枠内 |
| Cognito | 1 MAU | 無料枠内 |
| **合計** | | **月 $0.1 未満** |

独自ドメインを使用する場合は Route 53 のホストゾーン代（月 $0.50）とドメイン登録費（年 $12 程度）が別途必要。ACM証明書は無料。

---


## 10. サーバレス（Lambda 不使用）とする理由


データが単純なファイルであり、認可はIAMポリシーで宣言的に表現できる。サーバコードを書かないことで、実装工数・障害点・運用負荷・コストの全てが削減される。将来、全文検索の高速化等でサーバ側処理が必要になった時点で追加すればよい。


---

## 11. 作業分解（WBS）


**当面見送る（2026-09-02 決定）。** Phase 2.6 の `GitHubStore` と 2.7 のレスポンシブ対応により、
本フェーズの主目的である「スマートフォンから使う」は AWS を建てずに達成できる見込みである。
以下は将来 AWS へ移す判断をした場合のために残す。

| ID | タスク | 成果物 | 工数目安 | 依存 |
|---|---|---|---|---|
| 3-0 | **事前検証**: S3 条件付き書き込み（`If-Match`）の利用可否確認（設計書 8.4） | 検証メモ | 0.5日 | — |
| 3-1 | AWS基盤を CDK で構築（S3 ×2、CloudFront、Cognito User Pool / Identity Pool、IAMロール） | `infra/` | 2日 | 3-0 |
| 3-2 | サインインUI（Cognito、Google連携） | `src/features/auth/` | 1.5日 | 3-1 |
| 3-3 | `S3Store` 実装 | `src/store/S3Store.ts` | 2日 | 3-1 |
| 3-4 | `SyncingStore` 実装（IndexedDBキャッシュ、差分同期、オンライン復帰時のpush） | `src/store/SyncingStore.ts` | 3日 | 3-3 |
| 3-5 | 競合解決UI（両版の保持と差分提示） | `src/features/conflict/` | 1.5日 | 3-4 |
| 3-6 | スマートフォンUI（アウトライン既定、下部ツールバー、タッチ操作） | `src/views/Mobile/` | 3日 | 1-7 |
| 3-7 | CI/CD（GitHub Actions → S3 デプロイ → CloudFront 無効化） | `.github/workflows/` | 1日 | 3-1 |
| 3-8 | 既存ローカルデータのS3への移行機能 | — | 1日 | 3-3 |
| 3-9 | セキュリティ確認（他プレフィックスへの到達不能をIAMレベルで検証） | 確認報告 | 0.5日 | 3-1 |
| 3-10 | 実機動作確認（iOS Safari / Android Chrome / Firefox） | — | 1日 | 3-6 |
| | | **小計** | **約17日** | |

**Phase 3 完了条件（DoD）**

- [ ] PCで編集した内容がスマートフォンに自動で反映される（およびその逆）
- [ ] オフラインで編集した内容が、オンライン復帰時に自動で同期される
- [ ] 競合を意図的に発生させても、いずれのデータも失われない
- [ ] iOS Safari / Android Chrome で編集できる
- [ ] IAMポリシーにより他プレフィックスへアクセスできないことを確認済み
- [ ] AWS月額コストが $1 未満である

---


---

## 12. 運用


| 項目 | 方針 |
|---|---|
| バックアップ | S3 のバージョニングを有効化。誤削除・誤上書きから復旧できる |
| 一括取得 | `aws s3 sync` で全 `.md` をローカルへ取得可能（ロックイン回避） |
| 更新 | GitHub Actions で main ブランチへの push を契機に自動デプロイ |
| コスト監視 | AWS Budgets で月$5のアラートを設定 |
| 障害時 | S3 障害時はオフラインモードで継続利用できる（IndexedDBキャッシュ） |


## 13. コスト見積

| フェーズ | 項目 | 費用 |
|---|---|---|
| Phase 0〜2 | 全て | **0円** |
| Phase 3 | AWS（S3 / CloudFront / Cognito） | 月 $0.1 未満 |
| Phase 3（任意） | 独自ドメイン + Route 53 | 年 $12 + 月 $0.50 |

開発ツール・ライブラリは全て無償かつ MIT 等の寛容なライセンスである。

---
