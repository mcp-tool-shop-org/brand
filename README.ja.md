<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/brand"><img src="https://img.shields.io/npm/v/@mcptoolshop/brand" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

<p align="center">
  Centralized brand asset registry for the <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop-org</a> GitHub org.<br>
  One repo holds every logo. Every README points here. Update once, update everywhere.
</p>

---

## なぜか

各リポジトリがロゴの独自のコピーを持つ場合、重複、ずれ、および不整合が発生します。ブランド変更は、100以上のリポジトリを検索することを意味します。このリポジトリはその問題を解決します。ロゴはここに保存され、READMEファイルは`raw.githubusercontent.com` URLを使用してそれらを参照します。

## 構造

```
logos/
  <slug>/
    readme.png       # THE logo — one canonical image, format preserved as-is
    gallery/          # optional — a named collection of N extra showcase images
      side.png
      back.png
manifest.json     # SHA-256 integrity hashes for every asset, tagged role: primary | gallery
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

組織全体に数百のロゴがあります。PNG形式はPNG形式のまま、JPEG形式はJPEG形式のままです。形式はビルドターゲットではなく、ブランドに関する決定事項です。

特定の「スラッグ」の`readme.<ext>`は、常に唯一の標準ロゴになります。「スラッグ」には、追加の表示画像のサブフォルダ（スプライトパックのキャラクターの向き、ツールのスクリーンショットセットなど）も含まれる場合があります。マニフェストでは、すべての画像ファイルを同じように扱うのではなく、各アセットの`role`を明示的にタグ付けします。詳細は、以下の[ギャラリーと動的なREADME](#galleries--dynamic-readmes)を参照してください。

## CLI

```bash
npm install -g @mcptoolshop/brand

# Verify all logos match their manifest hashes
brand verify

# Regenerate manifest after adding/replacing a logo
brand manifest

# CI mode — fail if manifest is out of date
brand manifest --check

# Show registry summary — counts, formats, sync status
brand stats
brand stats --json

# Audit repos for broken refs, badge collisions, indentation traps
brand audit --repos /path/to/clones

# Migrate READMEs to point at brand repo (dry run first)
brand migrate --repos /path/to/clones --dry-run
brand migrate --repos /path/to/clones

# Register a directory of images as a named gallery for a slug
brand add-gallery <slug> /path/to/turnarounds --dry-run
brand add-gallery <slug> /path/to/turnarounds

# Sync a consuming repo's README gallery block from the manifest
brand sync --slug <slug> --repos /path/to/clones --check
brand sync --slug <slug> --repos /path/to/clones
```

## 自動同期

毎日実行されるGitHubアクション（`sync.yml`）は、組織内のすべてのリポジトリをスキャンしてロゴを探し、新しいまたは変更されたアセットをダウンロードし、マニフェストを再生成し、PRを開きます。また、`workflow_dispatch`を使用して手動でトリガーすることもできます。

同期スクリプトは`scripts/sync-org-logos.sh`にあり、ローカルで実行できます。

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### セットアップ（1回のみ、フォークごとに）

同期ワークフローはPRを開くため、そのための権限が必要です。リポジトリの設定で次のいずれかを選択します。

1. **アクションによるPR作成を有効にします。** 設定 -> アクション -> 全般 -> 「GitHub Actionsがプルリクエストを作成および承認できるようにする」-> オン。最も簡単な方法です。追加のシークレットを管理する必要はありません。[GitHubドキュメント](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests)
2. **`SYNC_PAT`リポジトリシークレットを提供します。** `contents:write` + `pull-requests:write`スコープを持つ個人用アクセス トークン。この方法では、自動PRで下流のCIもトリガーされます（デフォルトの`GITHUB_TOKEN`はそうしません）。

これらのいずれかを設定しないと、毎日のワークフローは毎日午前中に`gh pr create`で権限エラーが発生して失敗します。

### トラブルシューティング

| 症状 | 原因 | 修正方法 |
| --- | --- | --- |
| `gh pr create` 403 | 上記の設定オプションのいずれも構成されていません。 | 上記の方法1または2を選択します。 |
| 毎日のワークフローでPRが開かれず、何も変更されません。 | 組織内のすべてのリポジトリにロゴがないか、ロゴがすでに一致しています。 | 想定通りです。何もしない実行は正常です。 |
| マニフェストの検証に失敗しました。 | ロゴはダウンロードされましたが、マニフェストのハッシュが一致しません。 | `sync-failure`という名前の問題が自動的に作成されます。ローカルで`brand manifest && brand verify`を再実行します。 |
| 同期PRによって不適切なロゴが導入されました。 | 上流のリポジトリに、破損または誤ったコンテンツの画像が公開されました。 | マージを元に戻します: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`。[SECURITY.md](SECURITY.md#incident-response)を参照してください。 |

## ギャラリーと動的なREADME

一部の製品では、1つの「スラッグ」に複数の表示画像が必要になる場合があります。たとえば、スプライトパックの8方向のキャラクターの向きや、ツールのスクリーンショットセットなどです。`brand`はこれらを、匿名な追加ファイルの山ではなく、唯一の標準ロゴとは異なる、ファーストクラスの**ギャラリー**として扱います。

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

そのギャラリーを**使用するリポジトリのREADME**にレンダリングし、ギャラリーが変更されたときに同期状態に保つには、README内の任意の場所にマーカーペアを配置します。

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

次に、次を実行します。

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync`は、マニフェストからマーカー間のすべてを再生成します。入力が変更されていない限り、すべての実行で決定論的かつバイト単位で同一の出力が得られるため、CIとクリーンに連携できます。`--check`は、書き込みを行わずにずれを報告します（READMEが古い場合は1を返し、最新の場合は0を返します）。これを、このリポジトリの`brand manifest --check`と同様の方法で、使用するリポジトリのCIに組み込みます。これは**動的なREADME**セクションです。マーカーの周りの手動で作成されたコンテンツは変更されません。その間のすべてがマシンによって管理され、いつでも再生成しても安全です。`brand:gallery:`プレフィックスは名前空間化されているため、将来のブロックタイプ（バッジ、統計）も、README内で競合することなく共有できます。

`brand audit`も違いを認識します。1つの「スラッグ」に対して複数のギャラリー`<img>`タグを持つREADMEは、潜在的なバッジの競合としてフラグが立てられなくなりました。まだマーカーブロックに接続されていない場合は、`audit`は代わりに`brand sync`を実行するように促します。

## ロゴを手動で追加する

1. ファイルを`logos/<slug>/readme.png`（または`.jpg`）に配置します。
2. `brand manifest`を実行して、整合性ハッシュを更新します。
3. ロゴと`manifest.json`の両方を一緒にコミットします。
4. CIはプッシュ時にマニフェストを検証します。

## セキュリティ

| 側面 | 詳細 |
|--------|--------|
| **Data touched** | `logos/`内のロゴおよびギャラリー画像ファイル（読み取り）、`manifest.json`（読み取り/書き込み）、READMEファイル（移行中および同期中の読み取り/書き込み—`sync`は常に`brand:gallery:start`/`end`マーカー間のコンテンツのみを再書き込みします）。 |
| **Data NOT touched** | テレメトリ、分析、ネットワーク呼び出しはありません（`sync`も含む—ローカルマニフェストとローカルREADMEの純粋な関数です）、ロゴ/ギャラリーファイルからのコード実行はありません。 |
| **Permissions** | 読み取り: ロゴ/ギャラリーファイル、マニフェスト、README。書き込み: `manifest.json`、README（移行/同期のみ）。 |
| **Network** | なし—完全にオフラインのCLIツールです。 |
| **Telemetry** | 収集または送信されるデータはありません。 |

すべてのロゴは、`manifest.json`内のSHA-256ハッシュによって追跡されます。CIは、`logos/`または`manifest.json`に触れるすべてのプッシュで`brand manifest --check`を実行します。不一致（偶発的な上書き、改ざん、ずれ）が発生すると、ビルドが失敗します。`.png`、`.jpg`、`.jpeg`、`.svg`、`.webp`などの画像ファイルのみが追跡されます。`logos/`内の非画像ファイルは無視されます。

脆弱性に関する報告は、GitHubの[非公開アドバイザリーチャンネル](https://github.com/mcp-tool-shop-org/brand/security/advisories/new)に送信されます。完全なポリシーについては[SECURITY.md](SECURITY.md)、移行ハンドブックについては[docs/handbook.md](docs/handbook.md)を参照してください。

## スコアカード

| カテゴリ | スコア |
|----------|-------|
| A. セキュリティ | 10 |
| B. エラー処理 | 10 |
| C. 運用ドキュメント | 10 |
| D. リリース時の品質管理 | 10 |
| E. ID（ソフト） | 10 |
| **Overall** | **50/50** |

すべてのDラインは緑色です。Node 20/22/24マトリックス、SHAで固定されたアクション、`npm audit`ステップ、Dependabot、tarballの内容、および完全なタグ/リリース/npmの一致（2026-07-01に解決済み — v1.0.2/v1.0.3はnpmには公開されず、git/CHANGELOGとの整合性のために後からタグ付け）。

> 完全な監査：[SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## ライセンス

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
