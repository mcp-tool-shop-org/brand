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

当每个仓库都包含其自己的徽标副本时，就会出现重复、差异和不一致的情况。品牌重塑意味着需要搜索 100 多个仓库。这个仓库解决了这个问题——徽标都存储在这里，README 文件通过 `raw.githubusercontent.com` URL 引用它们。

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

每个“slug”都有一个唯一的 `readme.<ext>`，即唯一的标准徽标。一个“slug”还可以有一个包含其他展示图像的子文件夹（例如，精灵图包的角色不同角度视图，或工具的屏幕截图集），清单文件会明确地标记每个资产的 `role`，而不是将每个图像文件都视为相同。请参阅下面的 [图库和动态 README](#图库和动态-readme)。

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

## 自动同步

每天运行一次的 GitHub 操作（`sync.yml`）会扫描组织中的每个仓库，查找徽标，下载新的或已更改的资产，重新生成清单文件，并创建一个 PR。您也可以通过 `workflow_dispatch` 手动触发它。

同步脚本位于 `scripts/sync-org-logos.sh`，可以在本地运行：

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### 设置（一次性，每个分叉仓库）

同步工作流会创建一个 PR，因此它需要执行此操作的权限。在仓库设置中选择以下选项之一：

1. **启用操作 PR 创建。** 设置 -> 操作 -> 常规 -> “允许 GitHub 操作创建和批准拉取请求” -> 开启。这是最简单的路径；无需管理额外的密钥。([GitHub 文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **提供一个 `SYNC_PAT` 仓库密钥。** 具有 `contents:write` + `pull-requests:write` 权限的个人访问令牌。此路径还会触发自动 PR 上的下游 CI（默认 `GITHUB_TOKEN` 不会触发）。

如果没有这两个选项中的任何一个，每天的工作流都会在 `gh pr create` 时因权限错误而失败。

### 故障排除

| 症状 | 原因 | 解决方法 |
| --- | --- | --- |
| `gh pr create` 403 | 上述设置选项中没有配置 | 选择上述选项 1 或 2 |
| 每天的工作流没有创建 PR，没有发生任何更改 | 所有组织仓库要么没有徽标，要么徽标已经匹配 | 这是预期的——无操作运行是正常的 |
| 清单验证失败 | 下载了徽标，但清单哈希不匹配 | 系统会自动创建一个 `sync-failure` 问题；在本地重新运行 `brand manifest && brand verify` |
| 同步 PR 引入了一个错误的徽标 | 上游仓库发布了一个损坏或内容错误的图像 | 撤销合并：`git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`。请参阅 [SECURITY.md](SECURITY.md#incident-response) |

## 图库和动态 README

某些产品需要每个“slug”的多个展示图像——例如，精灵图包的 8 个方向的角色视图，或工具的屏幕截图集。`brand` 将这些视为一类 **图库**，与唯一的标准徽标不同，而不是一堆匿名的额外文件：

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

要将该图库渲染到 **目标仓库的 README 文件** 中，并随着图库的更改保持同步，请在 README 文件中的任何位置放置一个标记对：

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

然后运行：

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` 会从清单文件中重新生成标记之间的所有内容——每次运行，只要输入没有更改，输出就是确定性的、字节完全相同的，因此它可以与 CI 很好地结合。`--check` 会报告差异，而不会进行写入（如果 README 文件已过时，则退出代码为 1，如果 README 文件是最新的，则退出代码为 0），将其连接到目标仓库的 CI 中，就像 `brand manifest --check` 连接到此仓库一样。这是一个 **动态 README** 部分：标记周围的手动编写的内容不会被触及；标记之间的所有内容都由机器拥有，并且可以随时安全地重新生成。`brand:gallery:` 前缀是命名空间化的，因此未来的块类型（徽章、统计信息）可以在不发生冲突的情况下共享 README 文件。

`brand audit` 也会理解其中的区别——一个 README 文件中包含多个图库 `<img>` 标记的“slug”不再被标记为可能的徽章冲突；如果它尚未连接到标记块，则 `audit` 会提示使用 `brand sync`。

## 手动添加徽标

1. 将文件放入 `logos/<slug>/readme.png`（或 `.jpg`）
2. 运行 `brand manifest` 以更新完整性哈希
3. 同时提交徽标和 `manifest.json`
4. CI 在推送时验证清单

步骤 2 很容易被忘记，并且本地没有工具会提示——徽标提交
成功，站点仍然可以构建，测试仍然通过，并且故障仅在推送后在 CI 中显示。因此，一个 `pre-commit` 钩子现在会为您执行此操作：在 `logos/` 下暂存一个更改，然后它会在同一个提交中重新生成并暂存 `manifest.json`。

它会安装到 `npm install`（通过 `prepare` → [`scripts/install-hooks.mjs`](scripts/install-hooks.mjs)，
后者将 `core.hooksPath` 指向 [`.githooks/`](.githooks/)）。要手动安装它：

```bash
git config core.hooksPath .githooks
```

该钩子需要构建 `dist/`（`npm run build`），因为它运行 CLI，并且它
不会猜测何时 `logos/` 具有未暂存的更改——清单文件是从工作树中哈希的，因此，如果这与您正在提交的内容不一致，它写入的哈希值将描述提交不包含的字节。`git commit --no-verify` 会跳过它，并且 CI 仍然会强制执行相同的不变性。

## 安全性

| 方面 | 详细信息 |
|--------|--------|
| **Data touched** | 徽标和图库图像文件位于 `logos/`（读取）、`manifest.json`（读取/写入）、README 文件（在迁移和同步期间读取/写入——`sync` 仅会重写 `brand:gallery:start`/`end` 标记之间的内容） |
| **Data NOT touched** | 没有遥测、没有分析，没有从徽标/图库文件中执行代码 |
| **Permissions** | 读取：徽标/图库文件、清单、README 文件。写入：manifest.json、README 文件（仅迁移/同步），以及 `logos/<slug>/`（仅 `remove`，这需要 `--yes`） |
| **Network** | 默认情况下没有。`brand audit --remote` 是唯一的例外，并且是严格可选的——如果没有该标志，则不会进行任何网络调用。`sync`、`verify`、`manifest`、`stats`、`migrate`、`add-gallery`、`remove` 和 `history` 都是完全离线的。 |
| **Telemetry** | 没有收集或发送 |

每个徽标都由 SHA-256 哈希值在 `manifest.json` 中跟踪。CI 在每次触及 `logos/` 或 `manifest.json` 时运行 `brand manifest --check`。仅跟踪图像文件（`.png`、`.jpg`、`.jpeg`、`.svg`、`.webp`）；位于 `logos/` 下的非图像文件将被忽略。

**哈希值的作用以及它不能证明的内容。** 哈希值不匹配可以检测到意外的覆盖、文件损坏或磁盘与清单之间的差异——这些都是常见的故障。它**不能**阻止有意的篡改：任何具有写入权限的人都可以替换徽标、运行`brand manifest`，然后提交两者，之后`verify`就会通过验证。哈希值证明树的内部一致性，但不能证明其内容已获得批准。真正弥合这一差距的是仓库控制加上每日同步的差异检测机制，该机制会交叉检查每个注册表徽标与其上游仓库——请参阅[SECURITY.md](SECURITY.md#the-limit-of-the-manifest--read-this-before-trusting-it)和[`.github/SECURITY-CONTROLS.md`](.github/SECURITY-CONTROLS.md)。

漏洞报告请发送至GitHub的[私有咨询渠道](https://github.com/mcp-tool-shop-org/brand/security/advisories/new)。有关完整策略，请参阅[SECURITY.md](SECURITY.md)；有关迁移手册，请参阅[docs/handbook.md](docs/handbook.md)。

## 评分卡

| 类别 | 得分 |
|----------|-------|
| A. 安全性 | 10 |
| B. 错误处理 | 10 |
| C. 操作文档 | 10 |
| D. 发布规范 | 10 |
| E. 身份（软性） | 10 |
| **Overall** | **50/50** |

所有 D 行均为绿色——Node 20/22/24 矩阵、SHA 固定操作、`npm audit` 步骤、Dependabot、tarball 内容以及完整的标签/发布/npm 一致性（已解决，日期为 2026-07-01——v1.0.2/v1.0.3从未发布到 npm；为了与 git/CHANGELOG 保持一致，进行了追溯性标记）。

> 完整审计：[SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## 许可证

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
