# Neko Assets

> 资产管理：版本控制 (Git/LFS)、云端同步、CI/CD 自动渲染

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host + 子包 `@neko/asset`（素材库核心）
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：媒体资产的 Git/LFS 版本控制、多云同步、CI/CD 自动渲染触发
- **入口**：`src/extension.ts`（单包结构）
- **子包**：`packages/asset`（`@neko/asset` 素材库核心逻辑）
- **依赖**：`@neko/asset`、`@neko/shared`

## Architecture

```
用户操作（保存/提交/推送）
  │
  ▼
Extension Host
  ├── Git LFS      → 大文件版本追踪（视频/图片/音频）
  ├── 云同步服务   → GitHub / GitLab / S3 / rclone
  └── CI/CD 触发   → 提交后自动渲染
        │
        └── GitHub Actions / GitLab CI
              └── neko-cli render project.jvi -o output.mp4
```

### 云存储支持

| 提供商 | 说明 |
|--------|------|
| `github` | GitHub / GitHub LFS |
| `gitlab` | GitLab / GitLab LFS |
| `s3` | Amazon S3 兼容存储 |
| `rclone` | 40+ 云存储（通过 rclone） |

## Deep Dive

### CI/CD 自动渲染示例（GitHub Actions）

```yaml
on:
  push:
    paths: ['**.jvi']
jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }
      - run: neko-cli render project.jvi -o output.mp4
```

### 配置

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `neko.assets.cloudProvider` | `github` | 云存储提供商 |
| `neko.assets.autoSync` | `false` | 保存时自动同步 |
| `neko.assets.lfsThreshold` | `1048576` | LFS 追踪阈值（1MB） |
| `neko.assets.cicdEnabled` | `true` | 启用 CI/CD 自动渲染 |
