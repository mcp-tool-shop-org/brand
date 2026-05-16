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

## なぜ

各リポジトリにロゴのコピーが保存されていると、重複、乖離、および不整合が発生します。ブランド変更を行うには、100以上のリポジトリを検索する必要があります。このリポジトリはそれを解決します。ロゴはここに保存され、READMEファイルは`raw.githubusercontent.com`のURLを介してそれらを参照します。

## 構造

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

組織全体に数百のロゴがあります。PNGはPNGのまま、JPEGはJPEGのままです。フォーマットはブランドの決定であり、ビルドの対象ではありません。

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
```

## 自動同期

毎日、GitHub Action (`sync.yml`) が組織内のすべてのリポジトリをロゴについてスキャンし、新しいアセットまたは変更されたアセットをダウンロードし、マニフェストを再生成し、プルリクエストを開きます。また、`workflow_dispatch` を使用して手動でトリガーすることもできます。

同期スクリプトは `scripts/sync-org-logos.sh` にあり、ローカルで実行できます。

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### セットアップ (初回のみ、フォークごとに)

同期ワークフローはプルリクエストを開くため、それを行うための権限が必要です。リポジトリの設定で次のいずれかを選択してください。

1. **GitHub Actionsによるプルリクエストの作成を有効にする。** 設定 -> Actions -> General -> "GitHub Actionsがプルリクエストを作成および承認することを許可する" -> ON。最も簡単な方法です。追加のシークレットを管理する必要はありません。([GitHubドキュメント](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **`SYNC_PAT` という名前のリポジトリシークレットを提供する。** `contents:write` と `pull-requests:write` スコープを持つパーソナルアクセストークン。この方法では、自動プルリクエストに対するダウンストリームのCIもトリガーされます (デフォルトの `GITHUB_TOKEN` は使用されません)。

これらのいずれかがない場合、毎朝、`gh pr create` で権限エラーが発生し、ワークフローが失敗します。

### トラブルシューティング

| 症状 | 原因 | 解決策 |
| --- | --- | --- |
| `gh pr create` 403エラー | 上記のいずれのセットアップオプションも設定されていません。 | 上記の手順1または2を選択してください。 |
| 毎日のワークフローがプルリクエストを開かず、何も変更されない。 | 組織内のすべてのリポジトリにロゴがないか、またはロゴがすでに一致している。 | これは正常な動作です。変更がない場合は問題ありません。 |
| マニフェストの検証に失敗しました。 | ロゴはダウンロードされましたが、マニフェストのハッシュが一致しません。 | `sync-failure` という問題が自動的に作成されます。ローカルで `brand manifest && brand verify` を再実行してください。 |
| 同期プルリクエストで不正なロゴが導入された。 | アップストリームリポジトリが破損した画像または誤ったコンテンツの画像を公開した。 | マージを元に戻します: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`。 [SECURITY.md](SECURITY.md#incident-response) を参照してください。 |

## ロゴを手動で追加する

1. ファイルを `logos/<slug>/readme.png` (または `.jpg`) に配置します。
2. `brand manifest` を実行して、整合性ハッシュを更新します。
3. ロゴと `manifest.json` を一緒にコミットします。
4. CIは、プッシュ時にマニフェストを検証します。

## セキュリティ

| 側面 | 詳細 |
|--------|--------|
| **Data touched** | `logos/` 内のロゴファイル (読み取り)、`manifest.json` (読み取り/書き込み)、READMEファイル (移行中に読み取り/書き込み) |
| **Data NOT touched** | テレメトリ、分析、ネットワーク接続、ロゴファイルからのコード実行はありません。 |
| **Permissions** | 読み取り: ロゴファイル、マニフェスト、README。書き込み: `manifest.json`、README (移行時のみ) |
| **Network** | なし - 完全オフラインのCLIツールです。 |
| **Telemetry** | 収集または送信されるものはありません。 |

すべてのロゴは、`manifest.json` 内のSHA-256ハッシュによって追跡されます。CIは、`logos/` または `manifest.json` が変更されたすべてのプッシュで `brand manifest --check` を実行します。不一致 (偶発的な上書き、改ざん、乖離) があると、ビルドが失敗します。`logos/` 内の画像ファイル (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) のみが追跡されます。`logos/` 内の画像ファイル以外のファイルは無視されます。

脆弱性に関する報告は、GitHubの[非公開の報告チャンネル](https://github.com/mcp-tool-shop-org/brand/security/advisories/new)までお願いします。詳細なポリシーについては[SECURITY.md](SECURITY.md) を、移行に関するガイドについては[docs/handbook.md](docs/handbook.md) を参照してください。

## スコアカード

| カテゴリ | スコア |
|----------|-------|
| A. セキュリティ | 10 |
| B. エラー処理 | 10 |
| C. 運用ドキュメント | 10 |
| D. リリースの品質 | 9 |
| E. 認証 (ソフト) | 10 |
| **Overall** | **49/50** |

Dのスコアは10点満点中9点で、1つのフォローアップが必要です。リモートのGitタグはv1.0.1までしか到達していませんが、CHANGELOGにはv1.0.2およびv1.0.3が記載されています。Dの他の項目はすべて良好です。Node 18/20/22の環境、SHAで固定されたアクション、`npm audit`の実行、Dependabot、tarballの内容などです。

> 詳細な監査結果: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## ライセンス

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
