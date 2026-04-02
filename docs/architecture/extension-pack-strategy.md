# ADR: Extension Pack 分层安装策略

> 状态：已批准 | 日期：2026-04-02

## 背景

Neko Suite 包含 14 个 VSCode 扩展（154 个命令、40+ 菜单项、10 个 Webview），全量安装对大多数用户造成认知负担。不同用户画像（AIGC 视频制作、2D 创作、音频编辑）仅需其中一个子集。

当前仅有两种安装方式：
- `neko-suite` Extension Pack 全量安装 10 个扩展
- `install.sh --package <name>` 逐个安装（用户需自行理清依赖）

缺乏**按场景安装**的中间粒度。

## 决策

采用 **1 个 Core 基础包 + 3 个场景子包 + 1 个全量包** 的分层策略。

## Core 设计原则

以下扩展属于**所有创作场景的共享基础设施**，无论用户选择哪个场景子包都需要：

| 扩展 | 角色 | 理由 |
|------|------|------|
| neko-engine | 媒体引擎 | 所有扩展的运行时依赖 |
| neko-tools | 媒体对比 | 大部分扩展依赖 |
| neko-preview | 媒体预览 | cut/canvas/assets/model 依赖 |
| neko-assets | 资产管理 | 所有创作场景需要素材管理 |
| neko-auth | 统一认证 | 远程服务、API 访问必备 |
| neko-agent | AI 中枢 | 所有场景的 AI 能力来源（LLM / Pipeline / Skills / MCP） |
| neko-market | 技能市场 | Agent Skills / 着色器 / 模型 / 预设的分发渠道 |

**agent 和 market 放入 core 的决策依据：**
- neko-agent 是产品核心定位（AI 驱动创作），没有 agent 的 neko-suite 只是普通编辑器
- neko-market 与 agent 强绑定（Skills 热加载、模型部署），是 AI 能力的分发渠道
- 所有场景子包都需要 agent（视频生成 / 图片生成 / 音频生成 / 形象设计）
- 将 agent/market 从场景包移入 core，避免每个场景包重复声明

## 包定义

### neko-suite-core（基础设施 — 7 个扩展）

| 扩展 | 说明 |
|------|------|
| neko-engine | Rust Sidecar 媒体引擎 |
| neko-tools | 媒体对比工具 |
| neko-preview | 媒体预览播放器 |
| neko-assets | 资产管理（注册表 + 缩略图 + 媒体库 + Git LFS） |
| neko-auth | 统一认证（OAuth 2.0 + PKCE SSO） |
| neko-agent | AI Agent（多 LLM + MCP + Skills + Pipeline） |
| neko-market | 技能/着色器/模型/预设市场 |

所有场景子包通过 `extensionDependencies` 声明对 core 的依赖，安装子包时自动安装 core。

### neko-suite-video（AIGC 视频制作 — core + 3 个扩展）

| 扩展 | 管线角色 |
|------|---------|
| neko-cut | 时间线剪辑（输出终点） |
| neko-canvas | 分镜画布（ShotNode / SceneGroup / GalleryNode） |
| neko-story | 剧本编辑（Fountain LSP） |

覆盖完整管线：**素材 → 剧本 → 分镜 → AI 生成 → 剪辑**。AI 能力由 core 中的 agent 提供。

### neko-suite-2d（2D 创作 — core + 1 个扩展）

| 扩展 | 说明 |
|------|------|
| neko-sketch | 压感手绘 + 图层 + 滤镜 + Puppet 骨骼动画 |

AI 辅助（sketch.generate / inpaint / style_transfer）由 core 中的 agent 提供。

### neko-suite-audio（音频编辑 — core + 1 个扩展）

| 扩展 | 说明 |
|------|------|
| neko-audio | 波形编辑 + 效果链 + 频谱分析 + 录音 |

AI 能力（配乐生成 / TTS / 降噪）由 core 中的 agent 提供。

### neko-suite（全量 — 14 个扩展）

包含上述所有子包 + 独立模块（neko-model / neko-live）。

## 安装效果

```bash
./install.sh --pack video            # 10 个扩展（core 7 + video 3）
./install.sh --pack 2d               # 8 个扩展（core 7 + 2d 1）
./install.sh --pack audio            # 8 个扩展（core 7 + audio 1）
./install.sh --pack video --pack 2d  # 11 个扩展（core 7 + video 3 + 2d 1）
./install.sh --all                   # 全量 14 个
```

场景子包因 core 统一提供 agent/market，叠加时**零重复**。

## 用户决策树

```
"我想做什么？"
├── AIGC 视频（素材→剧本→分镜→视频）→ neko-suite-video
├── 2D 绘画/动画                     → neko-suite-2d
├── 音频编辑                         → neko-suite-audio
├── 全部功能                         → neko-suite
└── 后续需要更多                     → 叠加安装其他子包
```

## 不单独出包的模块

| 模块 | 原因 |
|------|------|
| neko-model | 用户群体小，3D 编辑与其他管线弱关联，成熟度 65% |
| neko-live | 依赖 sketch/puppet，且 Phase 5 仅 5% 进度 |

## 软依赖处理

跨扩展软依赖已通过 `vscode.extensions.getExtension()` + try/catch 实现优雅降级：
- Canvas 调用 `neko.sketch.editImage` → Sketch 未安装时静默忽略
- Story 调用 `neko.cut.importStoryboard` → Cut 未安装时提示用户
- Assets 调用 `neko.cut.addElement` → Cut 未安装时隐藏相关菜单

**无需修改任何扩展代码。**

## 用户发现机制

### Marketplace 展示

各 Extension Pack 的 `displayName` 和 `description` 使用**场景语言而非技术包名**：

| 包 | displayName | description |
|----|------------|-------------|
| neko-suite-core | Neko Suite · Core | AI 驱动的内容创作基础设施 — 媒体引擎 + AI Agent + 资产管理 + 市场 |
| neko-suite-video | Neko Suite · AIGC 视频制作 | 素材→剧本→分镜→AI生成→剪辑的完整视频创作管线 |
| neko-suite-2d | Neko Suite · 2D 插画/动画 | 压感手绘 + 骨骼动画 + AI 辅助生成 |
| neko-suite-audio | Neko Suite · 音频工作站 | 波形编辑 + 效果链 + 频谱分析 + AI 降噪 |
| neko-suite | Neko Suite · 全功能 | 全能内容创作 IDE — 视频 + 2D + 3D + 音频 + AI + 直播 |

### 交互式安装

`./install.sh` 不带参数时显示交互式选择菜单：

```
Neko Suite 安装向导
─────────────────────
请选择你的创作方向（输入编号，可多选逗号分隔）：

[1] 🎬 AIGC 视频制作    素材→剧本→分镜→AI生成→剪辑
[2] 🎨 2D 插画/动画     压感手绘 + 骨骼动画 + AI 辅助
[3] 🎵 音频编辑         波形编辑 + 效果链 + 频谱分析
[4] 🔧 全部安装         14 个扩展完整功能

所有选项自动包含 AI Agent + 资产管理 + 市场等基础设施
```

### README 决策表

README.md 安装指南以"你想做什么"为入口，映射到对应安装命令。

## 构建模式：Release vs Dev

neko-live（5%）和 neko-model（65%）尚未达到发布标准，不应包含在面向用户的构建中。

### 分类

| 类别 | 包含 | 说明 |
|------|------|------|
| **Release** | 9 个扩展（core 7 + sketch + audio + cut + canvas + story） | `--all` 构建 |
| **Dev-only** | neko-live, neko-model | 仅 `--dev` 构建 |

### build.sh

```bash
./build.sh --all      # 仅构建 release-ready 扩展（9 个）
./build.sh --dev      # 构建全部（含 neko-live, neko-model）
./build.sh --package neko-model  # 单独构建指定包
```

### install.sh

```bash
./install.sh --pack video   # 安装 core + video（10 个扩展）
./install.sh --all          # 安装全部 release-ready
./install.sh --dev          # 安装全部（含 dev-only）
./install.sh                # 交互式选择菜单
```

### 晋级标准

Dev-only 包晋级为 Release 需满足：
1. 核心功能可用（≥ 80% 完成度）
2. 测试覆盖达标
3. 无阻塞性 bug
4. 用户文档就绪

## 对已有代码的影响

| 范围 | 改动 |
|------|------|
| 各扩展 package.json | 零改动（extensionDependencies 已正确声明） |
| 跨扩展软依赖 | 零改动（已用 getExtension + try/catch） |
| 新增 4 个 pack package.json | 小（纯声明，无代码） |
| install.sh | 小（新增 --pack 选项 + 交互式菜单） |
| build.sh | 小（新增 pack VSIX 打包） |
| turbo.json | 零改动（pack 包无编译任务） |

## 相关决策

- [统一引擎架构](../adr-unified-engine.md) — 所有扩展通过 EngineClient 与唯一 Sidecar 通信
- [横切关注点](./adr-cross-cutting-concerns.md) — Logger/i18n/Theme 统一在 @neko/shared
- [配置作用域](./adr-config-scope.md) — User/Workspace 两级配置
