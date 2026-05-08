# ADR: AI Face Sculpting — Agent 捏脸感知-编辑-验证全链路

## 状态

Proposed (2026-05-07)

**日期**: 2026-05-07
**关联**: neko-puppet · neko-model · neko-agent · neko-engine · neko-client
**关联文档**:

| 关联文档 | 关系 |
|---|---|
| [adr-agent-multimodal-perception.md](./adr-agent-multimodal-perception.md) | PerceptionCard + Provider-Aware Delivery — 闭环验证依赖感知管线 |
| [adr-capability-protocol.md](./adr-capability-protocol.md) | AgentCapabilityProvider 注册协议 — 各扩展自持工具定义 |
| [adr-provider-expression-context.md](./adr-provider-expression-context.md) | ProviderCard 适配 — 视觉推理能力因 Provider 而异 |
| [adr-device-management.md](./adr-device-management.md) | 设备管理 + neko-live 拆分 — 动捕输入是面部参数的另一来源 |
| [agent-media-architecture.md](./agent-media-architecture.md) | GeneratedAsset 协议 — 截图捕获结果走同一资产管线 |
| [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md) | FeedbackArbiter — 视觉验证结果融入反馈信号 |
| [adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md) | 2D/3D 共壳分核 — morph 参数在两个 runtime 中的统一抽象 |

---

## 背景

### 1.1 现状：2D 已通、3D 缺失、闭环断裂

neko-puppet（2D）已实现完整的 AI 捏脸工具链：

| 工具 | 功能 | 状态 |
|------|------|------|
| `PuppetGenerateParams` | 文本描述 → 32 个面部参数 | 已实现 |
| `PuppetFromImage` | 参考图片 → 面部参数（Vision LLM） | 已实现 |
| `PuppetAdjust` | 自然语言指令 + 当前参数 → 调整后参数 | 已实现 |

neko-model（3D）有完整的参数体系和 UI，但 AI 工具完全缺失：

- `FaceEditorPanel.tsx` 的 "AI Generate" 按钮回调为空 TODO
- 无 `AgentCapabilityProvider`
- 无 `NekoModelAPI.getCurrentFaceParams()` / `setFaceParams()` 接口
- Rust 侧 `character_authoring.rs` 的 `set_morph_weight` API 已就绪

更关键的是，**2D 和 3D 都无法闭环**——Agent 设置参数后看不到渲染结果，无法自行评估和迭代。

### 1.2 参数体系对比

| 维度 | neko-puppet (2D) | neko-model (3D) |
|------|-----------------|-----------------|
| 参数数量 | 32 个 | 22 个 |
| 分类数 | 7 类 | 5 类 |
| 参数范围 | [-1, 1]，默认 0 | [0, 1]，默认 0.5 |
| 底层映射 | Inochi2D deformation params | glTF morph targets (blend shapes) |
| 表情系统 | blush + expression_weight | 17 个 VRM 表情预设 |
| Sculpt 笔刷 | 无 | 有（顶点级变形） |
| Agent 工具 | 3 个已实现 | 0 个 |
| 参数读写 API | `NekoPuppetAPI` 已暴露 | 缺失 |

### 1.3 当前链路状态

```
感知 (Perceive)          编辑 (Edit)              验证 (Verify)
───────────             ──────────              ──────────
2D Puppet:              2D Puppet:              2D/3D:
  文本描述 ✅             32 参数写入 ✅            截图对比 ❌
  参考图片 ✅             自然语言调整 ✅           意图匹配 ❌
  当前参数读取 ✅                                  迭代修正 ❌

3D Model:               3D Model:
  文本描述 ❌             22 参数写入 ❌
  参考图片 ❌             自然语言调整 ❌
  当前参数读取 ❌          sculpt 笔刷 (仅手动)
```

**核心问题**：Agent 是"闭着眼睛捏脸的雕塑家"——能动手但看不到结果。

---

## 设计

### 2.1 三阶段演进模型

#### 阶段 1：开环生成（P0，近期可实现）

```
用户意图 → LLM 推理参数 → 写入引擎 → 用户自行查看
         ↑
    通用 LLM 够用
```

复制 puppet 的成熟模式到 model，补齐 3D 侧的 AgentCapabilityProvider + Extension API。

#### 阶段 2：闭环迭代（P1，需补基础设施）

```
用户意图 → LLM 推理参数 → 写入引擎 → 截图捕获 → LLM 视觉评估 → 差异调整
                                      ↑ 缺失        ↑ 缺失         ↑ 缺失
```

补 Engine 截图端点 + CaptureEditorState 工具 + 视觉验证 prompt，使 Agent 能看到自己的编辑结果并自动迭代。

#### 阶段 3：多模态联合编辑（远期）

```
参考图 + 文本 + 当前截图 → LLM 多模态推理 → 参数 + sculpt 笔刷指令 → 引擎
                                              ↑
                                    可能需要专业模型（ONNX 自建或 API 外调）
```

从参数调整升级到顶点级 sculpt 操作和图片→模型生成。**API 优先，ONNX 备用**：默认走 agent 编排 API 外调；用户离线或主动选择本地推理时降级到 engine ONNX。详见附录 A/B。

### 2.2 是否需要专业模型？

| 场景 | 通用 LLM | 专业模型 | 判断依据 |
|-----|---------|---------|---------|
| 文本 → 参数 | **足够** | 不需要 | 参数空间小（22-32 浮点数），语义明确 |
| 图片 → 参数 | **足够** | 不需要 | Vision LLM（Claude 3.5+/GPT-4o）面部识别已成熟 |
| 自然语言调整 | **足够** | 不需要 | 增量调整更简单，有当前状态作为锚点 |
| 截图 → 评估差异 | **足够** | 不需要 | 对比"描述 vs 截图"是 LLM 强项 |
| Sculpt 笔刷生成 | **不够** | 需要 | 顶点级空间操作超出通用 LLM 能力边界 |
| 风格迁移 | **不够** | 需要 | 需要 Stable Diffusion 等生成模型辅助 |

**结论**：阶段 1-2 不需要专业模型。通用 LLM + 结构化 prompt + 参数钳制，已被 puppet 验证为成熟方案。阶段 3 采用 **API 优先策略**：专业视觉模型（分割/深度/3D 重建等）默认走 API 外调（agent 编排），ONNX 本地推理作为离线/低延迟备用方案。

### 2.3 LLM 交互模式（已验证）

puppet 当前的 LLM 交互模式可直接复用：

**System Prompt 结构**：
```
角色定义 + 输出规则 + 参数 Schema（动态构建）

Available face parameters (id | label | range | default):
## Face Shape (面部形状)
- faceWidth: "Face Width" [0, 1] default=0.5
- faceLength: "Face Length" [0, 1] default=0.5
...
```

**响应解析策略**（容错）：
1. 尝试解析 ` ```json ``` ` 围栏
2. 尝试直接 JSON.parse
3. 搜索第一个 `{...}` 对象

**参数验证**：
- 只接受 schema 中定义的参数 ID
- 字符串转数字
- 钳制到 [min, max] 范围
- 拒绝未知参数、布尔值、null

---

## 详细设计

### 3.1 阶段 1：neko-model AgentCapabilityProvider

#### 3.1.1 Extension API 补充

```typescript
// @neko/shared/types/extension-api.ts — NekoModelAPI 扩展
export interface NekoModelAPI {
  // ... existing methods ...
  getCurrentFaceParams(characterId?: string): Promise<Record<string, number>>;
  setFaceParams(params: Record<string, number>, characterId?: string): Promise<void>;
}
```

#### 3.1.2 三个 AI 工具

| 工具名 | 输入 | 输出 | LLM 模式 |
|-------|------|------|---------|
| `ModelGenerateParams` | 文本描述（中/英） | 22 个参数 JSON | text → text |
| `ModelFromImage` | 参考图片路径（PNG/JPEG/WebP） | 22 个参数 JSON | image+text → text |
| `ModelAdjust` | 当前参数 + 自然语言指令 | 更新后的完整参数 JSON | text → text |

#### 3.1.3 System Prompt 差异（vs puppet）

| 维度 | Puppet Prompt | Model Prompt |
|------|---------------|-------------|
| 角色 | "2D character face parameter expert" | "3D character morph target expert" |
| 参数范围 | [-1, 1] signed | [0, 1] normalized |
| 默认值 | 0 (neutral) | 0.5 (midpoint) |
| 语义映射 | Inochi2D deformation | glTF blend shapes |
| 输出规则 | 只含与默认不同的参数 | 只含与默认不同的参数 |

#### 3.1.4 注册流程

```
neko-model extension activate()
  → vscode.commands.executeCommand('neko.agent.registerCapabilities', provider)
    → neko-agent 收到 3 个工具定义
      → Agent 可在对话中调用
```

### 3.2 阶段 2：闭环验证

#### 3.2.1 Engine 截图端点

```
GET /v1/scenes/{session_id}/capture?width=1024&height=768&format=png
→ 200 OK, Content-Type: image/png, Body: PNG bytes
```

实现路径：wgpu `read_buffer` 读回帧缓冲 → `image` crate 编码 PNG → axum response。

对应 Rust 侧修改：
- `host-http/src/routes/scene_control.rs`：新增 capture 路由
- `engine-kernel`：新增 `capture_viewport` 方法（从 GPU 读回当前帧）

#### 3.2.2 CaptureEditorState 工具

```typescript
// 作为 AgentCapabilityProvider 的第 4 个工具
{
  name: 'ModelCaptureState',
  description: 'Capture a screenshot of the current 3D model editor viewport',
  parameters: { width?: number, height?: number },
  execute: async () => {
    const imageBase64 = await engineClient.captureViewport(sessionId);
    return { image: `data:image/png;base64,${imageBase64}` };
  }
}
```

#### 3.2.3 视觉验证迭代

Agent 在设置参数后自动执行验证循环（最多 N 次）：

```
1. 设置参数 → 写入引擎
2. 等待渲染稳定（~100ms）
3. 调用 CaptureEditorState 截图
4. 将截图 + 原始意图 发给 LLM 评估
5. LLM 判断：匹配度 > 阈值？
   - 是 → 完成
   - 否 → 输出需调整的参数 + 方向 → 回到步骤 1
```

验证 prompt：
```
Compare the rendered 3D character face (screenshot) with the user's intent: "{original_description}".
Rate match quality 1-10. If < 7, list specific parameters to adjust and direction (increase/decrease).
Respond as JSON: { "score": N, "adjustments": [{ "paramId": "...", "direction": "increase|decrease", "magnitude": "small|medium|large" }] }
```

### 3.3 阶段 3：多模态联合编辑（远期方向）

**API 优先，ONNX 备用**：默认所有 ML 推理走 API 外调（agent 编排），零本地资源消耗、所有设备一致体验。用户离线或主动选择本地推理时，降级到 engine ONNX。

| 能力 | 默认路线 | 备用路线 | 模型/方案 | 依赖 |
|------|---------|---------|----------|------|
| 语义分割（拆层） | **API** | ONNX (MobileSAM ~40MB) | SAM API / MobileSAM | agent → runtime-ml |
| 深度估计 | **API** | ONNX (Depth Anything S ~100MB) | Depth API / DA v2 Small | agent → runtime-ml |
| 姿态估计 | **API** | ONNX (OpenPose Lite ~50MB) | Pose API / OpenPose | agent → runtime-ml |
| 3D 人体重建 | **API** | ONNX (HMR2 ~500MB, 需独显) | HMR2 API | agent → runtime-ml |
| 单图→3D | **API** | 不提供本地 | TripoSR / Meshy / Tripo3D API | agent 编排 |
| 多视角→3D | **API** | 不提供本地 | DUSt3R API | agent 编排 |
| Sculpt 笔刷 AI | **LLM** | — | 通用 LLM 建议 + 用户执行 | agent |
| 参考图精确匹配 | **API** | ONNX (特征点 ~50MB) | Face Landmark API | agent → runtime-ml |
| 表情动画生成 | **纯算法** | — | VRM expression + 时间线关键帧 | KeyframeTimeline |

详见附录 A（完整管线）和附录 B（内存预算 + 轻量设备策略）。

---

## 实施计划

### P0：开环生成（~2 天）

| PR | 内容 | 工作量 |
|----|------|-------|
| PR-1 | `NekoModelAPI` 补充 `getCurrentFaceParams` / `setFaceParams` 接口定义 + `ModelEditorProvider` 实现 | 0.5d |
| PR-2 | `neko-model/packages/extension/src/agentCapabilityProvider.ts` — 3 个工具（GenerateParams / FromImage / Adjust）+ 参数 schema + LLM prompt | 1d |
| PR-3 | `FaceEditorPanel.tsx` AI 按钮连通 — postMessage → extension → agent command | 0.5d |

### P1：闭环验证（~3.5 天）

| PR | 内容 | 工作量 |
|----|------|-------|
| PR-4 | Engine `capture_viewport` — wgpu 帧读回 + PNG 编码 | 1d |
| PR-5 | `host-http` 新增 `GET /v1/scenes/{id}/capture` 路由 | 0.5d |
| PR-6 | `ModelCaptureState` + `PuppetCaptureState` 工具 — 两个扩展各加一个截图工具 | 0.5d |
| PR-7 | 视觉验证 prompt + 自动迭代逻辑（嵌入 GenerateParams / FromImage 工具的 execute 方法） | 1d |
| PR-8 | PerceptionCard 接入 — 捏脸结果截图走已实现的感知管线，backfill 到对话上下文 | 0.5d |

### P2：增强（~2 天）

| PR | 内容 | 工作量 |
|----|------|-------|
| PR-9 | VRM 表情预设 AI 工具 — `ModelListExpressions` / `ModelSetExpression` | 0.5d |
| PR-10 | 2D/3D 参数互转提示 — 用户在 puppet 调好的参数，AI 辅助映射到 model（或反向） | 1d |
| PR-11 | Sculpt 笔刷 AI 引导 — LLM 建议笔刷类型/区域/力度，用户手动执行 | 0.5d |

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LLM 参数推理偏差大 | 捏脸结果不符合预期 | min/max 钳制 + 阶段 2 闭环迭代自动修正 |
| Vision LLM 面部理解不足 | 从参考图推理参数失准 | ProviderCard 标记视觉能力 + 推荐高视觉能力 Provider |
| Engine 截图延迟 | 闭环验证卡顿 | 异步截图 + 渲染完成信号（topology_version 匹配） |
| 参数语义跨 2D/3D 不一致 | 互转映射失真 | 只做建议性映射，最终用户确认 |
| Sculpt 笔刷 AI 生成质量 | 顶点变形不自然 | LLM 辅助建议 + 用户手动执行，不自动 sculpt |
| ONNX 本地 OOM | 低端设备内存溢出（仅离线模式） | 分级加载（Level 0-3）+ LRU 驱逐 + INT8 量化；默认走 API 无此风险 |

---

## 决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 是否需要专业模型 | **阶段 1-2 不需要** | 参数空间小（22-32 浮点），通用 LLM + 结构化 prompt + 钳制已被 puppet 验证 |
| 工具定义放哪里 | **各扩展自持** | 遵循 AgentCapabilityProvider 协议（adr-capability-protocol），neko-agent 不集中持有 |
| 闭环验证是否必须 | **P1 实现，不阻塞 P0** | 开环生成已有实用价值，闭环依赖 Engine 截图端点 |
| ML 推理路线 | **API 优先，ONNX 备用** | API 零本地资源、设备一致体验、模型自动更新；ONNX 仅作离线/低延迟备用 |
| 2D/3D 参数是否统一 | **不统一，保持各自 schema** | 底层映射不同（Inochi2D vs glTF morph），强行统一会丢失语义精度 |
| 验证迭代次数上限 | **3 次** | 避免无限循环，超过 3 次仍不满意则交由用户手动调整 |

---

## 消融开关

| Toggle | 默认 | 作用 |
|--------|------|------|
| `modelFaceAIGenerate` | `true` | 启用/禁用 3D 模型 AI 捏脸工具 |
| `faceVerifyLoop` | `true` | 启用/禁用闭环视觉验证迭代 |
| `faceVerifyMaxIterations` | `3` | 验证迭代最大次数 |
| `puppetFaceAIGenerate` | `true` | 保持 2D puppet AI 捏脸工具可独立开关 |
| `mlInferenceMode` | `'api'` | ML 推理路线：`'api'`（默认）/ `'local'`（ONNX）/ `'auto'`（API 失败自动降级） |
| `mlApiFailoverThreshold` | `3` | API 连续失败 N 次后自动降级到 ONNX |

---

## 附录 A：图片→模型生成 + 骨骼绑定

> AI 捏脸（阶段 1-3）是**编辑已有模型的参数**。本附录讨论更上游的问题：**从图片创建全新 2D/3D 模型并绑定骨骼**。

### A.1 API 优先，ONNX 备用

**默认路线**：所有 ML 推理走 API 外调（agent 编排）。

| 维度 | API 优先（默认） | ONNX 备用（离线降级） |
|------|----------------|---------------------|
| 首次体验 | 即开即用，零下载 | 需下载模型（几百 MB ~ GB） |
| 设备门槛 | 无门槛，所有设备一致 | 受 RAM/VRAM 限制 |
| 维护成本 | 低（Agent 调 API） | 高（ONNX 转换/量化/平台适配） |
| 模型更新 | 自动跟进最新 | 需重新导出 + 分发 |
| 延迟 | 网络往返 1-5s | 本地 <1s |
| 离线可用 | 不行 | 可以 |
| 费用 | 按量付费 | 免费 |
| 隐私 | 数据上传 | 数据本地 |

**降级触发条件**：
1. 网络不可用（离线创作）
2. 用户主动选择 `mlInferenceMode: 'local'`
3. API 连续失败 3 次自动降级

**ONNX 仅保留为备用**：runtime-ml 的 LRU 驱逐 + 空闲超时机制继续有效，但不再是默认路径。

### A.2 图片→2D Puppet 管线

```
原图 → [1] 语义分割 (MobileSAM)        → 拆层：头发/脸/身体/四肢
     → [2] 深度估计 (Depth Anything v2) → 前后层次排序
     → [3] 三角化网格生成               → 各层 mesh
     → [4] 自动放置变形器               → WarpDeformer 骨架（规则映射）
     → [5] 参数绑定                     → 表情/动作 → 变形器权重
     → [6] 输出 .inp / .moc3
```

| 步骤 | 默认路线 | 离线备用 | 模型 |
|------|---------|---------|------|
| [1] 语义分割 | **API**（SAM API） | ONNX: MobileSAM ~40MB | 轻量，离线可降级 |
| [2] 深度估计 | **API**（Depth API） | ONNX: DA v2 Small ~100MB | 轻量，离线可降级 |
| [3] 三角化 | **纯算法** | — | Delaunay / earcut |
| [4] 变形器放置 | **规则引擎** | — | 模板匹配 + 关键点 |
| [5] 参数绑定 | **LLM**（Agent 编排） | — | 通用 LLM |
| [6] 格式导出 | **纯算法** | — | 序列化 |

### A.3 图片→3D Model 管线

```
原图 → [1] 3D 重建 (TripoSR/API)        → 粗网格
     → [2] 网格清理 (retopology)          → 干净拓扑
     → [3] 自动绑骨 (HMR2 姿态参考)       → 骨架生成
     → [4] 蒙皮权重 (heat diffusion)      → skinning weights
     → [5] 面部 morph target 映射         → 22 参数绑定
     → [6] 输出 .glb / .vrm
```

| 步骤 | 默认路线 | 离线备用 | 模型 |
|------|---------|---------|------|
| [1] 3D 重建 | **API**（TripoSR / Meshy） | 不提供本地（6-8GB VRAM） | 必须联网 |
| [2] 网格清理 | **纯算法** | — | OpenMesh / libigl |
| [3] 姿态估计 | **API**（HMR2 API） | ONNX: OpenPose Lite ~50MB | 离线降级精度降低 |
| [4] 蒙皮权重 | **纯算法** | — | Heat diffusion / bone distance |
| [5] Morph 映射 | **LLM**（Agent 编排） | — | 通用 LLM |
| [6] 格式导出 | **纯算法** | — | glTF serializer |

### A.4 多视角 3D 重建（远期）

```
多张照片 → [1] DUSt3R 点云重建 → 稠密点云
         → [2] Poisson 表面重建 → 网格
         → [3] 纹理映射        → UV + 贴图
         → 走 A.3 [2]-[6]
```

DUSt3R 需 **12-16GB+ VRAM**（多视角），只走 API 路线，不提供本地备用。

---

## 附录 B：ML 推理路线与内存预算

### B.1 API 优先策略

**核心原则**：所有 ML 推理默认走 API 外调（agent 编排），ONNX 仅作离线备用。

**API 优先的收益**：
- **零本地资源**：入门设备（8GB RAM）与高端工作站体验一致
- **零下载等待**：首次使用即开即用，无需下载 GB 级模型
- **自动更新**：API 端模型升级用户无感知
- **维护简单**：无需处理 ONNX 导出/量化/平台适配/ORT 版本兼容

**API 调用由 Agent 统一编排**：
```
用户请求 → Agent 判断需要哪些 ML 能力
         → 调用对应 API（分割/深度/3D 重建/...）
         → 结果写入 engine 或返回给用户
         → 失败/离线时自动降级到 ONNX（如果可用）
```

### B.2 模型清单：默认路线 + 离线备用

| 模型 | 用途 | 默认路线 | ONNX 备用大小 | ONNX 推理内存 | 离线可降级 |
|------|------|---------|--------------|-------------|-----------|
| **已集成（高频/离线必需，保留 ONNX 为主）** | | | | | |
| Whisper Tiny/Base | 语音识别 | ONNX（离线必需） | 75-140 MB | ~273-400 MB | — 默认即本地 |
| CLIP ViT-B/32 | 图文嵌入 | ONNX（高频+离线） | ~340 MB | ~350 MB | — 默认即本地 |
| Real-ESRGAN | 超分辨率 | ONNX（实时交互） | ~65 MB | <1 GB (tiled) | — 默认即本地 |
| Denoise | 降噪 | ONNX（实时交互） | ~65 MB | <1 GB (tiled) | — 默认即本地 |
| **新增（API 优先）** | | | | | |
| MobileSAM | 语义分割 | **API** | ~40 MB | <50 MB | ✅ |
| Depth Anything v2 S | 深度估计 | **API** | ~100 MB | ~200 MB | ✅ |
| OpenPose Lite | 姿态估计 | **API** | ~50 MB | ~150 MB | ✅ |
| HMR2 | 3D 人体重建 | **API** | ~500 MB | ~1-2 GB | ⚠️ 需独显 |
| TripoSR | 单图→3D | **API** | — | **6-8 GB** | ❌ 不提供 |
| DUSt3R | 多视角→3D | **API** | — | **12-16 GB** | ❌ 不提供 |

### B.3 离线备用：ONNX 分级加载（仅离线模式激活）

用户设置 `mlInferenceMode: 'local'` 或网络不可用时，按设备能力分级加载：

```
Level 0 (必需, <200MB): MobileSAM + Depth Anything Small + OpenPose Lite
  → 基础分割/深度/姿态，所有设备可用

Level 1 (标准, <1GB):  + CLIP + Whisper + Real-ESRGAN + Denoise
  → 完整离线创作工具链（这些本身默认就是 ONNX）

Level 2 (专业, <4GB):  + HMR2
  → 精确 3D 人体重建，需独显

不提供 Level 3 本地: TripoSR / DUSt3R 不提供 ONNX 备用（资源需求超出桌面设备）
```

**离线模式总内存预算**（Level 0-1 全部加载）：

```
MobileSAM          40 MB
Depth Anything S  100 MB
OpenPose Lite      50 MB
CLIP              340 MB
Whisper Base      140 MB
Real-ESRGAN        65 MB
Denoise            65 MB
────────────────────────
合计              ~800 MB  (FP32)
                  ~400 MB  (INT8)
```

8GB RAM 入门设备用 INT8 + LRU 驱逐（max_loaded=2-3）完全可行。

### B.4 配置与降级

**配置项**：

| 配置 | 默认值 | 说明 |
|------|-------|------|
| `mlInferenceMode` | `'api'` | `'api'`（默认）/ `'local'`（离线）/ `'auto'`（API 失败自动降级） |
| `mlApiFailoverThreshold` | `3` | API 连续失败 N 次后自动降级到 ONNX |
| `EngineConfig.ml.max_loaded` | `3` | ONNX 同时加载模型数上限（LRU 驱逐） |
| `IDLE_EVICT_SECS` | `300` | 5 分钟未使用自动卸载（已实现） |

**降级流程**：
```
mlInferenceMode = 'auto'（推荐默认）:
  Agent 调 API → 成功 → 返回结果
                → 失败 → 累计失败计数
                         → 达到阈值 → 切换到 ONNX
                                     → ONNX 不可用（未下载/设备不支持）
                                       → 报错提示用户
```

**ONNX 模型按需下载**：离线备用模型不随扩展打包，用户首次切换到 `local` 模式时触发下载。

### B.5 API vs ONNX 判定标准（何时保留 ONNX 为默认）

| 场景 | 默认用 ONNX | 默认用 API |
|------|------------|-----------|
| 离线场景必需（语音识别） | ✅ Whisper | |
| 高频 + 低延迟（搜索嵌入） | ✅ CLIP | |
| 实时交互（超分/降噪） | ✅ Real-ESRGAN / Denoise | |
| 非实时、等几秒可接受 | | ✅ 分割/深度/姿态/3D |
| 模型 >500MB 或 >2GB VRAM | | ✅ 必须 API |
| 捏脸参数推理 | | ✅ 通用 LLM API |

Sources:
- [Whisper Model Sizes](https://openwhispr.com/blog/whisper-model-sizes-explained)
- [CLIP ViT-B/32 Memory](https://huggingface.co/openai/clip-vit-base-patch32/discussions/11)
- [MobileSAM](https://github.com/ChaoningZhang/MobileSAM)
- [Depth Anything v2 ONNX](https://github.com/fabio-sim/Depth-Anything-ONNX)
- [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN)
- [TripoSR Requirements](https://www.triposrai.com/posts/triporsr-optimization-best-practices-for-quality-and-performance/)
- [DUSt3R VRAM](https://github.com/naver/dust3r)
- [HMR2 4DHumans](https://github.com/shubham-goel/4D-Humans)
- [SAM VRAM Issues](https://github.com/facebookresearch/segment-anything/issues/78)

---

## 附录 C：AI API vs ONNX 全场景对比

> 覆盖 neko-suite 全部 14 个包中已实现和已规划的 AI/ML 场景。

### C.1 本质区别

| 维度 | AI API（云端推理） | ONNX（本地推理） |
|------|-------------------|-----------------|
| 计算位置 | 云端 GPU 集群 | 本地 CPU/GPU/NPU |
| 模型规模 | 无上限（70B+ 参数） | 受设备限制（桌面 <2GB） |
| 延迟 | 1-30s（网络+排队+推理） | 10ms-2s（纯本地） |
| 延迟可控性 | ❌ 受网络/负载影响 | ✅ 确定性延迟 |
| 离线 | ❌ 必须联网 | ✅ 完全离线 |
| 隐私 | ⚠️ 数据上传第三方 | ✅ 数据不出设备 |
| 费用 | 按量付费（持续成本） | 一次集成（零边际成本） |
| 模型更新 | 自动（API 端升级） | 手动（重新导出/分发） |
| 质量上限 | 高（最新最大模型） | 受限于可本地跑的大小 |
| 首次体验 | 即开即用 | 需下载模型文件 |
| 维护成本 | 低（调 API） | 高（导出/量化/平台适配） |
| 并发 | 高（云端弹性扩容） | 低（本地硬件限制） |
| 可复现性 | ⚠️ API 版本可能变化 | ✅ 固定模型，结果确定 |

**关键认知**：API 和 ONNX **不是同一件事的两种部署方式**，而是**能力边界不同**：
- API 能做 ONNX 做不了的事（LLM 推理、多模态理解、重模型）
- ONNX 能做 API 做不了的事（离线、确定性延迟、零费用高频调用）

### C.2 全场景分类总览

```
                          必须 API                    必须 ONNX
                    （ONNX 无替代方案）            （API 无法满足）
                    ┌─────────────────┐        ┌─────────────────┐
                    │ LLM 文本推理     │        │ 实时音频处理     │
                    │ LLM 多模态推理   │        │ 实时嵌入检索     │
                    │ 图片/视频/音乐生成│        │ 离线语音识别     │
                    │ 3D 重建(>4GB)   │        │ 实时超分/降噪    │
                    │ 多视角重建(>12GB)│        │ 实时动捕推理     │
                    └─────────────────┘        └─────────────────┘
                              │                        │
                              ▼                        ▼
                    ┌─────────────────────────────────────────────┐
                    │          API 优先，ONNX 备用                 │
                    │    （默认 API，离线/低延迟降级到 ONNX）       │
                    │                                             │
                    │  语义分割 · 深度估计 · 姿态估计 · 人体重建   │
                    │  面部特征点 · 音频分离 · 场景检测             │
                    └─────────────────────────────────────────────┘
```

### C.3 按包逐场景对比

#### neko-agent（AI 助手核心）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| 对话式 LLM 推理 | **必须 API** | Claude/GPT-4/Gemini | 流式交互 | 需 70B+ 参数，ONNX 无法跑 |
| 多模态理解（图+文→结构） | **必须 API** | Vision LLM | 交互 | 需 Vision LLM 能力 |
| 工具调用编排 | **必须 API** | LLM function calling | 交互 | 需要复杂推理能力 |
| SubAgent 调度 | **必须 API** | 多 LLM 分发 | 异步 | 质量检查/修复/诊断 |
| 感知管线（describe/classify） | **必须 API** | Vision LLM + CLIP | 异步 | 语义级描述需 LLM |
| 质量评估（VisionEvaluator） | **必须 API** | Vision LLM | 异步 | 美学评价需 LLM 推理 |
| CLIP 嵌入/相似度 | **ONNX 优先** | CLIP ViT-B/32 | 批量 | 高频调用、离线必需、~340MB |
| 音频转录 | **ONNX 优先** | Whisper Tiny/Base | 批量 | 离线必需、~75-140MB |

#### neko-cut（视频编辑）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| AI 去静音 | **ONNX 优先** | 静音检测（引擎内） | 实时交互 | 纯信号处理，无需网络 |
| AI 背景移除 | **API 优先** | SAM / 抠图模型 | 异步 | 大模型质量好，非实时 |
| AI 智能裁剪 | **API 优先** | 目标检测 + 裁剪 | 异步 | 需理解画面语义 |
| AI 风格迁移 | **API 优先** | IP-Adapter | 异步 | 需生成模型 |
| AI 自动剪辑（规划中） | **API 优先** | 场景检测 + LLM 编排 | 异步 | 需语义分析 |
| AI 节拍匹配（规划中） | **ONNX 优先** | FFT + onset 检测 | 实时 | 纯信号处理 |
| 视频生成（Sora/Kling 等） | **必须 API** | Text/Image→Video | 异步 | 需云端 GPU 渲染 |
| GPU 特效链 | **引擎内** | WGSL Compute Shader | 实时 | 纯 GPU，非 ML |

#### neko-canvas（分镜画布）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| 图片生成（Flux/DALL-E 等） | **必须 API** | Text→Image | 异步 | 需云端生成模型 |
| 批量生成调度 | **必须 API** | 多提供商并发 | 异步 | 10+ 提供商路由 |
| AutoPrompt（场景→提示词） | **必须 API** | LLM | 交互 | 需语义理解 |
| 风格迁移（IP-Adapter） | **必须 API** | Image→Image | 异步 | 需生成模型 |
| 角色一致性检查（规划中） | **API 优先** | CLIP + Vision LLM | 异步 | 跨镜对比需语义 |

#### neko-sketch（2D 绘画）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| AI 生成图层 | **必须 API** | Text→Image | 异步 | 需生成模型 |
| AI 局部重绘（Inpaint） | **必须 API** | Mask+Image→Image | 异步 | 需生成模型 |
| AI 风格迁移 | **必须 API** | Style→Image | 异步 | 需生成模型 |
| AI 超分辨率 | **ONNX 优先** | Real-ESRGAN | 交互 | 实时预览、tiled 处理、~65MB |
| AI 自动分层 | **API 优先** | 分割 + 生成 | 异步 | 需语义分割 + 分别生成 |
| AI 线稿上色 | **必须 API** | Lineart→Color | 异步 | 需生成模型 |
| AI 智能选区（规划中） | **API 优先** | SAM 分割 | 交互 | ONNX 备用: MobileSAM |
| 法线贴图生成（规划中） | **API 优先** | Depth/Normal 推理 | 异步 | ONNX 备用: DA v2 Small |

#### neko-story（剧本编写）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| 剧本结构解析 | **纯算法** | Fountain parser | 实时 | 无需 ML |
| 语义搜索（ScriptIndex） | **ONNX 优先** | CLIP/TF-IDF | 交互 | 高频搜索、已有 TF-IDF fallback |
| 场景规划（ScenePlan） | **必须 API** | LLM | 交互 | 需创意推理 |
| 镜头规划（ShotPlan） | **必须 API** | LLM | 交互 | 需叙事理解 |
| 剧本建议 | **必须 API** | LLM | 交互 | 需创意写作能力 |

#### neko-model（3D 编辑）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| 面部参数滑块 | **引擎内** | Morph Target 插值 | 实时 | 纯 GPU，非 ML |
| AI 捏脸（文本→参数） | **必须 API** | LLM | 交互 | 需语义理解 |
| AI 捏脸（图片→参数） | **必须 API** | Vision LLM | 交互 | 需视觉推理 |
| AI 捏脸（自然语言调整） | **必须 API** | LLM | 交互 | 需语义理解 |
| 闭环视觉验证 | **必须 API** | Vision LLM | 异步 | 需对比推理 |
| Sculpt 笔刷 | **引擎内** | 顶点变形 | 实时 | 纯几何计算 |
| 单图→3D 重建（规划中） | **必须 API** | TripoSR（6-8GB） | 异步 | 超出桌面 VRAM |
| 多视角→3D（规划中） | **必须 API** | DUSt3R（12-16GB） | 异步 | 超出桌面 VRAM |
| 自动绑骨（规划中） | **API 优先** | HMR2 姿态 | 异步 | ONNX 备用: OpenPose ~50MB |
| IK 求解 | **引擎内** | FABRIK 算法 | 实时 | 纯算法 |
| GPU Skinning | **引擎内** | 骨骼蒙皮变换 | 实时 | 纯 GPU |

#### neko-puppet（2D 骨骼动画）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| AI 捏脸（文本→参数） | **必须 API** | LLM | 交互 | 需语义理解（已实现） |
| AI 捏脸（图片→参数） | **必须 API** | Vision LLM | 交互 | 需视觉推理（已实现） |
| AI 捏脸（自然语言调整） | **必须 API** | LLM | 交互 | 需语义理解（已实现） |
| MOC3 变形渲染 | **引擎内** | WarpDeformer/RotationDeformer | 实时 | 纯算法 |
| 物理模拟 | **引擎内** | 弹簧/刚体摆链 | 实时 | 纯算法 |
| 图片→Puppet 生成（规划中） | **API 优先** | SAM 分割 + LLM 映射 | 异步 | ONNX 备用: MobileSAM |

#### neko-live（直播/VTuber）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| VMC 动捕接收 | **纯协议** | OSC 解析 | 实时 60fps | 无 ML |
| ARKit→VRM 映射 | **纯算法** | 参数映射表 | 实时 60fps | 无 ML |
| MediaPipe 面部追踪（规划中） | **ONNX 必须** | FaceLandmarker WASM ~10MB | 实时 30fps | **必须本地**，<33ms 延迟 |
| MediaPipe 姿态追踪（规划中） | **ONNX 必须** | PoseLandmarker WASM ~10MB | 实时 30fps | **必须本地** |
| 视频录制 | **引擎内** | Canvas → WebM VP9 | 实时 | 纯编码 |
| 麦克风录音 | **引擎内** | cpal → WAV | 实时 | 纯采集 |

#### neko-assets（素材管理）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| 素材分类 | **API 优先** | Vision LLM | 异步 | 需语义理解；规则 fallback |
| 素材标签 | **API 优先** | Vision LLM | 异步 | 需语义理解 |
| 素材搜索（关键词） | **纯算法** | 索引检索 | 实时 | 无 ML |
| 素材搜索（语义） | **ONNX 优先** | CLIP 嵌入 | 交互 | 高频、离线必需 |
| 缩略图生成 | **引擎内** | GPU 渲染 | 批量 | 纯渲染 |

#### neko-preview（媒体预览）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| 全景检测（规划中） | **API 优先** | 图像分类 | 异步 | ONNX 备用: 轻量分类器 |
| HDR 色调映射 | **引擎内** | Reinhard/ACES shader | 实时 | 纯 GPU |

#### neko-engine（引擎核心）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| 超分辨率 | **ONNX 优先** | Real-ESRGAN | 交互 | 实时预览、tiled、~65MB |
| 降噪 | **ONNX 优先** | Denoise | 交互 | 实时预览、tiled、~65MB |
| 音频转录 | **ONNX 优先** | Whisper | 批量 | 离线必需 |
| CLIP 嵌入 | **ONNX 优先** | CLIP ViT-B/32 | 批量 | 高频、离线必需 |
| 深度提取（规划中） | **API 优先** | Depth Anything v2 | 异步 | ONNX 备用: DA v2 Small |
| 姿态提取（规划中） | **API 优先** | OpenPose | 异步 | ONNX 备用: Lite |
| ControlNet 序列（规划中） | **API 优先** | 多模型组合 | 异步 | 质量优先 |
| 音频分离（规划中） | **API 优先** | Demucs | 异步 | ONNX 备用: ~200MB |

#### neko-market（市场）

| 场景 | 路线 | 模型类型 | 交互模式 | 理由 |
|------|------|---------|---------|------|
| 模型分发/安装 | **不涉及推理** | — | — | 纯包管理 |
| ONNX 模型热加载 | **ONNX** | runtime-ml 注册 | — | 已实现 |

### C.4 统计汇总

| 路线 | 场景数 | 占比 | 典型特征 |
|------|-------|------|---------|
| **必须 API** | 25 | 40% | LLM 推理、生成模型、重模型(>4GB) |
| **ONNX 优先** | 10 | 16% | 高频/实时/离线必需，模型 <500MB |
| **API 优先，ONNX 备用** | 12 | 19% | 非实时 ML 推理，可降级 |
| **引擎内（纯算法/GPU）** | 12 | 19% | 变形/物理/特效/编码，无需 ML |
| **纯算法** | 4 | 6% | 解析/检索/序列化 |

### C.5 费用影响分析

| 使用模式 | 月均调用（假设日活创作） | API 月成本 | ONNX 月成本 |
|---------|----------------------|-----------|------------|
| LLM 对话（50 轮/天） | ~1,500 | ~$15-45 | — 不可行 |
| 图片生成（20 张/天） | ~600 | ~$6-30 | — 不可行 |
| 视频生成（5 段/天） | ~150 | ~$15-75 | — 不可行 |
| 捏脸推理（10 次/天） | ~300 | ~$3-9 | — 不可行 |
| CLIP 嵌入（200 次/天） | ~6,000 | ~$3-6 | **$0** |
| 语音识别（30 分钟/天） | ~30 min | ~$1.8 | **$0** |
| 超分/降噪（50 次/天） | ~1,500 | ~$7.5 | **$0** |
| 分割/深度（20 次/天） | ~600 | ~$3 | **$0**（离线备用） |

**核心结论**：
- **必须 API 的场景**（LLM + 生成 + 重模型）占总费用 ~90%，无替代方案
- **可用 ONNX 的场景**（嵌入 + 转录 + 超分 + 降噪）**高频但单价低**，用 ONNX 省的是量
- **API 优先 ONNX 备用的场景**费用占比小（<5%），API 简化维护更值得

### C.6 决策树（完整版）

```
新增 AI 场景 →
  ├─ 需要 LLM/多模态理解？ → 必须 API
  ├─ 需要生成模型（图/视频/音频）？ → 必须 API
  ├─ 模型 >2GB 或推理 >4GB VRAM？ → 必须 API
  │
  ├─ 实时交互（<100ms 延迟）？ → 必须 ONNX
  ├─ 离线场景必需？ → 必须 ONNX
  ├─ 高频调用（>100次/天）且模型 <500MB？ → ONNX 优先
  │
  ├─ 纯信号处理/几何计算/格式解析？ → 引擎内（无 ML）
  │
  └─ 其余 → API 优先，ONNX 备用
           （mlInferenceMode='auto' 自动降级）
```

---

## 附录 D：多模态领域模型 API 闭环架构

> API → VLM → API 三角闭环：专业领域模型 API 做感知/执行，VLM 做编排/验证。

### D.1 三角闭环模型

```
                    ┌─────────────────────┐
                    │    VLM (大脑)        │
                    │  Claude / GPT-4o    │
                    │  理解 · 决策 · 验证   │
                    └──────┬──────┬───────┘
                  感知结果↑ │      │ ↓调用指令
                           │      │
              ┌────────────┘      └────────────┐
              │                                │
    ┌─────────▼──────────┐          ┌──────────▼─────────┐
    │  领域模型 API (感知)  │          │  领域模型 API (执行)  │
    │  SAM · Depth · Face │          │  TripoSR · Upscale  │
    │  Pose · CLIP · STT  │          │  SD · Remove.bg     │
    └─────────┬──────────┘          └──────────┬─────────┘
              │       结果传递                   │
              └────────────────────────────────┘
```

**核心原则**：
- VLM **不做**像素/信号处理（做不到也不该做）
- VLM **编排**专业 API 并用视觉能力**验证**中间结果
- 领域模型 API 不是 LLM/VLM，而是**单任务专业模型**的云端推理端点
- ONNX 退到**离线备用 + 实时场景**

### D.2 VLM 在闭环中的三个不可替代角色

| 角色 | 行为 | 为什么 API 链做不到 |
|------|------|-------------------|
| **意图理解** | "把照片变好看" → 拆解为 denoise + color correct + upscale | 需要语义推理 |
| **质量验证** | 看超分结果判断"是否出现伪影" | 需要视觉理解 + 审美判断 |
| **步骤编排** | 根据中间结果决定下一步（跳过/重试/改序） | 需要动态推理 |

```
示例: VLM 闭环决策

VLM 看到 SAM 分割结果 → "边缘有锯齿"
  → 决策 A: 调用 SAM API 重试 (prompt 加 "high quality edges")
  → 决策 B: 先调 Upscale API 超分再分割 (改变步骤顺序)
  → 决策 C: "可接受，继续下一步" (容忍不完美)

这种基于视觉的动态决策是纯 API 调用链无法实现的。
```

### D.3 当前 MediaAdapter 覆盖 vs 缺口

neko-agent 已有 **10 个 MediaAdapter**，全部集中在生成类：

| 已有 Adapter | 覆盖任务 |
|-------------|---------|
| fal.ai | 图片生成 (Flux/SDXL)、ControlNet (canny/depth/pose) |
| OpenAI | DALL-E 图片生成 |
| Runway | 视频生成 (Gen-3) |
| Luma | 视频生成 (Dream Machine) |
| Suno | 音乐生成 |
| MiniMax / Vidu / DashScope / LibLib / Midjourney | 图片/视频/音频生成 |

**完全缺失的领域模型 API 类型**：

| 缺失类别 | 用途 | 推荐 API | 单次成本 | 延迟 |
|---------|------|---------|---------|------|
| 分割 (Segmentation) | 背景移除、图层分离 | Replicate SAM 2 / fal.ai SAM 3 | $0.002-0.005 | 1-5s |
| 深度估计 (Depth) | 2D→3D、视差效果 | Replicate Depth Anything V2 | $0.0016 | 1-3s |
| 超分 (Upscale) | 素材增强 | Replicate Real-ESRGAN / HAT | $0.002 | 2-10s |
| 降噪 (Denoise) | 素材修复 | Replicate NAFNet | ~$0.002 | 2-5s |
| 去背景 (Remove BG) | 前景提取 | PhotoRoom ($0.02) / Replicate RMBG ($0.002) | $0.002-0.02 | <1s-3s |
| 姿态估计 (Pose) | 骨骼绑定 | Replicate DWPose | $0.002-0.005 | 1-3s |
| 图片→3D (Reconstruction) | 3D 模型生成 | fal.ai TripoSR ($0.07) / Tripo3D v2.5 ($0.20-0.40) | $0.07-0.40 | 5-30s |
| 人脸关键点 (Face Mesh) | 捏脸参数映射 | Azure Face API ($1/1K) | $0.001 | 50-200ms |
| 图文嵌入 (Embedding) | 语义搜索 | Jina CLIP v2 ($0.02/1M tokens) | 极低 | <100ms |
| 语音识别 (STT) | 批量转录 | AssemblyAI ($0.15/hr) / GPT-4o-mini-transcribe ($0.18/hr) | $0.0025-0.006/min | 150-300ms |
| 着色 (Colorize) | 旧照修复 | Replicate DeOldify | ~$0.003 | 3-5s |

**注意**：MediaPipe Face Mesh（478 关键点 + 52 blendshapes）**无云端 REST API**，仅客户端 SDK。人脸关键点需走 ONNX（engine 内）或退而用 Azure Face API（仅 27 关键点）。

### D.4 统一接入层：Replicate 作为通用网关

Replicate 托管大部分领域模型，一个 Adapter 覆盖多个任务：

```typescript
// 新增: MediaProcessingType（与现有 MediaGenerationType 并列）
type MediaProcessingType =
  // 增强类
  | 'upscale' | 'denoise' | 'restore' | 'colorize'
  // 分析类
  | 'segment' | 'depth-estimate' | 'face-landmark'
  | 'pose-estimate' | 'embed-image' | 'embed-text' | 'ocr'
  // 转换类
  | 'image-to-3d' | 'remove-background' | 'style-transfer';

// ReplicateProcessingAdapter — 一个 Adapter 覆盖大部分领域模型
const REPLICATE_PROCESSING_MODELS = {
  'upscale':        'nightmareai/real-esrgan:...',
  'upscale-hat':    'jingyunliang/hat:...',
  'segment':        'meta/sam-2:...',
  'depth-estimate': 'chenxwh/depth-anything-v2:...',
  'pose-estimate':  'replicate/cog-dwpose:...',
  'remove-bg':      'lucataco/remove-bg:...',
  'image-to-3d':    'stability-ai/triposr:...',
  'denoise':        'sczhou/nafnet:...',
  'colorize':       'arielreplicate/deoldify:...',
} as const;
```

**Adapter 新增计划**：

| 新 Adapter | 覆盖任务 | 优先级 |
|-----------|---------|--------|
| ReplicateProcessingAdapter | 分割/深度/超分/降噪/姿态/去背/着色/3D (通用) | P0 |
| JinaEmbeddingAdapter | 图文嵌入 (CLIP v2 / SigLIP) | P1 |
| DeepgramAdapter / AssemblyAIAdapter | 批量语音识别 | P2 |
| TripoAdapter | Image→3D (高品质 Tripo3D v2.5) | P2 |

### D.5 闭环场景示例

#### 场景 A：图片→3D 模型 + 骨骼绑定

```
用户: "把这张人脸照片变成 3D 模型"

VLM 分析意图 → 制定 5 步计划
  │
  ├─ Step 1: SAM API → 分割人脸前景          ($0.002)
  │    VLM 验证: "分割边界是否干净？" ✅
  │
  ├─ Step 2: Face Mesh (ONNX) → 468 关键点   ($0, 本地)
  │    VLM 分析: 五官比例 → 映射到 22 个捏脸参数
  │
  ├─ Step 3: Depth API → 深度图              ($0.0016)
  │    VLM 验证: "深度图是否合理？" ✅
  │
  ├─ Step 4: TripoSR API → 3D mesh           ($0.07)
  │    VLM 验证: "3D 模型是否像原图？" ✅/❌
  │    如果 ❌ → 调整 prompt 重试 (闭环)
  │
  └─ Step 5: Engine 算法 → retopo + skinning  ($0, 本地)
       VLM 验证: Engine 截图 → "骨骼绑定正确？" ✅

总成本: ~$0.08 (API) + ~$0.05 (VLM 编排) = ~$0.13
```

#### 场景 B：素材智能增强管线

```
用户: "帮我把这张旧照片修复并超分到 4K"

VLM 分析: 旧照片 → 需要降噪 + 超分 + 可能着色
  │
  ├─ Step 1: Denoise API → 去噪              ($0.002)
  │    VLM 验证: "噪点去除/细节保留？" ✅
  │
  ├─ Step 2: Upscale API (HAT 4x) → 超分     ($0.002)
  │    VLM 验证: "放大后是否出现伪影？" ✅
  │
  └─ Step 3 (条件): VLM 判断 "是黑白照" → Colorize API  ($0.003)
       VLM 验证: "色彩是否自然？" ✅/❌ → 重试

总成本: ~$0.007-0.01 (API) + ~$0.02 (VLM) = ~$0.03
```

#### 场景 C：Puppet 自动骨骼绑定

```
用户: "把这张角色图绑定骨骼做成 puppet"

VLM 分析: 角色插画 → 需要分层 + 关键点 + 骨骼
  │
  ├─ Step 1: SAM API → 多层分割 (头/身体/四肢)  ($0.005)
  │    VLM 验证: 各层分离是否干净
  │
  ├─ Step 2: Pose API → 全身关键点              ($0.005)
  │    VLM 分析: 关键点映射到 puppet 骨骼节点
  │
  ├─ Step 3: Depth API → 图层前后关系推断        ($0.0016)
  │    VLM: "手臂在身体前面" → z-order 确定
  │
  └─ Step 4: Engine 算法 → mesh deform + IK     ($0, 本地)
       VLM 验证: "试运行一个挥手动画" → 视觉检查

总成本: ~$0.012 (API) + ~$0.03 (VLM) = ~$0.04
```

### D.6 扩展后的路由架构

```
┌──────────────────────────────────────────────────────────────────┐
│                  MediaRoutingManager (扩展)                       │
│                                                                  │
│  路由策略:                                                       │
│  1. API 在线 + 非实时 → 领域模型 API (首选)                      │
│  2. API 不可用 / 离线 → ONNX 本地备用                            │
│  3. 实时场景 (<100ms) → 始终 ONNX                                │
│  4. VLM 编排场景 → 必须 API (VLM 需要看到中间结果做决策)         │
├──────────────────────────────────────────────────────────────────┤
│                  MediaAdapter Registry                           │
│                                                                  │
│  ┌─── 生成类 (已有 10 个 Adapter) ───────────────────────┐      │
│  │ fal · openai · runway · luma · suno · ...              │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                  │
│  ┌─── 分析/增强/转换类 (新增) ────────────────────────────┐      │
│  │ ReplicateProcessingAdapter (SAM/Depth/Pose/Upscale/...) │      │
│  │ JinaEmbeddingAdapter       (CLIP embedding)             │      │
│  │ DeepgramAdapter            (STT batch)                  │      │
│  │ TripoAdapter               (Image→3D)                  │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                  │
│  ┌─── 本地备用 (ONNX via EngineClient) ──────────────────┐      │
│  │ upscale/denoise/clip/whisper/face-mesh/depth/pose       │      │
│  │ 触发: 离线 / API 不可用 / 实时场景 / mlInferenceMode    │      │
│  └────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

### D.7 闭环成本估算

| 闭环场景 | API 调用链 | API 成本 | VLM 编排成本 | 合计 |
|---------|-----------|---------|------------|------|
| 图片→3D 模型 | SAM + Depth + Face + TripoSR | ~$0.08 | ~$0.05 | **~$0.13** |
| 旧照片修复 | Denoise + Upscale + Colorize | ~$0.007 | ~$0.02 | **~$0.03** |
| Puppet 骨骼绑定 | SAM + Depth + Pose | ~$0.012 | ~$0.03 | **~$0.04** |
| 素材语义搜索 (100张) | Jina CLIP × 100 | ~$0.002 | — | **~$0.002** |
| AI 捏脸 (参数生成+验证) | LLM + Engine screenshot | ~$0 | ~$0.05 | **~$0.05** |

Sources:
- [Replicate Pricing](https://replicate.com/pricing)
- [fal.ai Pricing](https://fal.ai/pricing)
- [Jina CLIP v2 API](https://jina.ai/embeddings/)
- [AssemblyAI Pricing](https://www.assemblyai.com/pricing)
- [OpenAI Audio Transcription](https://platform.openai.com/docs/guides/speech-to-text)
- [Azure Face API Pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/face-api/)
- [PhotoRoom API](https://www.photoroom.com/api)
- [Tripo3D API Pricing](https://www.tripo3d.ai/pricing)
- [Meshy API](https://docs.meshy.ai/)
- [Cohere Embed v4](https://cohere.com/embed)

---

## 附录 E：2026 推理框架格局 vs ONNX

> 分析 2026 各领域 ML 框架/模型能否替代 ONNX Runtime。

### E.1 当前 ONNX 清单

neko-engine `runtime-ml` 运行 4 个 ONNX 模型，均通过 `ort` crate + CoreML EP (macOS) / CPU：

| 模型 | 任务 | 模型大小 | 推理管线特征 |
|------|------|---------|------------|
| Real-ESRGAN / SwinIR | 图像超分 | ~65 MB | Tile-based (512×512, 32px overlap), NCHW f32 |
| SCUNet | 图像降噪 | ~65 MB | 同上 tile-based 管线 |
| CLIP ViT-B/32 | 图文匹配 | ~340 MB | 双编码器 (image 224×224 + text BPE) → cosine |
| Whisper Base | 语音识别 | ~140 MB | FFmpeg→mel spectrogram→encoder→autoregressive decoder |

### E.2 Rust 推理框架对比（2026 现状）

| 框架 | 版本 | GPU 支持 | 模型覆盖 | 能否替代 ORT？ |
|------|------|---------|---------|---------------|
| **ort** (ONNX Runtime) | 2.0.0-rc | CoreML/CUDA/DirectML/OpenVINO | 任何 ONNX 导出模型 | — (当前方案) |
| **candle** (HuggingFace) | v0.9.3 | Metal + CUDA | Transformer 类优秀 (Whisper/CLIP/LLM/SD)；CNN/GAN 弱 | **部分可替代** (Whisper+CLIP) |
| **burn** | v0.20 | CubeCL → CUDA/Metal/WebGPU/Vulkan/ROCm | 预训练模型极少；`burn-onnx` 算子覆盖不足 | ❌ 不可替代 |
| **tract** (Sonos) | — | CPU only | ONNX 兼容 ~85%；`ort-tract` 后端可无缝切换 | ⚠️ CPU 场景可替代 |
| **tch-rs** | — | CUDA + MPS | 完整 PyTorch 绑定 | ❌ 需 libtorch ~2GB |
| **wonnx** | — | WebGPU/wgpu | ONNX 子集；无 64-bit、无动态 shape | ❌ 算子限制太多 |
| **whisper-rs** | — | Metal + CUDA + CPU | 仅 Whisper | ✅ Whisper 专用最优解 |
| **mlx-rs** | v0.25.3 | Apple Silicon MLX | 非官方 Rust 绑定 | ❌ macOS only |

### E.3 逐任务替代分析

#### 图像超分 (Real-ESRGAN)

| 替代候选 | 可行性 | 理由 |
|---------|--------|------|
| ONNX 内升级 (HAT/DAT) | ✅ 推荐 | 新模型全部支持 ONNX 导出，管线无需改动 |
| candle | ❌ | 无现成超分实现，CNN/GAN 支持弱 |
| wgpu compute shader | ❌ | 需逐层手写 shader，不实际 |
| 多模态 LLM | ❌ | 无法做像素级操作 |
| Cloud API (Replicate) | ✅ 备用 | 延迟 2-10s vs ONNX <500ms |
| **结论** | **ONNX 不可替代** | 可在 ONNX 内升级到 HAT/DAT |

#### 图像降噪 (SCUNet)

| 替代候选 | 可行性 | 理由 |
|---------|--------|------|
| ONNX 内升级 (Restormer/NAFNet) | ✅ 推荐 | 同上 |
| candle / burn | ❌ | 无现成降噪实现 |
| Cloud API | ✅ 备用 | 延迟 2-5s |
| **结论** | **ONNX 不可替代** | |

#### 图文匹配 (CLIP)

| 替代候选 | 可行性 | 理由 |
|---------|--------|------|
| ONNX 内升级 (SigLIP) | ✅ 推荐 | 精度↑15%，有 ONNX 导出 |
| candle CLIP | ✅ 可行 | 纯 Rust，消除 ORT dylib (~50MB) |
| Jina CLIP v2 API | ✅ 批量查询 | $0.02/1M tokens |
| Ollama embedding | ❌ | 无图像嵌入能力 |
| **结论** | **ONNX 可用，candle 是唯一可行替代** | 迁移优先级低 |

#### 语音识别 (Whisper)

| 替代候选 | 可行性 | 理由 |
|---------|--------|------|
| ONNX 内升级 (Distil-Whisper) | ✅ 推荐 | 6x 加速，精度接近 |
| whisper-rs (whisper.cpp) | ✅ 最优 | Metal 性能 2-3x 优于 ORT |
| candle-whisper | ✅ 可行 | 纯 Rust，无 C++ 依赖 |
| Cloud API (AssemblyAI) | ✅ 批量 | 实时字幕延迟不可接受 |
| **结论** | **whisper-rs 是最强替代候选** | 迁移 ROI 需评估 |

### E.4 新增候选模型（扩展 ONNX 清单）

| 模型 | 任务 | ONNX 支持 | 受益场景 | 优先级 |
|------|------|----------|---------|--------|
| SAM 2 / EfficientSAM | 图像分割 | ✅ | 背景移除、puppet 图层分离 | P1 |
| Depth Anything V2 | 深度估计 | ✅ (HF 预导出) | 2D→3D 转换、视差效果 | P1 |
| MediaPipe Face Mesh | 人脸关键点 | ✅ (TFLite→ONNX) | AI 捏脸 (478 点 + 52 blendshapes) | P1 |
| RTMPose / DWPose | 姿态估计 | ✅ | puppet 骨骼绑定 | P2 |
| SigLIP | 图文匹配 | ✅ | 替换 CLIP (精度↑) | P2 |
| Distil-Whisper v3.5 | 语音识别 | ✅ | 替换 Whisper (速度 6x↑) | P2 |
| Florence-2 | 统一视觉 | ✅ | OCR/检测/描述多合一 | P3 |
| RIFE / IFNet | 视频插帧 | ✅ | neko-cut 慢动作 | P3 |

### E.5 范式分析：多模态 LLM 能否吞噬 ONNX 任务？

| 能力 | GPT-4o / Claude / Gemini 2.0 | 能替代 ONNX？ |
|------|------------------------------|---------------|
| 图像理解 + 描述 | ✅ 极强 | ❌ ≠ 像素操作 |
| 图像生成 | ✅ (GPT-4o native image) | ❌ ≠ 超分/降噪 |
| 音频理解 | ✅ (Gemini native audio) | ⚠️ 非实时 1-3s |
| 语义搜索 | ✅ (embedding API) | ❌ 无 image embedding |

**结论**：多模态 LLM 永远不能替代 ONNX 的信号处理任务——两者在不同计算域（信号处理 vs 语义推理）。

### E.6 推荐策略

```
                    2026 neko-engine ML 推理策略

  ┌─ 继续 ONNX (不可替代) ──────────────────────────────────┐
  │  ✅ 超分 (ESRGAN → HAT/DAT 升级)                        │
  │  ✅ 降噪 (SCUNet → Restormer 升级)                       │
  │  ✅ CLIP (升级到 SigLIP, 更高精度)                        │
  │  ✅ 新增: SAM 2 / Depth Anything / Face Mesh              │
  └──────────────────────────────────────────────────────────┘

  ┌─ 可考虑迁移 ─────────────────────────────────────────────┐
  │  ⚠️ Whisper → whisper-rs (whisper.cpp)                    │
  │     Metal 性能 2-3x，支持 distil-whisper                   │
  │  ⚠️ CLIP → candle CLIP                                     │
  │     消除 ORT dylib (~50MB)                                  │
  │  ⚠️ 紧急方案: ort-tract 后端                                │
  │     消除 ORT dylib 同时保持 ort API 不变 (CPU only)         │
  └──────────────────────────────────────────────────────────┘

  ┌─ 不可替代 ───────────────────────────────────────────────┐
  │  ❌ 超分/降噪无 Rust 原生替代 (candle/burn 均无)           │
  │  ❌ 多模态 LLM 无法做信号处理任务                           │
  │  ❌ Cloud API 延迟不满足实时/高频场景                       │
  └──────────────────────────────────────────────────────────┘
```

### E.7 结论

| 问题 | 答案 |
|------|------|
| ONNX 整体可被替代？ | **否** — 2026 无单一框架覆盖 ORT 的模型广度 + GPU EP |
| 个别任务可迁移？ | **是** — Whisper → whisper-rs, CLIP → candle |
| 应该替换？ | **不急** — 优先在 ONNX 内升级模型 (HAT/SigLIP/Distil-Whisper) |
| candle 何时接管？ | 当支持 CNN/GAN 且性能 ≥ ORT 时 — 预计 2027+ |
| 应该做什么？ | ① ONNX 内升级模型 ② 新增 SAM/Depth/FaceMesh ③ 观察 candle/whisper-rs |

Sources:
- [candle v0.9.3](https://github.com/huggingface/candle)
- [burn v0.20 CubeCL](https://www.phoronix.com/news/Burn-0.20-Released)
- [tract — Sonos ONNX inference](https://github.com/sonos/tract)
- [ort alternative backends (tract)](https://ort.pyke.io/backends)
- [whisper-rs](https://crates.io/crates/whisper-rs)
- [mlx-rs v0.25.3](https://github.com/oxideai/mlx-rs)
- [Distil-Whisper v3.5](https://huggingface.co/distil-whisper/distil-large-v3.5)
- [SigLIP ONNX export](https://deepwiki.com/deepghs/realutils/7.4-siglip-model-export)
- [Depth Anything V2 ONNX](https://huggingface.co/onnx-community/depth-anything-v2-small)
- [EfficientSAM ONNX](https://github.com/yformer/EfficientSAM)
