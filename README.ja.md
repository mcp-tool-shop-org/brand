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

各リポジトリがロゴの独自のコピーを持つ場合、重複、ずれ、および不整合が発生します。ブランド変更は、100以上のリポジトリを検索することを意味します。このリポジトリはその問題を解決します。ロゴはここに保存され、READMEファイルは`raw.githubusercontent.com` URLを通じてそれらを参照します。

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

スラグの`readme.<ext>`は、常に単一の標準ロゴです。スラグには、追加の表示画像のサブフォルダーが1つ含まれている場合があります（スプライトパックのキャラクターの向き、ツールのスクリーンショットセット）。マニフェストタグは、すべての画像ファイルを同じように扱うのではなく、各アセットの`role`を明示的に記述します。[ギャラリーと動的なREADME](#galleries--dynamic-readmes)を参照してください。

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

# Audit against the live org without cloning anything, and reconcile the
# registry against it — reports renamed, archived, and orphaned slugs.
# Opt-in network access; needs GH_TOKEN or GITHUB_TOKEN.
brand audit --remote --org mcp-tool-shop-org

# Show a slug's asset history from git — added/changed/removed, with hashes
brand history <slug>
brand history <slug> --limit 5 --json

# Remove a slug (or just one of its galleries). Destructive, so --yes is
# required; --dry-run shows exactly what would go first.
brand remove <slug> --dry-run
brand remove <slug> --yes
brand remove <slug> --gallery turnarounds --yes

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

毎日のGitHubアクション（`sync.yml`）は、組織内のすべてのリポジトリをスキャンしてロゴを探し、新しいまたは変更されたアセットをダウンロードし、マニフェストを再生成し、PRを開きます。また、`workflow_dispatch`を使用して手動でトリガーすることもできます。

同期スクリプトは`scripts/sync-org-logos.sh`にあり、ローカルで実行できます。

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### セットアップ（一度だけ、フォークごとに）

同期ワークフローはPRを開くため、それを行うための権限が必要です。リポジトリの設定で次のいずれかを選択します。

1. **アクションによるPR作成を有効にします。** 設定 -> アクション -> 全般 -> 「GitHub Actionsがプルリクエストを作成および承認できるようにする」-> オン。最も簡単な方法です。追加のシークレットを管理する必要はありません。[GitHubドキュメント](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests)
2. **`SYNC_PAT`リポジトリシークレットを提供します。** `contents:write`および`pull-requests:write`スコープを持つ個人用アクセス トークン。この方法では、自動PRで下流のCIもトリガーされます（デフォルトの`GITHUB_TOKEN`はそうしません）。

これらのいずれかを設定しない場合、毎日のワークフローは毎日午前`gh pr create`時に権限エラーが発生して失敗します。

### トラブルシューティング

| 症状 | 原因 | 修正方法 |
| --- | --- | --- |
| `gh pr create` 403 | 上記の設定オプションのいずれも構成されていません。 | 上記の方法1または2を選択します。 |
| 毎日のワークフローはPRを開かず、何も変更されません。 | すべての組織リポジトリにはロゴがありません。または、ロゴがすでに一致しています。 | 想定通りです。何もしない実行は正常です。 |
| マニフェストの検証に失敗しました。 | ロゴはダウンロードされましたが、マニフェストハッシュが一致しません。 | `sync-failure`の問題が自動的に作成されます。ローカルで`brand manifest && brand verify`を再実行します。 |
| 同期PRによって不良のロゴが導入されました。 | 上流リポジトリは、破損したコンテンツまたは誤ったコンテンツの画像を発行しました。 | マージを元に戻します：`git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`。[SECURITY.md](SECURITY.md#incident-response)を参照してください。 |

## ギャラリーと動的なREADME

一部の製品では、スラグごとに複数の表示画像が必要です。たとえば、スプライトパックの8方向のキャラクターの向きや、ツールのスクリーンショットセットなどです。`brand`は、これらを匿名な追加ファイルの山ではなく、単一の標準ロゴとは異なる、ファーストクラスの**ギャラリー**として扱います。

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

`sync` regenerates everything between the markers from the manifest — deterministic, byte-identical output on every run with unchanged inputs, so it composes cleanly with CI. `--check` reports drift without writing (exit 1 if the README is stale, 0 if it's current) — wire it into a consuming repo's CI the same way `brand manifest --check` gates this one. This is a **dynamic README** section: hand-authored content around the markers is untouched; everything between them is machine-owned and safe to regenerate at any time. The `brand:gallery:` prefix is namespaced so future block types (badges, stats) can share a README without collision.

`brand audit`も違いを認識しています。1つのスラグに複数のギャラリー`<img>`タグがあるREADMEは、潜在的なバッジの競合としてフラグが立てられなくなりました。まだマーカーブロックに接続されていない場合は、代わりに`audit`で`brand sync`への誘導が行われます。

## ロゴを手動で追加する

1. ファイルを`logos/<slug>/readme.png`（または`.jpg`）に配置します。
2. 整合性ハッシュを更新するために、`brand manifest`を実行します。
3. ロゴと`manifest.json`の両方をコミットします。
4. CIはプッシュ時にマニフェストを検証します。

## セキュリティ

| 側面 | 詳細 |
|--------|--------|
| **Data touched** | ロゴおよびギャラリー画像ファイルは、`logos/`（読み取り）、`manifest.json`（読み取り/書き込み）、READMEファイルにあります（移行中および同期中に読み取り/書き込み。`sync`は、常に`brand:gallery:start`/`end`マーカー間のコンテンツのみを再書き込みします）。 |
| **Data NOT touched** | ロゴ/ギャラリーファイルからのテレメトリ、分析、コード実行はありません。 |
| **Permissions** | 読み取り：ロゴ/ギャラリーファイル、マニフェスト、README。書き込み：manifest.json、README（移行/同期のみ）、および`logos/<slug>/`（`remove`のみ。これには`--yes`が必要です）。 |
| **Network** | デフォルトではありません。`brand audit --remote`は唯一の例外であり、厳密にオプトインです。このフラグがない場合、ネットワーク呼び出しは行われません。`sync`、`verify`、`manifest`、`stats`、`migrate`、`add-gallery`、`remove`、および`history`はすべて完全にオフラインです。 |
| **Telemetry** | 収集または送信されるデータはありません。 |

すべてのロゴは、`manifest.json`でSHA-256ハッシュによって追跡されます。CIは、`logos/`または`manifest.json`に触れるすべてのプッシュで`brand manifest --check`を実行します。画像ファイル（`.png`、`.jpg`、`.jpeg`、`.svg`、`.webp`）のみが追跡され、`logos/`の下にある非画像ファイルは無視されます。

**ハッシュが証明するものと証明しないもの。** ハッシュ値の不一致は、意図しない上書き、破損したファイル、またはディスクとマニフェスト間のずれといった、日常的な問題を検出します。ただし、これは悪意のある改ざんを阻止するものではありません。書き込み権限を持つユーザーであれば、ロゴを置き換えたり、`brand manifest`を実行したり、両方をコミットすることができます。その後、`verify`は問題なく通過します。ハッシュが証明するのは、ツリー構造の内部整合性であり、その内容が承認されたかどうかではありません。このギャップを実際に埋めるのは、リポジトリ制御と、毎日の同期における差異検出機能です。これにより、すべてのレジストリロゴがアップストリームのリポジトリと比較して検証されます（詳細については、[SECURITY.md](SECURITY.md#the-limit-of-the-manifest--read-this-before-trusting-it) および [`.github/SECURITY-CONTROLS.md`](.github/SECURITY-CONTROLS.md) を参照）。

脆弱性に関する報告は、GitHubの[プライベートアドバイザリーチャンネル](https://github.com/mcp-tool-shop-org/brand/security/advisories/new)に送信してください。完全なポリシーについては[SECURITY.md](SECURITY.md)を、移行ハンドブックについては[docs/handbook.md](docs/handbook.md)を参照してください。

## スコアカード

| カテゴリ | スコア |
|----------|-------|
| A. セキュリティ | 10 |
| B. エラー処理 | 10 |
| C. 運用ドキュメント | 10 |
| D. リリース管理 | 10 |
| E. ID（ソフト） | 10 |
| **Overall** | **50/50** |

すべてのDラインは緑色です。Node 20/22/24マトリックス、SHAで固定されたアクション、`npm audit`ステップ、Dependabot、tarballの内容、および完全なタグ/リリース/npmの一致（2026-07-01に解決 - v1.0.2/v1.0.3はnpmには公開されず、git/CHANGELOGとの整合性のために後からタグ付け）。

> 完全な監査：[SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## ライセンス

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
