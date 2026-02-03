# Neko Assets

> 资产管理：版本控制 (Git/LFS)、云端同步、CI/CD 自动渲染

## Context Summary

- **项目**：Neko Suite - VS Code 全能内容创作工作站
- **角色**：资产管理，版本控制与云同步
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Assets** 是 Neko Suite 的资产管理模块，提供 Git/LFS 版本控制、云端同步、CI/CD 自动渲染等功能。让创作者可以像管理代码一样管理媒体资产，支持团队协作和自动化工作流。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **Git LFS** | 大文件版本控制 |
| **云端同步** | 多云存储支持 |
| **资产历史** | 查看资产变更历史 |
| **CI/CD 渲染** | 提交触发自动渲染 |
| **团队协作** | 分支创作、合并 |

---

## 云存储支持

| 提供商 | 说明 |
|--------|------|
| `github` | GitHub / GitHub LFS |
| `gitlab` | GitLab / GitLab LFS |
| `s3` | Amazon S3 / 兼容存储 |
| `rclone` | 通过 rclone 支持 40+ 云存储 |

---

## 配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `neko.assets.cloudProvider` | `github` | 云存储提供商 |
| `neko.assets.autoSync` | `false` | 保存时自动同步 |
| `neko.assets.lfsThreshold` | `1048576` | LFS 自动追踪阈值 (1MB) |
| `neko.assets.cicdEnabled` | `true` | 启用 CI/CD 自动渲染 |

---

## 命令

| 命令 | 说明 |
|------|------|
| `Neko Assets: Sync Assets` | 同步资产 |
| `Neko Assets: Push to Cloud` | 推送到云端 |
| `Neko Assets: Pull from Cloud` | 从云端拉取 |
| `Neko Assets: Initialize Git LFS` | 初始化 Git LFS |
| `Neko Assets: Track with LFS` | 用 LFS 追踪文件 |
| `Neko Assets: Trigger CI/CD Render` | 触发 CI/CD 渲染 |
| `Neko Assets: View Asset History` | 查看资产历史 |

---

## 工作流

```
本地创作
    │
    ├─→ Git 提交 (文本文件)
    │
    ├─→ Git LFS 提交 (大文件)
    │
    └─→ 推送到云端
            │
            ├─→ 触发 CI/CD
            │       │
            │       └─→ 自动渲染
            │               │
            │               └─→ 发布成品
            │
            └─→ 团队成员拉取
```

---

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: Auto Render

on:
  push:
    paths:
      - '**.jvi'
      - '**.nksc'

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true

      - name: Render Video
        run: |
          neko-cli render project.jvi -o output.mp4

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: rendered-video
          path: output.mp4
```

---

## 视图

| 视图 | 说明 |
|------|------|
| **Assets** | 资产列表 |
| **History** | 变更历史 |
| **Cloud Sync** | 云同步状态 |

---

## 依赖关系

```
neko-assets
    ├── packages/asset (@neko/asset 素材库核心)
    └── @neko/shared (类型)
```

---

## 技术栈

- **版本控制**：Git / Git LFS
- **云同步**：rclone
- **CI/CD**：GitHub Actions / GitLab CI
- **类型**：@neko/shared

---

## License

MIT
