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

各リポジトリが独自のロゴのコピーを持っていると、重複、乖離、そして一貫性の欠如が生じます。ブランド変更を行うには、100件以上のリポジトリを調査する必要があります。このリポジトリは、その問題を解決します。ロゴはここに保存され、READMEファイルは`raw.githubusercontent.com`のURLを通じてそれらを参照します。

## 構造

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

組織全体で117種類のロゴがあります。PNGファイルはPNGのまま、JPEGファイルはJPEGのままです。ファイル形式は、ビルドの対象ではなく、ブランドの決定事項です。

## CLI (コマンドラインインターフェース)

```bash
npm install -g @mcptoolshop/brand

# Verify all logos match their manifest hashes
brand verify

# Regenerate manifest after adding/replacing a logo
brand manifest

# CI mode — fail if manifest is out of date
brand manifest --check

# Audit repos for broken refs, badge collisions, indentation traps
brand audit --repos /path/to/clones

# Migrate READMEs to point at brand repo (dry run first)
brand migrate --repos /path/to/clones --dry-run
brand migrate --repos /path/to/clones
```

## 新しいロゴの追加

1. ファイルを`logos/<slug>/readme.png`（または`.jpg`）に配置します。
2. `brand manifest`コマンドを実行して、整合性ハッシュを更新します。
3. ロゴと`manifest.json`ファイルを一緒にコミットします。
4. CI（継続的インテグレーション）は、プッシュ時に`manifest.json`の内容を検証します。

## セキュリティ

すべてのロゴは、`manifest.json`ファイル内のSHA-256ハッシュによって追跡されます。CIは、`logos/`または`manifest.json`に影響を与えるすべてのプッシュに対して、`brand manifest --check`コマンドを実行します。不整合（意図しない上書き、改ざん、乖離など）が発生した場合、ビルドは失敗します。

セキュリティポリシーについては[SECURITY.md](SECURITY.md) を、移行に関するガイドについては[docs/handbook.md](docs/handbook.md) を参照してください。

## プライバシー

このツールは、テレメトリーデータを収集しません。すべての操作はローカルファイルシステム上でのみ行われます。

## 評価

| カテゴリ | 評価 | 備考 |
|----------|-------|-------|
| A. セキュリティ | 10/10 | SECURITY.md、SHA-256による整合性チェック、ネットワーク接続なし、テレメトリーデータ収集なし |
| B. エラー処理 | 8/10 | 構造化されたエラー、明確なCLI出力、終了コード |
| C. 運用ドキュメント | 10/10 | README、CHANGELOG、ハンドブック、完全なCLIドキュメント |
| D. リリースの品質 | 9/10 | CIによる整合性チェック、29個のテスト、バージョン管理との整合性 |
| E. 識別 | 10/10 | ロゴ、翻訳、ランディングページ、メタデータ |
| **Total** | **47/50** | |

## ライセンス

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
