# Step 2: ComputeService — 消除 TS 端重复计算 完成报告

## 执行时间

2026-02-09

## 提交历史

```
84aa45d S2-P3: 色彩校正参数对齐引擎，创建UI↔Engine映射函数
71b6e01 S2-P2: 引入CENTERED_TRANSFORM，消除deprecated DEFAULT_TRANSFORM引用
cbcf6c6 S2-P0+P1: 缓动函数+关键帧插值去重，统一使用@neko/shared
```

---

## 各阶段详情

### S2-P0+P1: 缓动函数 + 关键帧插值去重

**目标**：消除 webview 中 3 份重复的缓动/插值代码，统一使用 `@neko/shared`

**修改文件**：

| 文件 | 变化 | 说明 |
|------|------|------|
| `neko-types/src/index.ts` | +3行 | 添加 `export * from './utils/index'`，使 `@neko/shared` 导出工具函数 |
| `webview/utils/animation.ts` | 444→214行 (-230) | 删除本地 13 种缓动函数、cubicBezier、getAnimatedValue、getComputedTransform，改为从 `@neko/shared` re-export |
| `webview/utils/shapeAnimation.ts` | 364→244行 (-120) | 删除本地 13 种缓动函数副本，`interpolateProperty` 委托给 `@neko/shared`（O(n)→O(log n)） |
| `webview/types/animation.ts` | +33行 | `EASING_TYPE_I18N_KEYS` 从 14 种扩展到 34 种，覆盖所有 EasingType |

**关键改进**：
- 消除 ~350 行重复代码
- shapeAnimation 的关键帧查找从 O(n) 线性搜索升级为 O(log n) 二分查找
- 修复预存类型错误（EASING_TYPE_I18N_KEYS 不完整）

---

### S2-P2: 坐标系统统一（最小化安全改动）

**目标**：消除 deprecated `DEFAULT_TRANSFORM` 引用，引入语义明确的 `CENTERED_TRANSFORM`

**背景分析**：

发现整个系统的坐标约定比预期复杂：
- TS 端 `x, y` 是**归一化坐标 (0-1)**，`0.5` = 画面中心
- 传给引擎时由 `JviProjectLoader` 乘以分辨率转为像素
- 引擎 `Transform::default()` 是 `x=0, y=0`（左上角）
- 引擎也有 `Transform::centered()` 返回 `anchor_x=0.5, anchor_y=0.5`
- `MediaProcessorService.ts` 内部 fallback 不一致（有的用 `0`，有的用 `0.5`）

**决策**：不做坐标值变更（避免元素位置跳变），只做符号替换。

**修改文件**：

| 文件 | 变化 | 说明 |
|------|------|------|
| `neko-types/types/transform.ts` | +17行 | 新增 `CENTERED_TRANSFORM` 常量（x=0.5, y=0.5, anchor=0.5），`DEFAULT_TRANSFORM` 改为其别名 |
| `TimelineToolExecutor.ts` | 3处替换 | `DEFAULT_TRANSFORM` → `CENTERED_TRANSFORM` |
| `TimelineToolExecutor.test.ts` | 5处替换 | `DEFAULT_TRANSFORM` → `CENTERED_TRANSFORM` |
| `webview/types.ts` | +1行 | 添加 `CENTERED_TRANSFORM` re-export |

**行为零变更**：所有运行时值保持不变。

**Transform 常量对照表**：

| 常量 | x | y | anchorX | anchorY | 语义 | 对应引擎 |
|------|---|---|---------|---------|------|----------|
| `ENGINE_DEFAULT_TRANSFORM` | 0 | 0 | 0 | 0 | 左上角原点 | `Transform::default()` |
| `CENTERED_TRANSFORM` | 0.5 | 0.5 | 0.5 | 0.5 | 画面中心 | `Transform::centered()` |
| `DEFAULT_TRANSFORM` (deprecated) | 0.5 | 0.5 | 0.5 | 0.5 | → `CENTERED_TRANSFORM` 别名 | — |

---

### S2-P3: 色彩校正参数对齐

**目标**：对齐 `ColorCorrectionParams` 与引擎 `JsEffectParams`，创建 UI↔Engine 映射函数

**参数对齐**：

`ColorCorrectionParams` 从 6 个参数扩展到 13 个：

| 参数 | 旧状态 | 新状态 | 引擎范围 |
|------|--------|--------|----------|
| brightness | ✅ 已有 | ✅ | -1.0 ~ 1.0 |
| contrast | ✅ 已有 | ✅ | 0.0 ~ 2.0 (1.0=不变) |
| saturation | ✅ 已有 | ✅ | 0.0 ~ 2.0 (1.0=不变) |
| exposure | ✅ 已有(±2.0) | ✅ 修正为 ±3.0 | -3.0 ~ 3.0 |
| gamma | ✅ 已有 | ✅ | 0.1 ~ 3.0 |
| hue → hueShift | ✅ 已有(命名不同) | ✅ 重命名 | -180 ~ 180 |
| vibrance | ❌ 缺失 | ✅ 新增 | -1.0 ~ 1.0 |
| temperature | ❌ 缺失 | ✅ 新增 | -100 ~ 100 |
| tint | ❌ 缺失 | ✅ 新增 | -100 ~ 100 |
| highlights | ❌ 缺失 | ✅ 新增 | -1.0 ~ 1.0 |
| shadows | ❌ 缺失 | ✅ 新增 | -1.0 ~ 1.0 |
| whites | ❌ 缺失 | ✅ 新增 | -1.0 ~ 1.0 |
| blacks | ❌ 缺失 | ✅ 新增 | -1.0 ~ 1.0 |

**映射函数**：

```typescript
// UI → Engine
mapBasicColorToEngine(basic: BasicColorAdjustment): ColorCorrectionParams
// 处理语义差异：
//   brightness: ÷100
//   contrast:   (value/100) + 1.0  (偏移量→乘数)
//   saturation: (value/100) + 1.0  (偏移量→乘数)
//   vibrance/highlights/shadows/whites/blacks: ÷100

// Engine → UI
mapEngineColorToBasic(params: ColorCorrectionParams): BasicColorAdjustment
// 反向映射，UI-only 字段 (clarity, dehaze) 设为 0
```

**修改文件**：

| 文件 | 变化 | 说明 |
|------|------|------|
| `neko-types/types/mediaEngine/effects.ts` | 重写 ColorCorrectionParams | 6→13 参数，对齐引擎 |
| `neko-types/utils/colorCorrectionMapping.ts` | 新增 | 双向映射函数 |
| `neko-types/utils/index.ts` | +5行 | 导出映射函数 |

---

## 编译状态

| 阶段 | webview tsc 错误数 | 变化 |
|------|-------------------|------|
| Step 1 完成后 | 112 | 基准 |
| S2-P0+P1 后 | 109 | -3（修复 EASING_TYPE_I18N_KEYS） |
| S2-P2 后 | 109 | 不变 |
| S2-P3 后 | 109 | 不变 |

所有 109 个错误均为预存错误（ShapeElement.shapes 不存在、SubtitleElement.cues 不存在等）。

---

## 架构改进总览

```
Before (Step 1 完成时):
├── webview/utils/animation.ts      — 444行，含13种缓动函数（重复）
├── webview/utils/shapeAnimation.ts  — 364行，含13种缓动函数（重复）
├── neko-types/utils/animation.ts    — 348行，30种缓动（权威源）
├── ColorCorrectionParams            — 6个参数（严重缺失）
├── DEFAULT_TRANSFORM                — deprecated 但仍在使用
└── 无 UI↔Engine 色彩校正映射

After (Step 2 完成):
├── webview/utils/animation.ts      — 214行，re-export @neko/shared ✅
├── webview/utils/shapeAnimation.ts  — 244行，委托 @neko/shared ✅
├── @neko/shared                     — 唯一缓动/插值源 ✅
├── ColorCorrectionParams            — 13个参数，完全对齐引擎 ✅
├── CENTERED_TRANSFORM               — 语义明确，替代 deprecated ✅
└── mapBasicColorToEngine()          — 双向映射，处理语义差异 ✅

代码量变化: -350行重复代码, +136行映射代码
净减: ~214行
```

---

## 遗留事项

### 坐标系统（需要更大范围重构）

| 位置 | 问题 | 优先级 |
|------|------|--------|
| `MediaProcessorService.ts` L1461 | fallback 用 `x ?? 0`（左上角） | P1 |
| `MediaProcessorService.ts` L1589 | fallback 用 `x ?? 0.5`（中心） | P1 |
| `JviProjectLoader.ts` L255 | 归一化→像素转换在 Loader 中 | P2 |

### 色彩校正（需改 Rust 端）

| 功能 | UI 层 | 引擎 Shader | 引擎参数暴露 | 状态 |
|------|-------|-------------|-------------|------|
| Basic 13参数 | ✅ | ✅ | ✅ | ✅ 已对齐 |
| Curves | ✅ 5通道 | ❌ | ❌ | ❌ 引擎不支持 |
| HSL 分色 | ✅ 8色相 | ✅ shader 函数存在 | ❌ 未暴露 | ⚠️ 需改 Rust |
| Color Wheels | ✅ 4区域 | ✅ shader 函数存在 | ❌ 未暴露 | ⚠️ 需改 Rust |
| LUT | ✅ | ❌ | ❌ | ❌ 引擎不支持 |
| clarity/dehaze | ✅ | ❌ | ❌ | ❌ 引擎不支持 |
| Vignette | ✅ | ✅ | ✅ (独立接口) | ⚠️ 参数命名/范围不同 |

---

## 下一步建议

1. **Step 3: 修复预存 tsc 错误**（109个）— 使 webview 编译通过
2. **扩展引擎 EffectParams**（Rust 端）— 暴露 HSL/ColorWheels 参数
3. **坐标系统全面统一** — 统一 MediaProcessorService 中的 fallback 值
