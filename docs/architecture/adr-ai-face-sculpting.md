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
- [SAM VRAM Issues](https://github.com/facebookresearch/segment-anything/issues/78)
