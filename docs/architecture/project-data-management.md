# 项目数据管理策略

> 关联：[format-strategy.md](./format-strategy.md) · [diff.md](./diff.md) · [lsp.md](./lsp.md)

---

## 一、概述

neko-suite 创意项目包含多种数据类型，版本管理和协作策略因类型而异。本文档定义了项目数据的分层管理策略、二进制素材的 Git 集成方案、以及多用户协作架构。

---

## 二、项目数据分层

### 数据分类

| 层级 | 数据类型 | 格式 | 示例 | 变更频率 |
|------|---------|------|------|---------|
| **L0 项目文件** | 编辑项目 | JSON 文本 | `.nkv` `.nkc` `.nks` `.nka` `.fountain` | 高 |
| **L1 项目元数据** | 配置/字典 | JSON 文本 | `project.json` `characters.json` | 低 |
| **L2 媒体素材** | 图片/音视频/3D | 二进制 | `.mp4` `.png` `.wav` `.gltf` | 低 |
| **L3 AI 生成物** | 生成媒体 | 二进制 | AI 图片/视频/音频 | 中 |
| **L4 运行时数据** | 缓存/历史 | 混合 | `.nkv-ops` `cache/` `memory.md` | 高 |

### Git 管理策略

```
✅ Git 直接管理（文本/JSON，可 diff/merge）:
├─ L0: .nkv / .nkc / .nks / .nka / .fountain
├─ L1: project.json / characters.json
└─ L1: .gitattributes / .gitignore

⚠️ Git LFS 管理（二进制，不可 diff/merge）:
├─ L2: 参考图 / 概念图 / 原始录音 / 3D 模型源文件
└─ L3: 保留的 AI 生成物（用户筛选后的最终版本）

❌ 不进 Git（运行时/可重建）:
├─ L3: AI 生成的中间产物（可重新生成）
├─ L4: .nkv-ops 操作历史（session 级）
├─ L4: .neko/cache/ LSP 索引缓存
├─ L4: .neko/memory.md Agent 记忆（个人偏好）
└─ L4: .neko/generated/ AI 生成输出目录
```

### .gitignore 模板

项目初始化时自动生成：

```gitignore
# neko-suite runtime data
.neko/cache/
.neko/memory.md
.neko/generated/

# Operation history (session-level, not version-controlled)
*.nkv-ops
*.nkc-ops
*.nks-ops
*.nka-ops

# Large media (managed by Git LFS, see .gitattributes)
# Uncomment to exclude from Git entirely:
# *.mp4
# *.mov
# *.wav
```

### .gitattributes 模板

```gitattributes
# neko-suite project files — text, mergeable
*.nkv text diff merge
*.nkc text diff merge
*.nks text diff merge
*.nka text diff merge
*.fountain text diff

# Media assets — Git LFS + custom diff driver
*.mp4 filter=lfs diff=neko-media merge=binary
*.mov filter=lfs diff=neko-media merge=binary
*.avi filter=lfs diff=neko-media merge=binary
*.mkv filter=lfs diff=neko-media merge=binary
*.webm filter=lfs diff=neko-media merge=binary
*.wav filter=lfs diff=neko-media merge=binary
*.mp3 filter=lfs diff=neko-media merge=binary
*.flac filter=lfs diff=neko-media merge=binary
*.ogg filter=lfs diff=neko-media merge=binary
*.png filter=lfs diff=neko-media merge=binary
*.jpg filter=lfs diff=neko-media merge=binary
*.jpeg filter=lfs diff=neko-media merge=binary
*.webp filter=lfs diff=neko-media merge=binary
*.bmp filter=lfs diff=neko-media merge=binary

# 3D models — Git LFS
*.gltf filter=lfs diff=lfs merge=lfs -text
*.glb filter=lfs diff=lfs merge=lfs -text
*.vrm filter=lfs diff=lfs merge=lfs -text
*.fbx filter=lfs diff=lfs merge=lfs -text
```

---

## 三、二进制素材 Git 管理

### 问题分解

| 问题 | 挑战 | 方案 |
|------|------|------|
| **存储** | 大文件膨胀 .git 目录 | Git LFS（指针文件 + 远端对象存储） |
| **Diff** | `git diff` 只显示 "Binary files differ" | 自定义 diff driver `neko-media` |
| **Merge** | 二进制无法 3-way merge | `merge=binary`（整文件替换） + file locking |
| **传输** | clone/fetch 媒体文件慢 | Git LFS partial clone + 按需下载 |

### 方案：Git LFS + neko-media Diff Driver

#### Git LFS 集成

AssetManifest 已定义 `source.kind = 'git-lfs'`（类型就绪，需启用）：

```typescript
// packages/neko-types/src/types/asset/manifest.ts
type AssetManifestSource =
  | { kind: 'local'; path: string }
  | { kind: 'git-lfs'; oid: string; path: string }  // ← 已定义
  | { kind: 'registry'; registry: string; package: string; version: string }
  | { kind: 'ai-generated'; taskId: string; model: string };
```

#### neko-media Diff Driver

复用 neko-engine 已有的 probe + diff 能力，包装为 Git diff driver CLI：

```
$ neko-diff old.mp4 new.mp4

Media Diff: old.mp4 → new.mp4
┌────────────┬──────────────────┬──────────────────┐
│ Property   │ old              │ new              │
├────────────┼──────────────────┼──────────────────┤
│ Duration   │ 00:02:30.00      │ 00:02:45.50      │
│ Resolution │ 1920x1080        │ 1920x1080        │
│ Codec      │ H.264 High       │ H.265 Main       │
│ Bitrate    │ 8.5 Mbps         │ 6.2 Mbps         │
│ Audio      │ AAC 48kHz stereo │ AAC 48kHz stereo │
│ SSIM       │ —                │ 0.847 (moderate) │
│ Size       │ 156 MB           │ 124 MB (-20.5%)  │
└────────────┴──────────────────┴──────────────────┘
  15s longer | codec changed | 20% smaller
```

**Git 配置**：

```gitconfig
[diff "neko-media"]
  command = neko-diff
  binary = true
```

**实现路径**：

```
neko-engine 新增 CLI target: neko-diff
├─ 复用: probe.rs（元数据提取，~50ms）
├─ 复用: image_diff.rs 轻量模式（SSIM 分数，跳过热力图生成）
├─ 输出: 结构化文本（Git diff driver 格式）
├─ 视频: 采样 SSIM（sample_fps=1，~1-2s）
└─ 依赖: 仅 probe + 轻量 diff，不需要 WebGL/streaming
```

**与现有 MediaDiff 的关系**：

```
                    ┌─────────────────────┐
                    │  neko-engine core    │
                    │  probe.rs           │
                    │  image_diff.rs      │
                    │  audio_diff.rs      │
                    │  video_diff.rs      │
                    └──────┬──────────────┘
                           │
              ┌────────────┼────────────┐
              ▼                         ▼
     neko-diff CLI              MediaDiff Webview
     (Git diff driver)         (交互式对比)
     ├─ 文本输出                ├─ WebGL 渲染
     ├─ 元数据 + SSIM 分数      ├─ H264+PCM 双流
     ├─ ~50-2000ms              ├─ 窗帘/热力图/闪烁/并排
     └─ 管道化，非交互          └─ 交互式，实时
```

### 感知哈希（pHash）

快速判断二进制文件"视觉变化程度"，无需全量 SSIM：

| | pHash | SSIM |
|--|-------|------|
| 速度 | ~5ms（resize + DCT） | ~200ms（全像素比较） |
| 精度 | 粗粒度（64-bit hash） | 精确（0.000-1.000） |
| 用途 | 快速筛选 / 去重 / Git 标注 | 精确质量评估 |
| 分辨率无关 | ✅（缩放到固定大小） | ❌（需相同尺寸） |

**算法**：

```
image → resize 32×32 → grayscale → DCT → 取低频 8×8 → 64-bit hash
hamming_distance = popcount(hash_a ^ hash_b)
  distance < 5  → 视觉相似（微调色彩/压缩）
  distance > 10 → 明显不同（不同图片）
```

**应用场景**：
- Git diff 摘要行：`asset.png | pHash distance: 3/64 (near-identical)`
- 素材去重：识别 >1000 文件库中的近似资产
- 变更分类：区分"微调"与"替换"

---

## 四、已有基础设施分析

### 4.1 变更记录（Operation History）

**现状**：完整的操作历史体系，无需额外管理层。

| 扩展 | 实现 | 持久化 | 最大条目 |
|------|------|--------|---------|
| neko-cut | Zustand `operationHistorySlice` | `.nkv-ops` JSON | 200 |
| neko-sketch | `HistoryManager` + region snapshot | `.nks-ops` | 100 |
| neko-canvas | `CanvasOperationStore` + `historyStore` | `.nkc-ops` | 500 |

**架构**：
- 共享 SDK：`@neko/shared/nkv/history.ts`（serialize/deserialize）
- 60+ `EditOperation` 类型，`applyOperation` + `invertOperation` 对称
- 每条操作带 `meta: { id, timestamp, source: user|ai|system|undo|redo, description }`
- Engine 快速路径：20 种增量操作（~100 bytes JSON）
- `.nkv-ops` 文件不入 Git（session 级数据，频繁变动）

**结论**：✅ 当前设计正确。操作历史是 undo/redo 机制，不是审计日志。

**潜在扩展（按需触发，非当前优先级）**：

| 场景 | 需要什么 | 触发条件 |
|------|---------|---------|
| AI 操作审计 | 过滤 `source=ai` 操作导出 | 用户需要查看"AI 改了什么" |
| 操作模板/Macro | 操作序列参数化保存为 `.nkmacro` | 用户需要重复编辑模式 |
| 协作冲突解决 | OT/CRDT 基于操作的合并 | 多人实时协作需求 |

### 4.2 指令序列（EditOperation System）

**现状**：声明式操作模型，已是创意工具的核心编辑基础设施。

```
操作体系:
├─ Namespace.Verb 命名: track.add / element.update / shape.duplicate / ...
├─ batch 原子操作: payload.operations: EditOperation[]（全部成功或回滚）
├─ applyOperation(data, op) → 不可变，返回新数据
├─ invertOperation(op) → 纯函数，用 before 字段生成逆操作
├─ Engine 增量同步: 20 种快速路径 + 全量 fallback
└─ source 标记: user | ai | system | undo | redo
```

**关键设计特性**：
- 操作不可变 + 有唯一 id + 时间戳 → 天然适合事件溯源
- `apply(apply(data, op), invert(op)) === data`  → 对称性保证
- 二进制层数据（sketch RegionSnapshot）序列化时自动裁剪
- JSON 即线格式，Engine 使用 `EditOperationEnvelope { type, payload }` 信封

**结论**：✅ 不需要独立文档管理。操作嵌入项目历史文件，SDK 已完备。

### 4.3 LSP 处理

**现状**：两套独立 LSP 实现，实时计算，无持久化。

| LSP | 目标格式 | 能力 | 位置 |
|-----|---------|------|------|
| **Media LSP** | `.nkv` (JVI) | 9 诊断规则 + Hover(probe) + Symbols + Definition + References | neko-tools |
| **Fountain LSP** | `.fountain` | 诊断 + Hover + Symbols + Completion + WorkspaceSymbol | neko-story |

**MediaWorkspaceIndex**：
- 内存索引（`**/*.nkv` FileSystemWatcher）
- 维护：文件→解析文档、媒体引用→文件、元素 ID→位置 三个映射
- 启动时全量重建，运行时增量更新

**可优化方向**（P3，非阻塞）：

```
当前（无缓存，每次启动重建）:
  启动 → 扫描所有 .nkv → 解析 → 建索引 → 就绪

优化后（索引缓存）:
  启动 → 读 .neko/cache/lsp-index.json → 校验 mtime → 增量更新 → 就绪

  缓存位置: .neko/cache/lsp-index.json（已在 .gitignore 中）
  缓存内容: { [filePath]: { mtime, symbols, references, probeMetadata } }
```

**结论**：✅ 实时计算正确，不需要文档管理。索引缓存是性能优化项。

---

## 五、多用户协作策略

### 协作场景分级

```
场景 A: 独立创作者（当前主要用户）
  └─ 本地 Git 仓库，可选远程备份
  └─ neko-suite 不需要任何额外功能

场景 B: 小团队分工协作（2-5 人）
  └─ 编剧写 .fountain，视觉制作编辑 .nkv，3D 制作编辑 .gltf
  └─ 按文件/模块分工，冲突概率低
  └─ Git 标准 workflow + file locking 够用

场景 C: 并行编辑同一文件
  └─ 需要 OT/CRDT，当前不支持
  └─ 触发条件: 明确的多人实时协作需求 + 服务端基础设施
```

### 场景 B — 分工协作（当前可支持）

**JSON 项目文件的 Merge 友好度**：

| 结构 | 冲突概率 | 原因 |
|------|---------|------|
| Track 数组 | 低 | 按 id 组织，不同 track 的修改互不冲突 |
| Element（嵌套在 track 内） | 低 | 不同 track 的 element 修改独立 |
| Project 元数据 | 低 | 单一对象，少量字段 |
| Keyframe 数组 | 中 | 时间戳有序，并发修改同一元素的动画需手动选择 |
| Shape 数据 | 中 | 嵌套深度较高，冲突时 diff 可读性下降 |

**二进制文件冲突防护 — Git LFS File Locking**：

```bash
$ git lfs lock assets/hero.png        # 锁定，阻止他人修改
$ git lfs unlock assets/hero.png      # 解锁
$ git lfs locks                        # 查看所有锁
```

- 锁定防止两人同时修改同一个二进制文件
- 需要 LFS server 支持（GitHub/GitLab 均支持）
- 文本文件（.nkv/.fountain）不需要锁定，Git merge 处理

### 场景 C — 实时协作（远期架构储备）

**当前 EditOperation 体系的协作友好度**：

```
已有基础（无需修改）:
├─ EditOperation 不可变 + 唯一 id + timestamp    → 事件溯源基础
├─ applyOperation + invertOperation 对称          → OT 变换基础
├─ batch 原子语义                                 → 事务一致性
├─ 20 种增量操作（非全量替换）                      → 低带宽同步
├─ source 标记（user/ai/system）                  → 操作归因
└─ Engine 信封模式（type + payload）               → 序列化友好

需要补充（远期，3-6 个月工程量）:
├─ 操作向量时钟（因果序，Lamport/Vector Clock）
├─ 操作变换函数 transform(op1, op2) → (op1', op2')
├─ 冲突检测（同一 element 的并发修改）
├─ 服务端中继（WebSocket relay / WebRTC P2P）
└─ 状态同步（snapshot + operation log 混合模式）
```

**技术路径选择（远期决策）**：

| 路径 | 方案 | 适用场景 |
|------|------|---------|
| OT (Operational Transform) | 基于 EditOperation 构建变换函数 | 精确操作级冲突解决 |
| CRDT (Yjs/Automerge) | JSON 文档级自动合并 | 宽松一致性，离线友好 |
| Lock-based | 段落/轨道级锁定 | 最简单，牺牲并发度 |

**推荐**：远期优先评估 Yjs CRDT（JSON 文档级，社区活跃，与 Monaco/ProseMirror 集成成熟）。OT 更精确但实现复杂度高。

---

## 六、是否需要多模态知识库？

### 当前多模态能力

```
Layer 0: 原始文件      .mp4/.png/.wav/.gltf/.fountain（磁盘）
Layer 1: 元数据目录    AssetManifest（type/source/tags/checksum）
Layer 2: 项目记忆      .neko/memory.md（H2 section，2000 token）
Layer 3: 分类标签      LLMClassifier / RuleClassifier
Layer 4: Agent 上下文   ContentPart（image+text）→ 4 层 token 预算
```

### 结论：不引入独立知识库系统

**理由**（与 ADR-5 一致）：
- 1M 上下文 + ConversationCompressor 解决"忘事"问题
- memory + LSP 策展式记忆覆盖项目决策/偏好
- AssetManifest + tags 覆盖资产检索
- 向量索引维护成本与项目规模不匹配
- 无用户反馈"找不到相关素材"是痛点

**增强路径（利用已有基础设施，按需渐进）**：

| 增强 | 方式 | 触发条件 |
|------|------|---------|
| 资产描述 | LLMClassifier 生成描述 → `manifest.description` | 资产入库流程完善时 |
| LSP AI 增强 | CLIP 语义评分 / Whisper 转录 → probe 缓存 | Phase 3-4（已在 LSP 路线图） |
| 角色字典 | `@neko/shared` 类型 + 项目文件 | 用户反馈角色不一致 |
| 向量索引 | 本地嵌入（ONNX） + SQLite FTS5 | 素材 >1000 且用户需要语义搜索 |

---

## 七、neko-engine 能力矩阵

### 已有能力（可复用于 Git 集成）

| 能力 | 实现 | 位置 | 性能 |
|------|------|------|------|
| 媒体元数据探测 | FFmpeg probe | `probe.rs` (411 LOC) | ~50ms |
| 图片 SSIM/PSNR | 像素级比较 | `image_diff.rs` | ~200ms |
| 音频 SNR | 信噪比 + 波形 | `audio_diff.rs` | ~100ms |
| 视频帧 SSIM/PSNR | FFmpeg 并行 | `video_diff.rs` | ~1-2s (采样) |
| 时间线结构 diff | JSON 对比 | `timeline_diff.rs` | ~10ms |
| Probe 缓存 | LRU + mtime 校验 | `probe.rs` ProbeCache | 命中 <1ms |
| H264+PCM 流式对比 | WebSocket 双流 | `neko-client` | 实时 |

### 缺失能力（按需实现）

| 能力 | 用途 | 成本 | 优先级 |
|------|------|------|--------|
| CLI diff 入口 (`neko-diff`) | Git diff driver | 0.5 天 | P2 |
| 感知哈希 (pHash/dHash) | 快速相似度 / 去重 | 1 天 | P2 |
| Git LFS oid 填充 | AssetManifest 自动关联 | 0.5 天 | P2 |
| LSP 索引缓存 | 大项目启动加速 | 1 天 | P3 |

---

## 八、实施优先级

| 优先级 | 任务 | 工作量 | 触发条件 |
|--------|------|--------|---------|
| **P1** | `.gitignore` + `.gitattributes` 模板 | 0 天 | 项目初始化功能完善时 |
| **P2** | `neko-diff` CLI（Git diff driver） | 0.5 天 | 用户使用 Git LFS 管理素材 |
| **P2** | pHash 感知哈希 | 1 天 | 素材去重 / diff 摘要需求 |
| **P2** | Git LFS AssetManifest 集成 | 0.5 天 | Git LFS 启用后 |
| **P3** | LSP 索引缓存 | 1 天 | 大项目（>50 .nkv 文件）启动慢 |
| **P3** | 项目快照命令 | 0.5 天 | 用户需要一键版本快照 |
| **远期** | OT/CRDT 实时协作 | 3-6 月 | 明确多人实时协作需求 |

---

*最后更新: 2026-03-24*
