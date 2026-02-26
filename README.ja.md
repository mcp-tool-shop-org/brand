<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

[mcp-tool-shop-org] GitHub組織向けの、ブランドアセットの一元管理レジストリです。このリポジトリには、すべてのロゴが格納されています。各READMEファイルは、このリポジトリを指しています。一度更新すれば、すべての場所で更新されます。

## なぜか

各リポジトリが独自のロゴコピーを持っていると、重複、乖離、および不整合が発生します。ブランド変更を行うには、80以上のリポジトリを個別に確認する必要があります。このリポジトリはその問題を解決します。ロゴはここに保存され、READMEファイルは`raw.githubusercontent.com`のURLを通じてそれらを参照します。

## 構造

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 80+ repos
```

81個のロゴが、81個のリポジトリに分散して保存されています。PNGファイルはPNGのまま、JPEGファイルはJPEGのままです。ファイル形式は、ビルドの対象ではなく、ブランド側の決定です。

## CLI (コマンドラインインターフェース)

```bash
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

詳細については、[docs/handbook.md](docs/handbook.md)を参照してください。シンボリックリンクが機能しない理由、バッジがロゴ検出と競合する理由、`<img>`タグを壊すMarkdownレンダリングの問題、および移行の安全プロトコルについて説明されています。

## ライセンス

[MIT](LICENSE)
