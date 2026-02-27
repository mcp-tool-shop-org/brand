<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## 原因

当每个代码仓库都包含自己的Logo副本时，就会出现重复、偏差和不一致的情况。重新设计品牌意味着需要在100多个代码仓库中进行查找。这个代码仓库解决了这个问题——Logo文件存储在此处，README文件通过`raw.githubusercontent.com`链接引用它们。

## 结构

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

组织内共有117个Logo。PNG格式的Logo保持为PNG格式，JPEG格式的Logo保持为JPEG格式。文件格式是品牌决策，而不是构建目标。

## 命令行工具 (CLI)

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

## 添加新的 logo

1. 将文件放入 `logos/<slug>/readme.png` (或 `.jpg`) 目录中。
2. 运行 `brand manifest` 命令以更新完整性哈希值。
3. 同时提交 logo 文件和 `manifest.json` 文件。
4. CI 系统在每次提交时验证 `manifest.json` 文件的内容。

## 安全性

每个 logo 都通过 SHA-256 哈希值在 `manifest.json` 文件中进行跟踪。CI 系统在每次涉及 `logos/` 目录或 `manifest.json` 文件的提交时，都会运行 `brand manifest --check` 命令。任何不匹配的情况——意外覆盖、篡改或偏差——都会导致构建失败。

请参阅[SECURITY.md](SECURITY.md)以获取完整的安全策略，以及[docs/handbook.md](docs/handbook.md)以获取迁移指南。

## 隐私

此工具不收集任何遥测数据。所有操作仅在本地文件系统中进行。

## 评估指标

| 类别 | 得分 | 备注 |
|----------|-------|-------|
| A. 安全性 | 10/10 | SECURITY.md，SHA-256完整性校验，无网络连接，无遥测数据。 |
| B. 错误处理 | 8/10 | 结构化错误信息，清晰的命令行输出，退出码。 |
| C. 操作文档 | 10/10 | README文件，CHANGELOG文件，操作手册，完整的命令行文档。 |
| D. 发布质量 | 9/10 | CI集成完整性检查，29个测试用例，版本对齐。 |
| E. 身份标识 | 10/10 | Logo，翻译文件，着陆页，元数据。 |
| **Total** | **47/50** | |

## 许可证

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
