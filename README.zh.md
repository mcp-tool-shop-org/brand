<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

为 [mcp-tool-shop-org](https://github.com/mcp-tool-shop-org) GitHub 组织提供的集中式品牌资产注册库。一个仓库包含所有 logo。每个 README 文件都指向这里。只需更新一次，即可在所有地方同步更新。

## 原因

当每个仓库都包含自己的 logo 副本时，就会出现重复、偏差和不一致的情况。品牌重塑意味着需要在 80 多个仓库中进行搜索。这个仓库解决了这个问题——所有 logo 都存储在这里，README 文件通过 `raw.githubusercontent.com` URL 链接到它们。

## 结构

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 80+ repos
```

81 个仓库，每个仓库包含一个 logo。PNG 格式的 logo 保持 PNG 格式，JPEG 格式的 logo 保持 JPEG 格式。文件格式是品牌决策，而不是构建目标。

## 命令行工具 (CLI)

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

## 添加新的 logo

1. 将文件放入 `logos/<slug>/readme.png` (或 `.jpg`) 目录中。
2. 运行 `brand manifest` 命令以更新完整性哈希值。
3. 同时提交 logo 文件和 `manifest.json` 文件。
4. CI 系统在每次提交时验证 `manifest.json` 文件的内容。

## 安全性

每个 logo 都通过 SHA-256 哈希值在 `manifest.json` 文件中进行跟踪。CI 系统在每次涉及 `logos/` 目录或 `manifest.json` 文件的提交时，都会运行 `brand manifest --check` 命令。任何不匹配的情况——意外覆盖、篡改或偏差——都会导致构建失败。

请参阅 [docs/handbook.md](docs/handbook.md) 获取完整信息：为什么符号链接不可用，徽章如何与 logo 检测冲突，以及 markdown 渲染中可能导致 `<img>` 标签失效的陷阱，以及迁移的安全协议。

## 许可证

[MIT](LICENSE)
