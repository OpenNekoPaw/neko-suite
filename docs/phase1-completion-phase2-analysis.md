# Phase 1 完成报告 + Phase 2 任务分析

> 日期：2026-03-13
> 范围：neko-model 3D 编辑器 Phase 1 → Phase 2 过渡

---

## 📊 Phase 1 完成情况

### 实现内容

**后端（native-scene crate）**：

| 模块 | 完成项 | 测试 |
|------|--------|------|
| **components.rs** | Camera（Perspective + Orthographic）、MorphWeights | ✅ |
| **loader.rs** | glTF keyframe 提取、正交相机、Skeleton joints 两遍扫描、IBM 读取 | ✅ 5 tests |
| **systems.rs** | MorphWeights 动画应用 | ✅ 3 tests |
| **world.rs** | SceneDelta 加入 updated_morph_weights | ✅ 2 tests |

**测试覆盖**：12 个单元测试全部通过

```bash
running 12 tests
test result: ok. 12 passed; 0 failed; 0 ignored
```

### 技术亮点

1. **glTF 关键帧提取**：
   - 使用 `channel.reader(|buf| ...)` API 从 buffer 读取实际数据
   - 支持 Translations/Rotations/Scales/MorphTargetWeights 四种输出类型
   - Rotations 自动归一化为 `[f32; 4]` 四元数
   - Duration 从各 channel 最大时间戳计算

2. **Skeleton 两遍扫描**：
   - Pass 1：`spawn_node` 递归建立 `node_entity_map`
   - Pass 2：遍历 `document.nodes()`，解析 skin → 填充 `joint_entities`
   - 解决了 joint 节点可能在树中任意位置的问题

3. **IBM 读取**：
   - 直接从 glTF buffer 读取 MAT4（little-endian f32 × 16）
   - 支持 stride（interleaved layouts）
   - 无 accessor 时降级为 identity matrices（符合 glTF 规范）

4. **相机投影重构**：
   - `CameraProjection` enum 替代原有 `fov`/`aspect_ratio` 字段
   - 统一 `near`/`far` 参数
   - 向后兼容（`world.rs` 仅检查 camera 存在性）

5. **MorphWeights 动画**：
   - `morph_count = values.len() / n_frames` 动态计算
   - 按帧索引 slice 出当前权重
   - 自动插入或更新 `MorphWeights` component

---

## 🎯 Phase 2 任务分析

### 优先级矩阵

| 任务 | 复杂度 | 依赖 | 产品价值 | 优先级 |
|------|--------|------|----------|--------|
| **延迟测试工具** | 低 | 无 | 高（决策门） | 🔴 P0 |
| **参数化面部编辑器（前端）** | 中 | 延迟测试 | 极高 | 🔴 P0 |
| **Morph Target 驱动捏脸** | 低 | 面部编辑器 | 极高 | 🔴 P0 |
| **VRM 表情预设** | 低 | 面部编辑器 | 高 | 🟡 P1 |
| **AI MCP Tools** | 中 | 面部编辑器 | 极高 | 🟡 P1 |
| **CSG 布尔运算（后端）** | 高 | 无 | 中 | 🟢 P2 |
| **3D 文字挤出（后端）** | 中 | cosmic-text | 中 | 🟢 P2 |
| **参数化几何体生成** | 低 | 无 | 中 | 🟢 P2 |
| **JPEG 单帧模式** | 中 | 延迟测试 | 低（备选） | 🟢 P2 |

### 关键路径（Critical Path）

```
延迟测试工具（RTT 实测）
    │
    ├─ < 15ms → 方案 A（H.264 流）→ 继续开发
    ├─ 15-30ms → 方案 B（JPEG 单帧）→ 实现 JPEG 模式
    └─ > 30ms → 方案 C（R3F 双渲染）→ 架构调整
    │
    ▼
参数化面部编辑器（R3F 视口 + 滑块面板）
    │
    ├─ 脸型（脸宽/脸长/颧骨/下巴）
    ├─ 眼睛（眼距/眼大小/眼角/双眼皮）
    ├─ 鼻子（鼻高/鼻宽/鼻尖/鼻翼）
    ├─ 嘴巴（嘴宽/唇厚/嘴角/唇弓）
    └─ 眉毛（眉距/眉高/眉粗/眉弯）
    │
    ▼
Morph Target 驱动（50+ Blend Shapes）
    │
    ├─ 滑块拖拽 → 实时更新 Blend Shape 权重（< 1ms）
    ├─ 随机/重置按钮
    └─ AI 生成按钮（调用 MCP Tools）
    │
    ▼
AI MCP Tools 集成
    │
    ├─ face.generate_params（文本 → 参数向量）
    ├─ face.from_image（图片 → 参数向量）
    └─ face.adjust（自然语言微调）
```

### 实施建议

**Sprint 1（1-2 周）：延迟验证 + 面部编辑器骨架**

1. **延迟测试工具**（2 天）
   - 前端：WebSocket 连接 + 时间戳打点
   - 后端：`/v1/scenes/render_frame` 端点（返回 H.264 帧 + 时间戳）
   - 测量：RTT = (前端收到时间 - 前端发送时间) - (后端处理时间)
   - 输出：决策报告（方案 A/B/C）

2. **面部编辑器 UI 骨架**（3 天）
   - R3F 视口（复用 Phase 1 代码）
   - 分类滑块面板（5 个分类 × 4-5 个参数 = 20-25 个滑块）
   - Zustand store（`faceParams: Record<string, number>`）
   - 随机/重置按钮

3. **Morph Target 驱动**（2 天）
   - Three.js `mesh.morphTargetInfluences` 绑定
   - 滑块 onChange → 更新 morph weights
   - 实时预览（< 1ms 延迟）

**Sprint 2（1-2 周）：VRM 表情 + AI 集成**

4. **VRM 表情预设**（2 天）
   - `@pixiv/three-vrm` 加载器集成
   - 52 个标准表情 UI（下拉菜单 + 预览）
   - 表情 → Blend Shape 映射

5. **AI MCP Tools**（3-5 天）
   - `face.generate_params`：LLM 文本 → 参数向量（JSON）
   - `face.from_image`：图片上传 → 面部识别 → 参数向量
   - `face.adjust`：自然语言微调（"眼睛再大一点" → delta weights）
   - neko-agent MCPManager 注册

**Sprint 3（可选，按需）：建模工具**

6. **CSG 布尔运算**（5-7 天）
   - 三角网格 Boolean（Union/Difference/Intersection）
   - 可选库：`manifold3d` / `libigl` / 自实现
   - 前端 UI：选择两个对象 + 操作类型

7. **3D 文字挤出**（3 天）
   - `cosmic-text` 文本 → 轮廓
   - 挤出算法（沿 Z 轴拉伸 + 侧面三角化）
   - 前端 UI：文本输入 + 挤出深度滑块

8. **参数化几何体**（2 天）
   - 立方体/球体/圆柱/圆环/平面
   - 参数面板（尺寸/分段数）

---

## 🚧 技术风险与缓解

### 风险 1：H.264 流延迟 > 30ms

**影响**：方案 A 不可用，需切换到方案 B 或 C

**缓解**：
- 优先实现延迟测试工具（Sprint 1 第一项）
- 如果 RTT > 30ms，立即启动方案 B（JPEG 单帧模式）
- 方案 C（R3F 双渲染）作为最后备选

### 风险 2：Morph Target 数量不足

**影响**：50 个 Blend Shapes 可能无法覆盖所有面部变化

**缓解**：
- 使用 VRM 标准模型（52 个表情预设）
- 支持用户自定义 Blend Shapes（Phase 3）
- AI 生成时插值多个 Blend Shapes 组合

### 风险 3：AI MCP Tools 响应慢

**影响**：`face.generate_params` 可能需要 5-10 秒

**缓解**：
- 前端显示加载动画
- 支持取消操作（AbortController）
- 缓存常见描述（"圆脸大眼" → 预设参数）

### 风险 4：CSG 布尔运算性能

**影响**：复杂网格（10K+ 三角形）可能卡顿

**缓解**：
- 使用 `manifold3d`（GPU 加速）
- 限制输入网格复杂度（< 5K 三角形）
- 后台线程计算（不阻塞 UI）

---

## 📈 成功指标

### Phase 2 完成标准

| 指标 | 目标 | 验证方式 |
|------|------|----------|
| **延迟** | H.264 流 RTT < 20ms | 延迟测试工具实测 |
| **交互性** | 滑块拖拽 → 预览 < 50ms | 用户体验测试 |
| **AI 响应** | `face.generate_params` < 10s | 性能测试 |
| **表情覆盖** | 支持 52 个 VRM 标准表情 | 功能测试 |
| **参数数量** | 20-25 个面部参数 | 功能测试 |

### 产品价值验证

- **用户故事 1**：用户输入"圆脸大眼"，AI 生成对应角色，< 15 秒完成
- **用户故事 2**：用户拖拽滑块调整眼距，实时预览，< 50ms 延迟
- **用户故事 3**：用户上传照片，AI 生成相似角色，< 20 秒完成

---

## 🔗 相关文档

- [3D 能力集成架构分析](../../../docs/architecture/3d-capability-analysis.md)
- [TODO.md](../../../TODO.md)
- [native-scene README](../packages/neko-engine/packages/native-scene/README.md)

---

*生成时间：2026-03-13*
