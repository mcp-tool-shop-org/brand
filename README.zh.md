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

## 为什么？

当每个仓库都包含其自身版本的徽标时，就会出现重复、不一致和差异。品牌重塑意味着需要搜索 100 多个仓库。此仓库解决了这个问题——徽标存储于此处，README 文件通过 `raw.githubusercontent.com` URL 引用它们。

## 结构

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

组织中包含数百个徽标。PNG 文件保持为 PNG 格式。JPEG 文件保持为 JPEG 格式。格式是品牌决策，而不是构建目标。

某个标识的 `readme.<ext>` 始终是唯一的标准徽标。该标识还可能有一个子文件夹，其中包含其他展示图像（精灵图包的角色旋转图、工具的屏幕截图集），清单会明确标记每个资产的“角色”，而不是将所有图像文件都视为相同。请参阅下方的 [图库和动态 README](#galleries--dynamic-readmes)。

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

## 自动同步

一个每日 GitHub 操作 (`sync.yml`) 会扫描组织中的每个仓库，查找徽标，下载新的或已更改的资产，重新生成清单，并打开一个 PR。您也可以通过 `workflow_dispatch` 手动触发它。

同步脚本位于 `scripts/sync-org-logos.sh`，可以在本地运行：

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### 设置（一次性，每个分叉仓库）

同步工作流程会打开一个 PR，因此它需要权限才能执行此操作。在仓库设置中选择以下选项之一：

1. **启用 Actions PR 创建。** 设置 -> 操作 -> 常规 -> “允许 GitHub Actions 创建和批准拉取请求” -> 开启。这是最简单的路径；无需管理额外的密钥。([GitHub 文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **提供 `SYNC_PAT` 仓库密钥。** 具有 `contents:write` + `pull-requests:write` 权限的个人访问令牌。此路径还会触发自动 PR 上的下游 CI（默认 `GITHUB_TOKEN` 不会）。

如果没有这两个选项中的一个，每日工作流程将在每天早上执行 `gh pr create` 时因权限错误而失败。

### 故障排除

| 症状 | 原因 | 解决方法 |
| --- | --- | --- |
| `gh pr create` 403 | 未配置上述任何设置选项 | 选择上述选项 1 或 2 |
| 每日工作流程没有打开 PR，没有任何更改 | 所有组织仓库要么没有徽标，要么徽标已经匹配 | 这是预期的——无操作运行是正常的 |
| 清单验证失败 | 下载了徽标，但清单哈希不匹配 | 将自动创建一个 `sync-failure` 问题；在本地重新运行 `brand manifest && brand verify` |
| 同步 PR 引入了一个错误的徽标 | 上游仓库发布了损坏或内容不正确的图像 | 撤销合并：`git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`。请参阅 [SECURITY.md](SECURITY.md#incident-response)。 |

## 图库和动态 README

某些产品需要每个标识多于一个展示图像——精灵图包的八方向角色旋转图、工具的屏幕截图集。`brand` 将这些视为一类 **图库**，与唯一的标准徽标不同，而不是匿名的一堆额外文件：

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

要将该图库渲染到 **目标仓库的 README 文件中**，并在图库更改时保持同步，请在 README 中的任何位置放置一个标记对：

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

然后运行：

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` 会从清单中重新生成标记之间的所有内容——每次运行时，如果输入未更改，则输出是确定性的、字节完全相同的，因此它可以与 CI 很好地组合。 `--check` 在不进行写入的情况下报告差异（如果 README 文件已过时，则退出代码为 1；如果当前，则为 0），将其连接到目标仓库的 CI 中，就像 `brand manifest --check` 限制此操作一样。这是一个 **动态 README** 部分：标记周围的手动编写的内容不会受到影响；它们之间的所有内容都由机器拥有，并且可以随时安全地重新生成。 `brand:gallery:` 前缀是命名空间化的，因此未来的块类型（徽章、统计信息）可以在不发生冲突的情况下共享一个 README 文件。

`brand audit` 也能理解这种区别——README 文件中包含多个针对某个标识的 `<img>` 标签，不再会被标记为可能的徽章冲突；如果尚未连接到标记块，`audit` 会提示使用 `brand sync`。

## 手动添加徽标

1. 将文件放入 `logos/<slug>/readme.png`（或 `.jpg`）中
2. 运行 `brand manifest` 以更新完整性哈希值
3. 同时提交徽标和 `manifest.json`
4. CI 在推送时验证清单

## 安全性

| 方面 | 详细信息 |
|--------|--------|
| **Data touched** | `logos/` 中的徽标和图库图像文件（读取）、`manifest.json`（读/写）、README 文件（在迁移和同步期间进行读取/写入——`sync` 仅会重写 `brand:gallery:start`/`end` 标记之间的内容） |
| **Data NOT touched** | 没有遥测、没有分析，没有网络调用（包括 `sync`——它是一个纯函数，是本地清单 + 本地 README 的函数），徽标/图库文件中没有代码执行 |
| **Permissions** | 读取：徽标/图库文件、清单、README 文件。写入：manifest.json、README 文件（仅在迁移/同步时） |
| **Network** | 无——完全离线的 CLI 工具 |
| **Telemetry** | 没有收集或发送任何内容 |

每个徽标都通过 `manifest.json` 中的 SHA-256 哈希进行跟踪。CI 在每次触及 `logos/` 或 `manifest.json` 时运行 `brand manifest --check`。任何不匹配——意外覆盖、篡改、漂移——都会导致构建失败。仅图像文件（`.png`、`.jpg`、`.jpeg`、`.svg`、`.webp`）会被跟踪；`logos/` 下的非图像文件将被忽略。

漏洞报告会发送到 GitHub 的[私有咨询渠道](https://github.com/mcp-tool-shop-org/brand/security/advisories/new)。请参阅 [SECURITY.md](SECURITY.md) 以获取完整策略，并参阅 [docs/handbook.md](docs/handbook.md) 以获取迁移手册。

## 评估指标

| 类别 | 得分 |
|----------|-------|
| A. 安全性 | 10 |
| B. 错误处理 | 10 |
| C. 操作文档 | 10 |
| D. 发布规范 | 10 |
| E. 身份验证（软） | 10 |
| **Overall** | **50/50** |

所有 D 行均为绿色——Node 20/22/24 矩阵、SHA 固定操作、`npm audit` 步骤、Dependabot、tarball 内容以及完整的标签/发布/npm 一致性（已解决，日期为 2026-07-01 ——v1.0.2/v1.0.3 版本从未发布到 npm；之后添加标签以实现 git/CHANGELOG 的一致性）。

> 完整审计：[SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## 许可证

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
