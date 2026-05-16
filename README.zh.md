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

## 为什么

当每个仓库都包含自己的Logo副本时，就会出现重复、偏差和不一致的情况。重新设计品牌意味着需要搜索100多个仓库。这个仓库解决了这个问题——Logo都存储在这里，README文件通过`raw.githubusercontent.com`链接引用它们。

## 结构

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

组织内的数百个Logo。PNG文件保持为PNG格式，JPEG文件保持为JPEG格式。格式是品牌决策，而不是构建目标。

## 命令行工具 (CLI)

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

## 自动同步

一个每日GitHub Action (`sync.yml`) 扫描组织内的每个仓库中的Logo，下载新的或已更改的资源，重新生成清单，并创建一个拉取请求 (PR)。您也可以通过`workflow_dispatch`手动触发它。

同步脚本位于`scripts/sync-org-logos.sh`，可以在本地运行：

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### 设置（一次性，每个分支）

同步工作流会创建一个PR，因此它需要相应的权限。在仓库设置中选择以下选项之一：

1. **启用Actions PR创建。** 设置 -> Actions -> General -> "允许GitHub Actions创建和批准拉取请求" -> 启用。 这是最简单的方案，无需管理额外的密钥。 ([GitHub文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **提供一个`SYNC_PAT`仓库密钥。** 具有`contents:write` + `pull-requests:write`权限的个人访问令牌。 这种方案还会触发自动PR的下游CI（默认的`GITHUB_TOKEN`无法实现）。

如果没有以上两种设置，每日工作流每天早上都会在`gh pr create`时失败，并出现权限错误。

### 故障排除

| 症状 | 原因 | 解决方法 |
| --- | --- | --- |
| `gh pr create` 403 | 上述任何一种设置都没有配置 | 选择上述选项1或选项2 |
| 每日工作流没有创建PR，没有任何更改 | 组织内的所有仓库要么没有Logo，要么Logo已经匹配 | 预期行为——无操作运行是正常的 |
| 清单验证失败 | 下载了Logo，但清单哈希值不匹配 | 会自动创建一个`sync-failure`问题；在本地重新运行`brand manifest && brand verify` |
| 一个同步PR引入了错误的Logo | 上游仓库发布了损坏的或内容错误的图像 | 回滚合并：`git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`。 参见[SECURITY.md](SECURITY.md#incident-response) |

## 手动添加Logo

1. 将文件放入`logos/<slug>/readme.png`（或`.jpg`）
2. 运行`brand manifest`以更新完整性哈希值
3. 同时提交Logo和`manifest.json`
4. CI在推送时验证清单

## 安全性

| 方面 | 详细信息 |
|--------|--------|
| **Data touched** | `logos/`目录下的Logo文件（只读），`manifest.json`文件（读/写），README文件（在迁移期间读/写） |
| **Data NOT touched** | 没有遥测，没有分析，没有网络调用，没有来自Logo文件的代码执行 |
| **Permissions** | 读取：Logo文件、清单、README文件。 写入：`manifest.json`文件、README文件（仅在迁移时） |
| **Network** | 无——完全离线的命令行工具 |
| **Telemetry** | 无——不收集或发送任何数据 |

每个Logo都通过SHA-256哈希值在`manifest.json`中进行跟踪。 CI在每次修改`logos/`或`manifest.json`的推送时运行`brand manifest --check`。 任何不匹配的情况（意外覆盖、篡改、偏差）都会导致构建失败。 仅跟踪图像文件（`.png`、`.jpg`、`.jpeg`、`.svg`、`.webp`）；`logos/`目录下的非图像文件将被忽略。

漏洞报告请发送至 GitHub 的[私有安全咨询渠道](https://github.com/mcp-tool-shop-org/brand/security/advisories/new)。请参阅[SECURITY.md](SECURITY.md)以获取完整的政策，以及[docs/handbook.md](docs/handbook.md)以获取迁移指南。

## 评分卡

| 类别 | 评分 |
|----------|-------|
| A. 安全性 | 10 |
| B. 错误处理 | 10 |
| C. 操作文档 | 10 |
| D. 发布流程 | 9 |
| E. 身份验证（软性要求） | 10 |
| **Overall** | **49/50** |

D 的评分是 9/10，但仍有一项待完善：远程 Git 标签仅支持到 v1.0.1 版本，但 CHANGELOG 文档记录了 v1.0.2 + v1.0.3 版本的发布。其他 D 类别的各项指标均为绿色，包括 Node 18/20/22 版本支持、使用 SHA 值固定版本的操作、`npm audit` 步骤、Dependabot 以及 tarball 文件的内容。

> 完整审计报告：[SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## 许可证

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
