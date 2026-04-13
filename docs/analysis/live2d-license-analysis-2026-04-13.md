# Live2D 开源方案许可证与可行性分析

> Date: 2026-04-13
> Status: Analysis Complete
> Related ADR: ADR-2D-001 (Live2D rejected)

## 1. 背景

neko-puppet 当前仅支持 Inochi2D (.inp) 格式（BSD 2-Clause，via `inox2d` crate）。本文评估为 neko-puppet 添加 Live2D (.moc3) 模型导入的可行路径及许可证风险。

---

## 2. 开源 Rust 方案评估

### 2.1 live2d-parser（crates.io）

| 项目 | 详情 |
|------|------|
| 地址 | https://crates.io/crates/live2d-parser |
| 许可证 | **MPL-2.0** |
| 能力 | 纯 Rust 解析 .moc3 / .model3.json / .moc，支持 Cubism 2.0/3.0/4.0 |
| 渲染 | 无（仅解析器） |
| 依赖 | 零 FFI，纯 Rust |
| 风险 | **低。** MPL-2.0 文件级 copyleft — 修改 parser 源码的文件需开源，项目其他代码不受影响 |
| 结论 | **可直接使用** |

### 2.2 moc3-rs（MahouTechnologies）

| 项目 | 详情 |
|------|------|
| 地址 | https://github.com/MahouTechnologies/moc3-rs |
| 许可证 | **未声明**（GitHub 无 LICENSE 文件） |
| 能力 | .moc3 解析 + wgpu 渲染，clean-room 实现（基于 OpenL2D 逆向规格） |
| 状态 | 目标 moc3 v4.2，缺少 Parts 支持，6 star / 1 fork，不成熟 |
| 风险 | **高。** 无许可证 = 默认全部权利保留，法律上不可使用 |
| 结论 | **不可使用**，除非作者后续添加兼容许可证 |

### 2.3 vtubing/moc3

| 项目 | 详情 |
|------|------|
| 地址 | https://github.com/vtubing/moc3 |
| 能力 | .moc3 二进制读取 |
| 状态 | 轻量级，社区项目 |
| 结论 | 需确认许可证后评估 |

---

## 3. Live2D 官方 SDK 许可证分析

Live2D SDK 分两层架构，许可证截然不同：

### 3.1 Cubism Framework（"开源"层）

- **许可证**: [Live2D Open Software License](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html)
- **源码在 GitHub**: [CubismNativeFramework](https://github.com/Live2D/CubismNativeFramework)
- **功能**: JSON 解析、物理模拟、动作/表情逻辑、模型管理

**关键限制**:
| 条款 | 内容 |
|------|------|
| Section 5.1 | 不可修改、移植、改编、翻译软件 |
| Section 5.6 | **明确禁止与 "excluded license" 组合** — 即禁止与 MIT/Apache/GPL 等允许源码修改和再发布的许可证组合 |
| Section 5.2 | 不可子许可、转让权利 |
| Section 5.7 | 衍生作品不可使用竞争产品 |
| Section 2.2 | 再发布仅限集成在衍生作品中分发给最终用户 |

**结论**: **名为"开源"，实非开源。不兼容任何标准开源许可证，不可用于 neko-suite。**

### 3.2 Cubism Core（闭源层）

- **许可证**: [Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)
- **形态**: 闭源二进制 blob（负责 .moc3 mesh 变形计算的核心引擎）
- **发布**: 需签 [Publication License Agreement](https://www.live2d.com/en/sdk/license/)

**免费条件**:
| 条件 | 详情 |
|------|------|
| 个人/小规模企业 | 年营收 < 1000 万日元（约 50 万 RMB）可免费 |
| Expandable Application | **需单独审批**，即使小规模企业也不例外 |

**Expandable Application 定义**: "具有显著可扩展性的服务或内容"。**VTuber 追踪软件明确列为此类别**。neko-puppet 作为 2D puppet 动画/VTuber 工具，几乎必然触发此条款。

**结论**: **闭源 + Expandable Application 审批要求 = 不可用于 neko-suite。ADR-2D-001 的拒绝决策正确。**

---

## 4. 与 Inochi2D 的关系

### 4.1 能否替代 Inochi2D？

**不能替代，但可并存。**

| 维度 | Inochi2D (.inp) | Live2D (.moc3) |
|------|-----------------|----------------|
| 许可证 | BSD 2-Clause，完全自由 | 官方 SDK 不兼容开源 |
| Rust 生态 | `inox2d`（已集成） | `live2d-parser`（MPL-2.0，仅解析） |
| 编辑器 | Inochi Creator（开源） | Cubism Editor（商业软件） |
| 格式开放性 | 完全开放 | 二进制格式，社区逆向（OpenL2D） |
| 生态规模 | 成长中 | 成熟（VTube Studio 等大量工具） |
| 功能成熟度 | 功能完整但工具链年轻 | 10+ 年迭代，功能丰富 |

### 4.2 用户模型来源

大量 VTuber 用户已有 Live2D 模型资产（通过 Cubism Editor 制作），导入 .moc3 的需求真实存在。但无法要求用户重新用 Inochi Creator 制作。

---

## 5. 推荐实现策略

### 架构：live2d-parser + 自研变形引擎

```
.moc3 文件
  │
  ▼
live2d-parser (MPL-2.0)
  ├── 解析 Parameters (ID/min/max/default)
  ├── 解析 Parts (visibility groups)
  ├── 解析 Drawables (vertices/UVs/indices/draw order)
  ├── 解析 Deformers (warp grid/rotation pivot)
  └── 解析 Key Forms (parameter → vertex positions)
  │
  ▼
自研 Key Form 插值引擎 (基于 OpenL2D 公开规格)
  ├── 1D 参数插值：线性插值两个包围 key form 的顶点位置
  └── 2D 参数插值：双线性插值 key form 网格
  │
  ▼
现有 ECS 组件 (格式无关)
  ├── PuppetParameters → 参数定义
  ├── MeshData → 静态网格
  ├── MultiKeyDeformation → 多关键帧变形 (新增)
  ├── DeformedVertices → 变形后顶点
  └── AnimationClip → 动画曲线
  │
  ▼
复用现有渲染管线
  └── PuppetCanvas.tsx (Canvas 2D textured triangles)
```

### 优势

- **零许可证风险**: 不使用任何 Live2D 官方组件
- **MPL-2.0 合规**: live2d-parser 的文件级 copyleft 不影响项目其他代码
- **ADR-2D-001 不变**: 拒绝 Cubism SDK 的决策继续有效
- **渲染管线复用**: 下游 PuppetSnapshot/DeformedMesh 类型不变
- **两格式并存**: .inp（Inochi2D）为默认，.moc3 为可选导入

### 辅助文件支持

| 文件 | 来源 | 处理方式 |
|------|------|---------|
| `.model3.json` | Live2D 导出 | 解析清单获取文件引用 |
| `.exp3.json` | 表情 | 转为参数覆盖 + crossfade |
| `.motion3.json` | 动作 | 转为 AnimationClip（采样 Bezier 段为线性关键帧） |
| `.physics3.json` | 物理 | 转为现有 SimplePhysics 组件 |
| 纹理 (PNG) | 外部文件 | 直接加载（非 INP 嵌入式） |

---

## 6. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| `live2d-parser` 不支持新版 MOC3 (v5+) | 中 | MPL-2.0 可 fork 扩展；OpenL2D 规格可补充 |
| Key Form 插值精度不足 | 中 | 用真实 .moc3 模型对比 VTube Studio 渲染结果 |
| 2D 参数绑定（双轴变形）复杂度高 | 中 | Phase 1 仅支持 1D，Phase 2 补充双线性插值 |
| Bezier motion 曲线精度 | 低 | 30fps 采样为线性关键帧，视觉差异可忽略 |
| OpenL2D 逆向规格不完整 | 低 | 社区活跃，持续补充中 |

---

## 7. 参考资料

- [Live2D SDK License](https://www.live2d.com/en/sdk/license/)
- [Live2D Open Software License (Full Text)](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html)
- [Live2D Proprietary License (Full Text)](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)
- [CubismNativeFramework LICENSE](https://github.com/Live2D/CubismNativeFramework/blob/develop/LICENSE.md)
- [live2d-parser crate](https://crates.io/crates/live2d-parser)
- [moc3-rs](https://github.com/MahouTechnologies/moc3-rs/)
- [OpenL2D MOC3 Spec](https://rentry.co/moc3spec)
- [CubismSpecs model3.json](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md)
