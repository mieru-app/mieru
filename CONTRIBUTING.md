# 開発に参加する

Mieru への貢献を歓迎します。不具合の報告、使ってみた感想、コードの改善、どれも助かります。

**この文書と `docs/` は日本語です。** 利用者向けの説明は
[README（英語）](./README.md) と [README（日本語）](./README.ja.md) にあります。
英語での Issue と Pull Request も歓迎します。

---

## まず読むもの

| 目的 | 文書 |
|---|---|
| 全体像・なぜこの作りなのか | [アーキテクチャ解説](./docs/human-review/architecture.md) |
| 実装するときの正本 | [設計の索引](./docs/design.md) |
| **判断に迷ったとき** | [設計原則](./docs/design/principles.md) |
| いまどこまで出来ているか | [ロードマップ](./docs/human-review/roadmap.md) |
| コードの規約 | [CLAUDE.md](./CLAUDE.md) |

**文書を書き足す前に [文書の原則](./.steering/documentation.md) を読んでください。**
同じことを2箇所に書かないことを重視しています。

---

## 手元で動かす

```bash
git clone https://github.com/mieru-app/mieru.git
cd mieru
npm install
npm run dev
```

Node.js 20.19 以上が必要です（開発は v20.20.0 / npm 10.8.2 で行っています）。

| 用途 | コマンド |
|---|---|
| 開発サーバ | `npm run dev` |
| 本番ビルド（型検査つき） | `npm run build` |
| 型検査 | `npm run typecheck` |
| Lint | `npm run lint` / `npm run lint:fix` |
| テスト（全体） | `npm test` |
| テスト（変換エンジンのみ） | `npm run test:core` |
| カバレッジ（90% 未満で失敗） | `npm run test:coverage` |
| 性能実測 | `npm run perf` |

**ローカルフォルダを保存先にする機能は Edge / Chrome でしか動きません**
（File System Access API を使うため）。GitHub を保存先にする機能はブラウザを問いません。

```bash
BASE_PATH=/mieru/ npm run build   # 配信と同じ条件でビルドする
npm run preview                   # Service Worker と CSP は本番ビルドでのみ有効
```

---

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
docs/        設計・解説・記録
```

**依存は一方向です。** `core` → `store` → `state` → `app` / `views` の順で、逆流させません。

**判断は `src/state/` に集めてください。** `src/app/` と `src/views/` は自動テストを
持たないため、そこに判断を書いた分だけ検証できない領域が増えます。

---

## 変更を送るまで

1. **Issue で先に相談してください。** とくに機能追加は、
   [対象外リスト](./docs/human-review/architecture.md)に入っていないかを先に確認します
2. `main` からブランチを切ります
3. **`git commit -s` で署名します**（下記）
4. `npm run lint` と `npm test` を通します。**出力の末尾だけを見ないでください**
5. 設計に影響する変更なら、同じコミットで `docs/design/` も直します
6. Pull Request を出します

**コミットメッセージは `docs:` `feat:` `fix:` `test:` `chore:` のいずれかを接頭辞にし、
要約は日本語で書きます。** コメントとドキュメントも日本語、識別子とファイル名は英語です。

### 署名（DCO）が要ります

**すべてのコミットに `Signed-off-by:` の行が要ります。** `git commit -s` を付けるだけです。

```bash
git commit -s -m "fix: ..."          # これから書くとき
git commit --amend -s --no-edit      # 直前の1件を直す
git rebase --signoff main            # ブランチ全体を直す
```

これは [Developer Certificate of Origin](https://developercertificate.org/) という
軽い仕組みで、**「自分にこのコードを出す権利がある」と述べるもの**です。
全文はリポジトリ直下の [DCO](./DCO) にあります。署名は `git config user.name` と
`user.email` から作られるので、**本名や普段お使いの名前を設定しておいてください。**

CI（`verify`）が Pull Request の全コミットを検査し、
**欠けていると merge できません。** 直し方はエラーに出ます。

**なぜ求めるのか。** 貢献してくださる方が増えたあとで
「誰がどの部分の著作権を持つか」を辿れないと、ライセンスに関わる判断が
一切できなくなります。**記録は後から作れません。**
背景は [ライセンスの検討](./docs/ideas/2026-09-05-license-options.md) にあります。

なお **bot（Dependabot など）には求めません。** 権利を述べるのは人だからです。

### 変えてはいけないもの

**5つの不変条件があります。** 正本は [設計原則](./docs/design/principles.md) です。
変えたくなった場合は、実装より先にそちらを直して合意を取ってください。

1. Markdown が保存形式である
2. 表示状態は frontmatter の `mm:` 配下にのみ書く
3. UI 層は `MapStore` 経由でのみ永続化する
4. `mind-elixir` を import してよいのは `src/views/Canvas/` のみ
5. ラウンドトリップの強保証を壊さない

3 と 4 は ESLint が機械的に弾きます。

### 依存を足すとき

**最小限にしてください。** 足す場合は理由を先に述べてください。とくに次の2つは固定です。

- **`remark-gfm` を入れてはいけません。** いま表は段落として解析され、ノートに逐語で
  入ってバイト単位で往復しています。GFM を足すと表が破棄されるようになります
- **`mind-elixir` は 5.15.1 に固定です。** npm の `latest` が prerelease を指しています

### 外部リソースを足さないでください

**第三者のスクリプト・Web フォント・解析ツールを読み込みません**（NF-43）。
他人のトークンを預かる以上、外部リソースは持ち出し口になります。
CSP で強制済みで、通信先は `api.github.com` だけです。

---

## 脆弱性を見つけたら

**公開の Issue には書かないでください。**
報告の仕方と対象の範囲は [SECURITY.md](./SECURITY.md) にあります
（英語で書いてありますが、**日本語での報告を歓迎します**）。

**すでに既知として受け入れている事項があります。**
トークンを暗号化せず IndexedDB へ置いていること、配信元のコードが
そのトークンに触れられることの2つです。理由は同じ文書にあります。

---

## 自分でホストする

```bash
git clone https://github.com/mieru-app/mieru.git
cd mieru
npm install
npm run build     # dist/ を任意の HTTPS サーバへ置く
```

GitHub Pages に置く場合は、fork して Settings → Pages → Source を「GitHub Actions」にします。
`base` は配信先の形から Actions が自動で決めるので、書き換える必要はありません。

**ただし、自己ホストが自動的に安全になるわけではありません。**
自分の `<ユーザー名>.github.io` に置くと、そこに同居する他のページと**同一オリジン**になり、
そのページから Mieru の保管庫（トークンを含む）を読めてしまいます。
専用のアカウントか Organization を使うか、そのオリジンに他を置かないでください。
理由は [配信](./docs/design/delivery.md) にあります。
